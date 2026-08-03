// queue-processor/index.ts
// Supabase Edge Function — Main AI Pipeline
// Called by QStash after webhook-meta enqueues a message
//
// Pipeline (PRD Section 3.1 Steps 4-8.5):
//   1. QStash signature verify
//   2. Upsert customer
//   3. isLockedForAI check → human queue if locked
//   4. Acquire conversation lock (30s distributed lock)
//   5. 24-hour messaging window check
//   6. SpamGuard
//   6.5. Required pre-order field gate (if order intent)
//   7. AI Engine (Gemini + hybrid RAG)
//   8. Save messages to DB
//   8.5. WooCommerce order push
//   9. Schedule follow-up job via QStash

import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import {
  acquireConversationLock,
  qstashPublish,
  releaseConversationLock,
  verifyQStashSignature,
} from "../_shared/upstash.ts";
import {
  addToHumanQueue,
  createFollowUpJob,
  createOrder,
  getConversationHistory,
  hasFollowUpSentToday,
  lockConversationForAI,
  saveMessage,
  setConversationStatus,
  updateOrderWooSync,
  upsertConversation,
  upsertCustomer,
  getBusinessSettings,
  getSupabaseClient,
} from "../_shared/supabase-client.ts";
import { runSpamGuard } from "../_shared/spamguard.ts";
import { runAI } from "../_shared/gemini.ts";
import {
  pushOrderToWooCommerce,
  requiredFieldGate,
} from "../_shared/woocommerce.ts";
import {
  sendImageMessage,
  sendTextMessage,
  sendVideoMessage,
} from "../_shared/platform-send.ts";
import type { Platform, QueuePayload } from "../_shared/types.ts";

const FOLLOWUP_HANDLER_URL = () => Deno.env.get("FOLLOWUP_HANDLER_URL")!;
const WOO_RETRY_URL = () => Deno.env.get("WOO_RETRY_URL")!;

// ============================================================
// Check if Meta messaging window is still open
// FB/IG/WA: 24-hour window after customer's last message
// ============================================================
function isWindowOpen(windowExpiresAt?: string): boolean {
  if (!windowExpiresAt) return true; // No window set → assume open
  return new Date(windowExpiresAt) > new Date();
}

