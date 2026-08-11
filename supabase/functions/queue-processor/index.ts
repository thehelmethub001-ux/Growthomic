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
      let foundRepliedText: string | undefined = undefined;

      for (const msg of repliedMsgs ?? []) {
        if (msg.content?.includes("[PRODUCT_CONTEXT:")) {
          foundContextNote = msg.content;
          break;
        }
        if (msg.media_url && !foundMediaUrl) {
          foundMediaUrl = msg.media_url;
        }
        if (msg.content && !msg.content.includes("[PRODUCT_CONTEXT:") && msg.content.trim().length > 0 && !foundRepliedText) {
          foundRepliedText = msg.content.trim();
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
      } else if (foundRepliedText) {
        const replyContext = `[SYSTEM_INSTRUCTION: কাস্টমার আপনার এই আগের মেসেজটিতে সরাসরি Reply দিয়ে প্রশ্ন বা মন্তব্য করেছে: "${foundRepliedText}"। কাস্টমারের নতুন মেসেজের উত্তর এই মেসেজের প্রেক্ষাপট বজায় রেখে দিন।]\n`;
        messageText = replyContext + (messageText || "");
        console.log(`Reply-to DB text context injected: "${foundRepliedText}"`);
      }

      // 2. Fallback: if mid lookup didn't find an explicit match, search conversation history for the most recent message with media_url
      if (!foundContextNote && !resolvedRepliedMediaUrl && !foundRepliedText) {
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

      // 3. If an image URL was resolved for the replied message, first try an exact match in our DB
      if (resolvedRepliedMediaUrl) {
        const { getAllInStockProducts } = await import("../_shared/supabase-client.ts");
        const allProds = await getAllInStockProducts();
        let matchedProduct = null;
        for (const p of allProds) {
          if (p.images.includes(resolvedRepliedMediaUrl)) {
            matchedProduct = p;
            break;
          }
          if (p.variations) {
            const hasVar = p.variations.some((v: any) => v.image_url === resolvedRepliedMediaUrl);
            if (hasVar) {
              matchedProduct = p;
              break;
            }
          }
        }

        if (matchedProduct) {
          console.log(`Exact URL match found for replied image! Product: ${matchedProduct.name} (${matchedProduct.id})`);
          // We found exactly which product/variation the AI sent. Skip vector search!
          // We will inject the SYSTEM_INSTRUCTION directly and clear mediaUrl so vector search is bypassed.
          messageText = `[SYSTEM_INSTRUCTION: Customer replied "Aita" or similar to a specific product image. 
Target Product: ${matchedProduct.name} (Price: ৳${matchedProduct.salePrice || matchedProduct.regularPrice})
detectedProductId = "${matchedProduct.id}" হিসেবে সেট করো।

HUMAN RESPONSE RULES:
1. Speak naturally like a real human shopkeeper. State the product name and price directly.
   Examples of how to reply:
   - "জি স্যার, এটি আমাদের ${matchedProduct.name}। এর দাম ৳${matchedProduct.salePrice || matchedProduct.regularPrice}।"
   - "জি স্যার, চমৎকার এই ${matchedProduct.name} মডেলটির দাম ৳${matchedProduct.salePrice || matchedProduct.regularPrice}।"

2. If the customer's photo is NOT an exact match of this product:
   - "স্যার, দুঃখিত আপনার পাঠানো এই নির্দিষ্ট মডেলটি আমাদের কাছে বর্তমানে নেই। তবে আমাদের কাছে ${matchedProduct.name} মডেলটি রয়েছে, দাম ৳${matchedProduct.salePrice || matchedProduct.regularPrice}। আপনি কি এটি দেখতে চান?"] ` + (messageText || "");
          
          // Clear media properties to bypass Vector Search and Gemini Vision
          mediaUrl = undefined;
          mediaType = undefined;
        } else {
          // Fallback to Vector Search if exact match failed
          mediaUrl = resolvedRepliedMediaUrl;
          mediaType = "image";
          console.log(`Set mediaUrl from replied message for Vector Search + Gemini Vision: ${mediaUrl}`);
        }
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
  let cachedSettings: any = null;
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
    let preMatchedProductIds: string[] | undefined = undefined;
    let candidateProducts: { id: string; name: string; imageUrl: string }[] | undefined = undefined;

    // Detect all customer image messages in current batch
    let batchStartIndex = history.length;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role !== "customer") {
        batchStartIndex = i + 1;
        break;
      }
    }
    if (batchStartIndex === history.length) batchStartIndex = 0;
    const currentBatchMsgs = history.slice(batchStartIndex);
    const batchImageMsgs = currentBatchMsgs.filter(m => m.media_type === "image" && m.media_url);

    // If current triggering payload has mediaType === "image" and is not in batchImageMsgs, add it
    if (mediaType === "image" && mediaUrl && !batchImageMsgs.some(m => m.media_url === mediaUrl)) {
      batchImageMsgs.push({ media_type: "image", media_url: mediaUrl } as any);
    }

    if (batchImageMsgs.length > 0 && !messageText?.includes("Target Product:")) {
      try {
        console.log(`Image(s) received (${batchImageMsgs.length} photo(s) in batch), executing vector similarity search...`);
        const sb = getSupabaseClient();

        if (batchImageMsgs.length === 1) {
          // Normal Single-Image Flow
          const targetMediaUrl = batchImageMsgs[0].media_url!;
          let res: Response;
          if (platform === "whatsapp") {
            const { downloadMetaMedia, getMetaAccessToken } = await import("../_shared/platform-send.ts");
            const metaRes = await downloadMetaMedia(targetMediaUrl);
            res = await fetch(metaRes.url, { headers: { Authorization: `Bearer ${await getMetaAccessToken()}` } });
          } else {
            res = await fetch(targetMediaUrl);
          }
          const buffer = await res.arrayBuffer();
          const base64 = encodeBase64(buffer);
          let mimeType = res.headers.get("content-type") || "image/jpeg";
          if (!mimeType.startsWith("image/")) mimeType = "image/jpeg";

          const { data: matchData, error: matchErr } = await sb.functions.invoke("image-match", {
            body: { base64, mimeType, threshold: 0.45, matchCount: 6 }
          });

          if (matchErr) throw matchErr;
          
          if (matchData?.success && matchData.matches?.length > 0) {
            const topMatch = matchData.matches[0];
            let isConfident = false;
            // Lowered threshold: 0.75 similarity is sufficient for a confident match
            if (topMatch.similarity >= 0.75) {
              if (matchData.matches.length > 1) {
                const secondMatch = matchData.matches[1];
                // Reduced gap requirement: 0.08 is enough to distinguish two different products
                if (topMatch.similarity - secondMatch.similarity >= 0.08) {
                  isConfident = true;
                } else {
                  console.log(`Ambiguous: Top match (${topMatch.similarity.toFixed(3)}) too close to second (${secondMatch.similarity.toFixed(3)}), gap=${(topMatch.similarity - secondMatch.similarity).toFixed(3)}`);
                }
              } else {
                isConfident = true;
              }
            }

            if (isConfident) {
              console.log(`Confirmed image match: ${topMatch.product_name} - ${topMatch.color} (ID: ${topMatch.product_id}, Variant: ${topMatch.variation_woo_id}, Score: ${topMatch.similarity.toFixed(3)})`);
              preMatchedProductId = topMatch.product_id;
              preMatchedProductIds = [topMatch.product_id];
              
              // topMatch is a specific variant, we have exact color and stock
              const price = topMatch.sale_price || topMatch.regular_price;
              const stockOk = (topMatch.stock_quantity ?? 0) > 0 && topMatch.is_active;
              const fullName = `${topMatch.product_name} - ${topMatch.color}`;
              
              messageText = `[SYSTEM_INSTRUCTION:
Customer sent a helmet image.
Product identified by system: ${fullName} (দাম: ৳${price})
detectedProductId = "${topMatch.product_id}"
detectedVariantId = "${topMatch.variation_woo_id || ""}"
Stock status: ${stockOk ? "✅ স্টকে আছে" : "❌ স্টকে নেই"}

Gemini Vision করবে:
- Customer এর ছবির হেলমেটের শেপ/ডিজাইন যদি ${topMatch.product_name} এর মতো হয়, তাহলে মিল হিসেবে ধরবে।
- যদি মিলে এবং স্টকে আছে → বলো: "জি স্যার, এটি আমাদের ${fullName}। এর দাম ৳${price}।"
- যদি মিলে কিন্তু স্টকে নেই → বলো: "স্যার, ${fullName} এই নির্দিষ্ট কালারটি বর্তমানে স্টকে নেই।"
- যদি একেবারেই না মিলে (সম্পূর্ণ ভিন্ন শেপ) → বলো: "স্যার, আপনার পাঠানো নির্দিষ্ট মডেলটি হয়তো আমাদের কাছে নেই, তবে কাছাকাছি ${fullName} মডেলটি আমাদের কাছে আছে যার দাম ৳${price}।"
Reply in Bengali naturally.]` + "\n" + (messageText || "");

            } else {
              console.log(`Ambiguous matches found. Top score: ${topMatch.similarity.toFixed(3)}, building candidate set for Gemini Vision...`);

              // Build candidate list from returned variants
              const candidateList: { id: string; name: string; imageUrl: string }[] = [];
              for (const m of matchData.matches.slice(0, 8)) {
                if (m.images && m.images.length > 0) {
                  for (const img of m.images) {
                    if (img && img.startsWith("http") && !candidateList.some(c => c.imageUrl === img)) {
                      candidateList.push({ id: m.product_id, name: `${m.product_name} - ${m.color}`, imageUrl: img });
                    }
                  }
                }
              }
              candidateProducts = candidateList.slice(0, 8);

              // Build catalog text for ambiguous matches
              const optionsText = matchData.matches.slice(0, 8).map((m: any) => {
                const price = m.sale_price || m.regular_price;
                const stockStatus = (m.stock_quantity ?? 0) > 0 && m.is_active ? "(স্টকে আছে)" : "(স্টকে নেই)";
                return `[ID=${m.product_id} Variant=${m.variation_woo_id || ""}] ${m.product_name} - ${m.color} (৳${price}) ${stockStatus}`;
              }).join("\n");

              const instruction = `[SYSTEM_INSTRUCTION:
Customer sent a helmet image. Vector search found similar models. Reference variation images are provided above.

Available models & colors in stock:
${optionsText}

Gemini Vision করবে (3 ধাপে):
STEP 1: Customer এর helmet এর model/shape কোনটির সাথে সবচেয়ে বেশি মিলে তা নির্ধারণ করো। (কালার বা স্টিকার ভিন্ন হলেও হেলমেটের মূল গঠন বা শেপ এক হলে একই মডেল হিসেবে ধরবে)।
STEP 2: কাস্টমারের ছবির কালার কি উপরের catalog-এর (stock-এ থাকা) কোনো কালারের সাথে মিলে যায়?
  - যদি হ্যাঁ (কালার মিলে যায়) → বলো: "জি স্যার, এটি আমাদের [Product Name] - [COLOR]। এর দাম ৳[Price]।"
  - যদি না (মডেল মিলে কিন্তু এই নির্দিষ্ট কালারটি catalog-এ নেই) → বলো: "স্যার, আপনার পাঠানো এই নির্দিষ্ট কালারটি বর্তমানে আমাদের স্টকে নেই। তবে এই মডেলের নিচের কালারগুলো আমাদের কাছে আছে:" তারপর catalog থেকে ওই মডেলের কালার ও দামগুলো list করো — কিন্তু শুধুমাত্র যেগুলোর পাশে (স্টকে আছে) লেখা আছে সেগুলোই list করো। যেগুলোর পাশে (স্টকে নেই) লেখা আছে সেগুলো কখনো "আমাদের কাছে আছে" এর তালিকায় দেখাবে না।
STEP 3: যদি customer এর ছবির model/shape কোনোটির সাথেই না মিলে → বলো: "স্যার, আপনার পাঠানো ঠিক একই মডেলটি হয়তো আমাদের কাছে বর্তমানে নেই, তবে কাছাকাছি এই মডেলগুলো আছে:" তারপর catalog থেকে list করো — কিন্তু শুধুমাত্র যেগুলোর পাশে (স্টকে আছে) লেখা আছে সেগুলোই list করো। যেগুলোর পাশে (স্টকে নেই) লেখা আছে সেগুলো কখনো দেখাবে না।

Reply in Bengali naturally. প্রতিটি product বলার সময় অবশ্যই color সহ বলো।]`;

              messageText = instruction + "\n" + (messageText || "");

             // Save the context persistently in the user's message so AI remembers the image URLs in the next turns
             if (platformMessageId) {
               await sb.from("messages").update({
                 content: (payload.text || "") + "\n\n[HIDDEN_AMBIGUOUS_CONTEXT:\n" + optionsText + "\n]"
               }).eq("platform_message_id", platformMessageId);
             }
          }
        }
        } else {
          // Multi-Image Batch Flow (> 1 images, cap at 5 max to control API cost/latency)
          const imagesToMatch = batchImageMsgs.slice(0, 5);
          const multiImageMatches: Array<{ imageUrl: string; topMatch: any; matches: any[] }> = [];

          for (let idx = 0; idx < imagesToMatch.length; idx++) {
            const imgMsg = imagesToMatch[idx];
            try {
              let res: Response;
              if (platform === "whatsapp") {
                const { downloadMetaMedia, getMetaAccessToken } = await import("../_shared/platform-send.ts");
                const metaRes = await downloadMetaMedia(imgMsg.media_url!);
                res = await fetch(metaRes.url, { headers: { Authorization: `Bearer ${await getMetaAccessToken()}` } });
              } else {
                res = await fetch(imgMsg.media_url!);
              }
              const buffer = await res.arrayBuffer();
              const base64 = encodeBase64(buffer);
              let mimeType = res.headers.get("content-type") || "image/jpeg";
              if (!mimeType.startsWith("image/")) mimeType = "image/jpeg";

              const { data: matchData } = await sb.functions.invoke("image-match", {
                body: { base64, mimeType, threshold: 0.45, matchCount: 6 }
              });

              if (matchData?.success && matchData.matches?.length > 0) {
                const topMatch = matchData.matches[0];
                let isConfident = false;
                if (topMatch.similarity >= 0.75) {
                  if (matchData.matches.length > 1) {
                    const secondMatch = matchData.matches[1];
                    if (topMatch.similarity - secondMatch.similarity >= 0.08) {
                      isConfident = true;
                    }
                  } else {
                    isConfident = true;
                  }
                }
                multiImageMatches.push({
                  imageUrl: imgMsg.media_url!,
                  topMatch: isConfident ? topMatch : null,
                  matches: matchData.matches,
                });
              } else {
                multiImageMatches.push({
                  imageUrl: imgMsg.media_url!,
                  topMatch: null,
                  matches: [],
                });
              }
            } catch (singleImgErr) {
              console.error(`Vector match failed for batch image ${idx + 1}:`, singleImgErr);
            }
          }

          // Build combined multi-image SYSTEM_INSTRUCTION
          const matchLines = multiImageMatches.map((item, idx) => {
            if (item.topMatch) {
              const price = item.topMatch.sale_price || item.topMatch.regular_price;
              const inStock = (item.topMatch.stock_quantity ?? 0) > 0 && item.topMatch.is_active;
              return `  ছবি ${idx + 1}: ${item.topMatch.product_name} - ${item.topMatch.color} (দাম ৳${price}) ${inStock ? "(স্টকে আছে)" : "(স্টকে নেই)"}`;
            } else if (item.matches?.length > 0) {
              const candidateStr = item.matches.slice(0, 3).map((m: any) => `${m.product_name} - ${m.color} (৳${m.sale_price || m.regular_price})`).join(", ");
              return `  ছবি ${idx + 1}: সম্ভাব্য মডেল: ${candidateStr}`;
            } else {
              return `  ছবি ${idx + 1}: আমাদের ক্যাটালগে এই নির্দিষ্ট পণ্যের সাথে ১০০% মিল পাওয়া যায়নি`;
            }
          }).join("\n");

          messageText = `[SYSTEM_INSTRUCTION: কাস্টমার একসাথে ${multiImageMatches.length}টি ছবি পাঠিয়েছেন। প্রতিটির তথ্য নিচে দেওয়া হলো:
${matchLines}

নিয়মাবলী:
১. প্রতিটি ছবির পণ্যের নাম ও দাম আলাদা আলাদাভাবে উল্লেখ করে সুন্দরভাবে বাংলায় উত্তর দিন।
২. যে ছবিটি মিলেনি তার জন্য বিনীতভাবে জানান যে ওই নির্দিষ্ট মডেলটি বর্তমানে স্টকে নেই, তবে অন্য ছবিগুলোর নাম ও দাম সরাসরি জানিয়ে দিন।]` + "\n" + (messageText || "");

          // Set preMatchedProductId to the product from the LAST confident image match in the batch (for backward compatibility)
          const confidentMatches = multiImageMatches.filter(m => m.topMatch);
          if (confidentMatches.length > 0) {
            preMatchedProductId = confidentMatches[confidentMatches.length - 1].topMatch.product_id;
            preMatchedProductIds = confidentMatches.map(m => m.topMatch.product_id);
          }

          // Flatten candidate products across all images for Gemini Vision reference
          const allCandidates: { id: string; name: string; imageUrl: string }[] = [];
          for (const mItem of multiImageMatches) {
            if (mItem.matches && mItem.matches.length > 0) {
              for (const m of mItem.matches.slice(0, 3)) {
                if (m.images && m.images.length > 0) {
                  for (const img of m.images) {
                    if (img && img.startsWith("http") && !allCandidates.some(c => c.imageUrl === img)) {
                      allCandidates.push({ id: m.product_id, name: `${m.product_name} - ${m.color}`, imageUrl: img });
                    }
                  }
                }
              }
            }
          }
          if (allCandidates.length > 0) {
            candidateProducts = allCandidates.slice(0, 10);
          }
        }
      } catch (imgErr) {
        console.error("Image vector search failed, falling back to Vision LLM:", imgErr);
      }
    }

    // Layer 2 context injection disabled — Layer 1 (reply_to lookup) handles all cases
    if (replyToMid && !messageText?.includes("[SYSTEM_INSTRUCTION:")) {
      console.log(`[Layer2-SKIP] replyToMid present but Layer1 lookup failed. AI will ask for clarification.`);
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
        preMatchedProductIds,
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

    // Ensure closing prompt for multi-image responses
    if (aiResult.sendProductImage && (aiResult.productImageUrls?.length ?? 0) > 1 && aiResult.reply) {
      if (!aiResult.reply.includes("স্ক্রিনশট") && !aiResult.reply.includes("ss")) {
        aiResult.reply = aiResult.reply.trim() + "\n\nআপনি যেটি নিবেন সেটির স্ক্রিনশট (ss) বা ছবি আমাদের দেন, আমরা আপনাকে বিস্তারিত ইনফরমেশন দিচ্ছি।";
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
      
      // Collect all image URLs
      if (aiResult.productImageUrls && aiResult.productImageUrls.length > 0) {
        urls.push(...aiResult.productImageUrls);
      } else if ((aiResult as any).productImageUrl) {
        urls.push((aiResult as any).productImageUrl);
      }

      // Filter out invalid URLs (in case AI hallucinates placeholder text)
      const validUrls = urls.filter(u => typeof u === "string" && u.startsWith("http"));

      // Send each image — capture the returned mid and save image message to DB
      let sentImageMid: string | undefined = undefined;
      for (const imgUrl of validUrls) {
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
      let productForContext: { id: string; name: string; salePrice?: number; regularPrice: number; category?: string; images?: string[] } | null = null;
      
      if (aiResult.detectedProductId) {
        const { getProductById } = await import("../_shared/supabase-client.ts");
        const fullProduct = await getProductById(aiResult.detectedProductId);
        if (fullProduct) {
          productForContext = {
            id: fullProduct.id,
            name: fullProduct.name,
            regularPrice: fullProduct.regularPrice,
            salePrice: fullProduct.salePrice,
            category: fullProduct.category,
            images: fullProduct.images,
          };
        }
      } else if (validUrls.length === 1 && validUrls[0]) {
        // AI sent exactly one image but didn't set detectedProductId — look up by image URL
        try {
          const sbProd = getSupabaseClient();
          const imageUrlToSearch = validUrls[0];
          const { data: prodByImage } = await sbProd
            .from("products")
            .select("id, name, regular_price, sale_price, category, images")
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
              images: prodByImage.images,
            };
            console.log(`[CTX] Product found by image URL: ${prodByImage.name}`);
          }
        } catch (imgLookupErr) {
          console.error("Image URL product lookup failed:", imgLookupErr);
        }
      }

      // FALLBACK: If AI failed to provide any valid URLs but detected the product, send its main image
      if (validUrls.length === 0 && productForContext) {
        try {
          // No valid image URL found, try to use the main image of the product
          if (productForContext.images && productForContext.images.length > 0) {
            const fallbackUrl = productForContext.images[0];
            const mid = await sendImageMessage(platform as Platform, platformId, fallbackUrl);
            if (mid) sentImageMid = mid;
            
            await saveMessage({
              conversationId: conversation.id,
              role: "ai",
              mediaType: "image",
              mediaUrl: fallbackUrl,
              platformMessageId: mid,
            });
            console.log(`Fallback: sent main product image for ${productForContext.name}`);
          }
        } catch (fbErr) {
          console.error("Failed to send fallback image:", fbErr);
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

      if (!cachedSettings) cachedSettings = await getBusinessSettings();
      const settings = cachedSettings;

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
          if (item.variantId) {
            const wooVarId = parseInt(item.variantId, 10);
            if (!isNaN(wooVarId)) {
              item.wooVariationId = wooVarId;
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