// ============================================================
// Main handler
// ============================================================
Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  // ── Step 1: Verify QStash signature
  const isValidQStash = await verifyQStashSignature(req.clone());
  if (!isValidQStash) {
    console.error("Invalid QStash signature — rejecting request");
    return errorResponse("Unauthorized", 401);
  }

  // Parse payload
  let payload: QueuePayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const {
    platform,
    platformId,
    customerName,
    mediaType,
    mediaUrl,
    platformMessageId,
    replyToMid,
  } = payload;
  let messageText = payload.text;

  console.log(`Processing: [${platform}] ${platformId} — "${messageText?.substring(0, 50)}"`);

  // ── Step 1.5: Fetch Profile Picture & Name
  let profilePic: string | undefined = undefined;
  let fetchedName: string | undefined = customerName;
  if (platform === "messenger" || platform === "instagram") {
    try {
      const { getMetaAccessToken } = await import("../_shared/platform-send.ts");
      const token = await getMetaAccessToken();
      if (token) {
        const fields = platform === "messenger" ? "first_name,last_name,profile_pic" : "name,username,profile_pic";
        const res = await fetch(`https://graph.facebook.com/v19.0/${platformId}?fields=${fields}&access_token=${token}`);
        if (res.ok) {
          const data = await res.json();
          if (data.profile_pic) profilePic = data.profile_pic;
          if (data.first_name || data.last_name) {
            fetchedName = [data.first_name, data.last_name].filter(Boolean).join(" ");
          } else if (data.name) {
            fetchedName = data.name;
          }
          console.log(`Fetched Meta profile info for ${platformId}: name="${fetchedName}", pic="${profilePic ? 'yes' : 'no'}"`);
        } else {
          console.error(`Meta profile fetch failed for ${platformId}:`, await res.text());
        }
      }
    } catch (err) {
      console.error("Failed to fetch profile info:", err);
    }
  }

  // ── Step 2: Upsert customer
  let customer;
  try {
    customer = await upsertCustomer(platform as Platform, platformId, fetchedName, profilePic);
  } catch (err) {
    console.error("upsertCustomer failed:", err);
    return errorResponse("Customer upsert failed", 500);
  }

  // ── Step 3: Upsert conversation
  let conversation;
  try {
    conversation = await upsertConversation(customer.id, platform as Platform);
  } catch (err) {
    console.error("upsertConversation failed:", err);
    return errorResponse("Conversation upsert failed", 500);
  }

  // Save incoming customer message to DB (regardless of further processing)
  await saveMessage({
    conversationId: conversation.id,
    role: "customer",
    content: messageText,
    mediaType,
    mediaUrl,
    platformMessageId,
  });

  // ── Reply-to Context: If customer replied to a specific AI image, inject product context
  // When a customer clicks "Reply" on a product image and asks "Price?", we need to tell
  // the AI exactly which product image they replied to.
  // ── Reply-to Context: If customer replied to a specific AI image or user image
  // When a customer clicks "Reply" on an image, we resolve the image URL or product context.
  let resolvedRepliedMediaUrl: string | undefined = undefined;
  if (replyToMid && !mediaType) {
    try {
      const sbCtx = getSupabaseClient();
      const cleanMid = replyToMid.replace(/^m_/, "");
      
      // 1. DB Lookup: check exact mid, m_ prefixed, and clean mid
      const { data: repliedMsgs } = await sbCtx
        .from("messages")
        .select("content, media_url, media_type, platform_message_id")
        .eq("conversation_id", conversation.id)
        .or(`platform_message_id.eq.${replyToMid},platform_message_id.eq.m_${cleanMid},platform_message_id.eq.${cleanMid},platform_message_id.ilike.%${cleanMid}%`)
        .limit(5);

      let foundContextNote: string | undefined = undefined;
      let foundMediaUrl: string | undefined = undefined;

      for (const msg of repliedMsgs ?? []) {
        if (msg.content?.includes("[PRODUCT_CONTEXT:")) {
          foundContextNote = msg.content;
          break;
        }
        if (msg.media_url && !foundMediaUrl) {
          foundMediaUrl = msg.media_url;
        }
      }

      if (foundContextNote) {
        const ctxMatch = foundContextNote.match(/\[PRODUCT_CONTEXT: ID=([^\|]+) \| Name=([^\|]+) \| Price=([^\|]+) \| Category=([^\]]+)\]/);
        if (ctxMatch) {
          const [, prodId, prodName, prodPrice] = ctxMatch;
          const replyContext = `[SYSTEM_INSTRUCTION: কাস্টমার আপনার পাঠানো "${prodName.trim()}" (দাম: ৳${prodPrice.trim()}) হেলমেটের ছবিটিতে সরাসরি Reply করে এই প্রশ্ন করেছে। তারা এই নির্দিষ্ট পণ্যটির ব্যাপারেই জিজ্ঞেস করছে। অন্য কোনো পণ্যের কথা বলবে না। detectedProductId = "${prodId.trim()}" হিসেবে সেট করো।]\n`;
          messageText = replyContext + (messageText || "");
          console.log(`Reply-to DB context injected: Product "${prodName.trim()}" (ID: ${prodId.trim()})`);
        }
      } else if (foundMediaUrl) {
        resolvedRepliedMediaUrl = foundMediaUrl;
        console.log(`Reply-to DB mediaUrl resolved: ${foundMediaUrl}`);
      }

      // 2. Fallback: if mid lookup didn't find an explicit match, search conversation history for the most recent message with media_url
      if (!foundContextNote && !resolvedRepliedMediaUrl) {
        const { data: recentMediaMsgs } = await sbCtx
          .from("messages")
          .select("media_url, content")
          .eq("conversation_id", conversation.id)
          .not("media_url", "is", null)
          .order("created_at", { ascending: false })
          .limit(1);

        if (recentMediaMsgs?.[0]?.media_url) {
          resolvedRepliedMediaUrl = recentMediaMsgs[0].media_url;
          console.log(`Reply-to fallback from history mediaUrl: ${resolvedRepliedMediaUrl}`);
        }
      }

      // 3. If an image URL was resolved for the replied message, set mediaUrl & mediaType to trigger Vector Search + Gemini Vision!
      if (resolvedRepliedMediaUrl) {
        mediaUrl = resolvedRepliedMediaUrl;
        mediaType = "image";
        console.log(`Set mediaUrl from replied message for Vector Search + Gemini Vision: ${mediaUrl}`);
      }
    } catch (replyCtxErr) {
      console.error("Reply-to context lookup failed:", replyCtxErr);
    }
  }

  // Update 24-hour messaging window (Meta allows replies within 24h of last message)
  const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { getSupabaseClient } = await import("../_shared/supabase-client.ts");
  const sb = getSupabaseClient();
  await sb
    .from("conversations")
    .update({ platform_window_expires_at: windowExpiry })
    .eq("id", conversation.id);

  // ── isLockedForAI check: if another human is handling this, skip AI
  if (conversation.isLockedForAI) {
    console.log(`Conversation ${conversation.id} locked for AI — human is handling`);
    return jsonResponse({ status: "locked_for_human" });
  }

  // ── Global AI Automation check: if admin turned OFF automation from frontend, skip AI
  const { data: bSettings } = await sb.from("business_settings").select("ai_reply_mode").limit(1).single();
  if (bSettings && bSettings.ai_reply_mode === "off") {
    console.log(`Global AI automation is turned OFF by admin from dashboard`);
    return jsonResponse({ status: "automation_disabled_by_admin" });
  }

  try {
    // ── Debounce (Batching)
    // Wait 3 seconds to allow rapid consecutive messages to be saved to DB
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // ── Step 4: Distributed conversation lock (30s)
    const lockAcquired = await acquireConversationLock(conversation.id);
    if (!lockAcquired) {
      console.log(`Could not acquire conversation lock for ${conversation.id} — concurrent processing`);
      // Return 429 so QStash retries this message automatically
      return new Response(JSON.stringify({ status: "concurrent_skip_retry" }), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      });
    }

    // ── Step 4.5: Check if already answered by a batched run
    const latestHistory = await getConversationHistory(conversation.id, 1);
    if (latestHistory.length > 0 && latestHistory[0].role !== "customer") {
      console.log(`Conversation ${conversation.id} already answered by previous batch`);
      await releaseConversationLock(conversation.id);
      return jsonResponse({ status: "already_answered" });
    }

    // ── Step 5: Check messaging window
    if (!isWindowOpen(conversation.platformWindowExpiresAt)) {
      console.log(`Messaging window closed for conversation ${conversation.id}`);
      await releaseConversationLock(conversation.id);
      return jsonResponse({ status: "window_closed" });
    }

    // ── Step 6: SpamGuard
    const history = await getConversationHistory(conversation.id, 10);
    const spamResult = await runSpamGuard(customer, messageText, history);

    if (spamResult.shouldBlock) {
      console.log(`SpamGuard blocked ${customer.id} (score: ${spamResult.score})`);
      await setConversationStatus(conversation.id, "spam_queue");
      await releaseConversationLock(conversation.id);
      return jsonResponse({ status: "spam_blocked" });
    }

    // ── Step 6.5: Image Embedding Match (New Vector Search)
    let preMatchedProductId: string | undefined = undefined;
    let candidateProducts: { id: string; name: string; imageUrl: string }[] | undefined = undefined;
    if (mediaType === "image" && mediaUrl) {
      try {
        console.log("Image received, executing vector similarity search...");
        let res: Response;
        if (platform === "whatsapp") {
          const { downloadMetaMedia, getMetaAccessToken } = await import("../_shared/platform-send.ts");
          const metaRes = await downloadMetaMedia(mediaUrl);
          res = await fetch(metaRes.url, { headers: { Authorization: `Bearer ${await getMetaAccessToken()}` } });
        } else {
          res = await fetch(mediaUrl);
        }
        const buffer = await res.arrayBuffer();
        const base64 = encodeBase64(buffer);
        let mimeType = res.headers.get("content-type") || "image/jpeg";
        if (!mimeType.startsWith("image/")) mimeType = "image/jpeg";

        const sb = getSupabaseClient();
        const { data: matchData, error: matchErr } = await sb.functions.invoke("image-match", {
          body: { base64, mimeType, threshold: 0.45, matchCount: 6 }
        });

        if (matchErr) throw matchErr;
        
        if (matchData?.success && matchData.matches?.length > 0) {
          const topMatch = matchData.matches[0];
          let isConfident = false;
          if (topMatch.similarity >= 0.88) {
            if (matchData.matches.length > 1) {
              const secondMatch = matchData.matches[1];
              // Mirrors and visors can have very similar embeddings (margin > 0.10). 
              // We must use a large margin (0.15) and high score (0.88) to ensure we don't confidently pick the wrong generic item.
              if (topMatch.similarity - secondMatch.similarity >= 0.15) {
                isConfident = true;
              } else {
                console.log(`Ambiguous: Top match (${topMatch.similarity}) is too close to second match (${secondMatch.similarity})`);
              }
            } else {
              isConfident = true;
            }
          }

          if (isConfident) {
             console.log(`Confirmed image match: ${topMatch.id} (Score: ${topMatch.similarity})`);
             preMatchedProductId = topMatch.id;
             messageText = `[SYSTEM_INSTRUCTION: Customer sent an image of a product. 
Target Product: ${topMatch.name} (Price: ৳${topMatch.sale_price || topMatch.regular_price})

HUMAN RESPONSE RULES:
1. Speak naturally like a real human shopkeeper. State the product name and price directly.
   Examples of how to reply:
   - "জি স্যার, এটি আমাদের ${topMatch.name}। এর দাম ৳${topMatch.sale_price || topMatch.regular_price}।"
   - "জি স্যার, চমৎকার এই ${topMatch.name} মডেলটির দাম ৳${topMatch.sale_price || topMatch.regular_price}।"

2. If the customer's photo is NOT an exact match of this product:
   - "স্যার, দুঃখিত আপনার পাঠানো এই নির্দিষ্ট মডেলটি আমাদের কাছে বর্তমানে নেই। তবে আমাদের কাছে ${topMatch.name} মডেলটি রয়েছে, দাম ৳${topMatch.sale_price || topMatch.regular_price}। আপনি কি এটি দেখতে চান?"] ` + (messageText || "");
          } else {
             // 0.70 to 0.88 range - ask for confirmation
             console.log(`Ambiguous matches found. Top score: ${topMatch.similarity}`);
             const optionsText = matchData.matches.map((m: any, i: number) => `- ${m.name} (Price: ৳${m.sale_price || m.regular_price}, Image URL: ${m.images?.[0] || 'None'})`).join("\n");
             
             // Extract candidate products (up to 6) to pass to Gemini Vision for flawless visual disambiguation
             candidateProducts = matchData.matches.slice(0, 6).map((m: any) => ({
                id: m.id,
                name: m.name,
                imageUrl: m.images?.[0]
             })).filter((c: any) => c.imageUrl);
             
             const instruction = `[SYSTEM_INSTRUCTION: 
Customer sent an image. We have a few similar options in stock:
${optionsText}

Speak naturally like a real human shopkeeper:
"স্যার, এই ধরনের প্রোডাক্টের আমাদের কাছে এই মডেলগুলো রয়েছে:"
Then list the names and prices naturally and ask: "আপনি কোনটি দেখতে বা নিতে চাচ্ছেন?"]`;

             messageText = instruction + "\n" + (messageText || "");

             // Save the context persistently in the user's message so AI remembers the image URLs in the next turns
             if (platformMessageId) {
               await sb.from("messages").update({
                 content: (payload.text || "") + "\n\n[HIDDEN_AMBIGUOUS_CONTEXT:\n" + optionsText + "\n]"
               }).eq("platform_message_id", platformMessageId);
             }
          }
        } else {
          console.log("No confident matches found from image embedding, falling back to Vision LLM...");
        }
      } catch (imgErr) {
        console.error("Image vector search failed, falling back to Vision LLM:", imgErr);
      }
    }

    // ── Step 6.7: Product Context Injection (2-Layer System)
    // Layer 1: reply_to.mid lookup (already done above at line ~154)
    // Layer 2: Fallback — scan conversation history ONLY when no specific reply_to reference
    //
    // ⚠️ IMPORTANT: Layer 2 must NOT run when replyToMid is present.
    // If the customer replied to a specific image (replyToMid exists), Layer 1 already tried the DB lookup.
    // If Layer 1 failed, it means we couldn't identify the exact product. Injecting the
    // "most recent" product from history would give the WRONG product (different from what was in the image).
    // Better to let the AI ask "which product?" than to confidently give wrong info.
    const shouldRunLayer2 = !preMatchedProductId && !mediaType && messageText && !messageText.includes("[SYSTEM_INSTRUCTION:");
    
    if (shouldRunLayer2) {
      try {
        // Get extended history to find PRODUCT_CONTEXT
        const fullHistory = await getConversationHistory(conversation.id, 20);
        
        // Find the most recent PRODUCT_CONTEXT in AI messages (scan in reverse = newest first)
        let lastCtxMatch: RegExpMatchArray | null = null;
        let lastCtxAge = 999; // how many messages ago
        for (let i = fullHistory.length - 1; i >= 0; i--) {
          const msg = fullHistory[i];
          if (msg.role === "ai" && msg.content?.includes("[PRODUCT_CONTEXT:")) {
            const m = msg.content.match(/\[PRODUCT_CONTEXT: ID=([^\|]+) \| Name=([^\|]+) \| Price=([^\|]+) \| Category=([^\]]+)\]/);
            if (m) {
              lastCtxMatch = m;
              lastCtxAge = (fullHistory.length - 1) - i; // 0 = very recent
              break;
            }
          }
        }

        // Only inject if PRODUCT_CONTEXT is very recent (≤6 messages ago) to avoid stale context
        // and message looks like a follow-up (price/buy inquiry)
        if (lastCtxMatch && lastCtxAge <= 6) {
          const [, prodId, prodName, prodPrice] = lastCtxMatch;
          const msgLower = (messageText || "").toLowerCase();
          const isFollowUp = 
            messageText.length <= 40 || // short message = likely follow-up
            /price|দাম|কত|নিতে|কিনব|কিনতে|order|অর্ডার|buy|stock|পাঠান|বুক/.test(msgLower);
          
          if (isFollowUp) {
            const ctxInject = `[SYSTEM_INSTRUCTION: কাস্টমার কোনো নির্দিষ্ট ছবিতে reply না করে সরাসরি বার্তা দিয়েছে। Conversation history-তে দেখা যাচ্ছে সম্প্রতি "${prodName.trim()}" (দাম: ${prodPrice.trim()}) পণ্যটির তথ্য/ছবি দেওয়া হয়েছে। কাস্টমারের বার্তাটি সম্ভবত এই পণ্যটি সম্পর্কেই। detectedProductId = "${prodId.trim()}" হিসেবে সেট করো।]\n`;
            messageText = ctxInject + (messageText || "");
            console.log(`[Layer2-CTX] Injected: "${prodName.trim()}" (${lastCtxAge} msgs ago)`);
          }
        }
      } catch (ctxErr) {
        console.error("Layer2 product context injection failed:", ctxErr);
      }
    } else if (replyToMid && !messageText?.includes("[SYSTEM_INSTRUCTION:")) {
      // replyToMid present but Layer 1 couldn't find exact product — log and skip injection
      console.log(`[Layer2-SKIP] replyToMid=${replyToMid} present but Layer1 lookup failed. AI will ask for clarification.`);
    }

    // ── Step 7: AI Engine
    let aiResult;
    try {
      aiResult = await runAI({
        conversationId: conversation.id,
        customerId: customer.id,
        messageText,
        mediaType,
        mediaUrl,
        preMatchedProductId,
        candidateProducts,
      });

      // Safety Net: Ensure aiResult.reply is never a raw JSON string
      if (aiResult.reply && (aiResult.reply.trim().startsWith("{") || aiResult.reply.includes('"reply":'))) {
        const { parseGeminiJSON } = await import("../_shared/gemini.ts");
        const parsed = parseGeminiJSON(aiResult.reply);
        aiResult.reply = parsed.reply;
        if (parsed.sendProductImage) aiResult.sendProductImage = true;
        if (parsed.productImageUrls?.length) aiResult.productImageUrls = parsed.productImageUrls;
        if (parsed.detectedProductId) aiResult.detectedProductId = parsed.detectedProductId;
      }
    } catch (aiErr) {
      console.error("AI engine failed:", aiErr);
      // AI Failed Queue pattern: lock conversation, notify human
      await setConversationStatus(conversation.id, "ai_failed");
      await addToHumanQueue(conversation.id, "ai_failed", String(aiErr));
      // Send fallback message to customer
      await sendTextMessage(
        platform as Platform,
        platformId,
        "আমরা আপনার বার্তাটি পেয়েছি। আমাদের একজন প্রতিনিধি খুব শীঘ্রই আপনার সাথে যোগাযোগ করবে।"
      );
      await releaseConversationLock(conversation.id);
      return jsonResponse({ status: "ai_failed" });
    }

    // ── Handle Human Queue Intents (return, complaint, order_status)
    if (aiResult.intent === "return_intent" || aiResult.intent === "complaint" || aiResult.intent === "order_status") {
      const reason = aiResult.intent === "return_intent" ? "return" : aiResult.intent;
      await setConversationStatus(conversation.id, "human_queue");
      await addToHumanQueue(conversation.id, reason, `AI detected: ${aiResult.intent}`);
    }

    // ── Step 6.5: Required pre-order field gate
    if (aiResult.intent === "order_intent" && aiResult.orderData && aiResult.detectedProductId) {
      // Check if all required fields for this product are answered
      const { getProductById } = await import("../_shared/supabase-client.ts");
      const product = await getProductById(aiResult.detectedProductId);

      if (product?.requiredOrderFields?.length) {
        const productAnswers =
          conversation.customerAnswers[aiResult.detectedProductId] ?? {};
        const gateResult = requiredFieldGate({
          requiredOrderFields: product.requiredOrderFields,
          customerAnswers: productAnswers,
        });

        if (!gateResult.complete) {
          // AI should ask the next required question instead of creating an order
          console.log(`Required field missing: ${gateResult.nextFieldName}`);
          // Override the AI reply with the required question
          aiResult.reply = gateResult.nextQuestion ?? aiResult.reply;
          aiResult.intent = "product_inquiry"; // Reset intent to prevent order creation
          aiResult.orderData = null;
        }
      }
    }

    // ── Step 8: Save AI reply to DB (skip if imageOnly with no text)
    if (!aiResult.imageOnly || aiResult.reply?.trim()) {
      await saveMessage({
        conversationId: conversation.id,
        role: "ai",
        content: aiResult.reply,
      });
    }

    // ── Send reply to customer (text) — skip if imageOnly mode
    if (!aiResult.imageOnly && aiResult.reply?.trim()) {
      await sendTextMessage(platform as Platform, platformId, aiResult.reply);
    }

    // ── Send product image(s) if flagged
    if (aiResult.sendProductImage) {
      const urls: string[] = [];
      
      // Collect all image URLs (multi-image takes priority over single)
      if (aiResult.productImageUrls && aiResult.productImageUrls.length > 0) {
        urls.push(...aiResult.productImageUrls);
      } else if (aiResult.productImageUrl) {
        urls.push(aiResult.productImageUrl);
      }

      // Send each image — capture the returned mid and save image message to DB
      let sentImageMid: string | undefined = undefined;
      for (const imgUrl of urls) {
        try {
          const mid = await sendImageMessage(platform as Platform, platformId, imgUrl);
          if (mid && urls.length === 1) sentImageMid = mid; // only track mid for single image
          
          // Save image message entry to DB for accurate reply lookup
          await saveMessage({
            conversationId: conversation.id,
            role: "ai",
            mediaType: "image",
            mediaUrl: imgUrl,
            platformMessageId: mid,
          });
        } catch (imgErr) {
          console.error("Failed to send image:", imgUrl, imgErr);
        }
      }

      // Save a hidden context message so AI knows which product was shown
      // Also saves the platform_message_id so reply_to lookups work
      // Try detectedProductId first, then fall back to image URL lookup
      let productForContext: { id: string; name: string; salePrice?: number; regularPrice: number; category?: string } | null = null;
      
      if (aiResult.detectedProductId) {
        const { getProductById } = await import("../_shared/supabase-client.ts");
        productForContext = await getProductById(aiResult.detectedProductId);
      } else if (urls.length === 1 && urls[0]) {
        // AI sent exactly one image but didn't set detectedProductId — look up by image URL
        try {
          const sbProd = getSupabaseClient();
          const imageUrlToSearch = urls[0];
          const { data: prodByImage } = await sbProd
            .from("products")
            .select("id, name, regular_price, sale_price, category")
            .contains("images", JSON.stringify([imageUrlToSearch]))
            .limit(1)
            .maybeSingle();
          if (prodByImage) {
            productForContext = {
              id: prodByImage.id,
              name: prodByImage.name,
              regularPrice: prodByImage.regular_price,
              salePrice: prodByImage.sale_price,
              category: prodByImage.category,
            };
            console.log(`[CTX] Product found by image URL: ${prodByImage.name}`);
          }
        } catch (imgLookupErr) {
          console.error("Image URL product lookup failed:", imgLookupErr);
        }
      }

      if (productForContext) {
        const contextNote = `[PRODUCT_CONTEXT: ID=${productForContext.id} | Name=${productForContext.name} | Price=৳${productForContext.salePrice ?? productForContext.regularPrice} | Category=${productForContext.category ?? "-"}]`;
        await saveMessage({
          conversationId: conversation.id,
          role: "ai",
          content: contextNote,
          platformMessageId: sentImageMid, // link the FB mid to this context
        });
        console.log(`[CTX] Saved PRODUCT_CONTEXT: "${productForContext.name}" mid=${sentImageMid ?? "none"}`);
      }
    }

    // ── Send video if flagged
    if (aiResult.sendVideo && aiResult.videoUrl) {
      await sendVideoMessage(platform as Platform, platformId, aiResult.videoUrl);
    }

    // ── Step 8.5: WooCommerce order push and Webhook
    if (aiResult.intent === "order_intent" && aiResult.orderData) {
      const { orderData } = aiResult;

      // Save to local orders table first (source of truth)
      const orderId = await createOrder({
        customerId: customer.id,
        conversationId: conversation.id,
        items: orderData.items,
        totalAmount: orderData.totalAmount,
        deliveryAddress: orderData.deliveryAddress,
      });

      const settings = await getBusinessSettings();

      // 1. Google Sheets Webhook
      if (settings.googleSheetsWebhookUrl) {
        try {
          const webhookPayload = {
            order_id: orderId,
            date: new Date().toISOString(),
            customer_name: customer.name,
            customer_phone: platform === "whatsapp" ? platformId : "N/A",
            delivery_address: orderData.deliveryAddress,
            total_amount: orderData.totalAmount,
            items: orderData.items.map(i => `${i.name} (Qty: ${i.qty})`).join(", ")
          };
          
          await fetch(settings.googleSheetsWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(webhookPayload)
          });
          console.log(`Google Sheets webhook sent for order ${orderId}`);
        } catch (e) {
          console.error("Failed to send Google Sheets webhook:", e);
        }
      }

      // 2. WooCommerce Sync Control
      if (settings.wooSyncEnabled) {
        // Fetch woo_product_id for each item
        const sb = getSupabaseClient();
        for (const item of orderData.items) {
          if (item.productId) {
            const { data: pData } = await sb.from("products").select("woo_product_id").eq("id", item.productId).maybeSingle();
            if (pData && pData.woo_product_id) {
              item.wooProductId = pData.woo_product_id;
            }
          }
        }

        // Push to WooCommerce
        const wooResult = await pushOrderToWooCommerce({
          items: orderData.items,
          customerName: customer.name,
          customerPhone: platform === "whatsapp" ? platformId : undefined,
          deliveryAddress: orderData.deliveryAddress,
          totalAmount: orderData.totalAmount,
        });

        if (wooResult.success && wooResult.wooOrderId) {
          await updateOrderWooSync(orderId, wooResult.wooOrderId, "synced", 1);
          console.log(`Order ${orderId} → WooCommerce #${wooResult.wooOrderId} ✓`);
        } else {
          await updateOrderWooSync(orderId, null, "failed", 1);
          console.error(`WooCommerce push failed for order ${orderId}:`, wooResult.error);

          // Enqueue WooCommerce retry (1 minute delay)
          await qstashPublish({
            url: WOO_RETRY_URL(),
            body: { orderId, attempt: 1 },
            delaySeconds: 60,
            retries: 0,
          });
        }
      } else {
        // Auto-sync is off, just leave it as pending
        console.log(`WooCommerce Auto-Sync is OFF. Order ${orderId} saved locally as pending.`);
      }
    }

    // ── Step 9: Schedule follow-up job (if AI asked something and customer might go quiet)
    const followUpIntents = ["price_inquiry", "product_inquiry", "order_intent", "follow_up_response"];
    if (followUpIntents.includes(aiResult.intent ?? "")) {
      try {
        const settings = await getBusinessSettings();
        if (settings.followUpEnabled) {
          const alreadySentToday = await hasFollowUpSentToday(conversation.id);
          if (!alreadySentToday) {
            const delaySeconds = settings.followUpDelayMinutes * 60;
            const scheduledFor = new Date(Date.now() + delaySeconds * 1000);

            const { messageId: qstashMsgId } = await qstashPublish({
              url: FOLLOWUP_HANDLER_URL(),
              body: {
                conversationId: conversation.id,
                customerId: customer.id,
                platform,
                platformId,
                detectedProductId: aiResult.detectedProductId,
              },
              delaySeconds,
              retries: 0, // Follow-ups are best-effort
            });

            await createFollowUpJob(conversation.id, scheduledFor, qstashMsgId);
            console.log(
              `Follow-up scheduled for ${conversation.id} in ${settings.followUpDelayMinutes} min`
            );
          }
        }
      } catch (fuErr) {
        console.error("Follow-up scheduling failed (non-critical):", fuErr);
      }
    }

    return jsonResponse({ status: "ok", intent: aiResult.intent });
  } catch (err) {
    console.error("queue-processor unhandled error:", err);
    return errorResponse(`queue-processor error: ${String(err)}`, 500);
  } finally {
    // Always release conversation lock
    await releaseConversationLock(conversation.id);
  }
});
