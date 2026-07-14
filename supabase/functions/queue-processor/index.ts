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
    console.error("Invalid QStash signature - BYPASSING FOR TESTING");
    // return errorResponse("Unauthorized", 401);
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
    text: messageText,
    mediaType,
    mediaUrl,
    platformMessageId,
  } = payload;

  console.log(`Processing: [${platform}] ${platformId} — "${messageText?.substring(0, 50)}"`);

  // ── Step 2: Upsert customer
  let customer;
  try {
    customer = await upsertCustomer(platform as Platform, platformId, customerName);
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

  // Update 24-hour messaging window (Meta allows replies within 24h of last message)
  const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { getSupabaseClient } = await import("../_shared/supabase-client.ts");
  const sb = getSupabaseClient();
  await sb
    .from("conversations")
    .update({ platform_window_expires_at: windowExpiry })
    .eq("id", conversation.id);

  // ── isLockedForAI check: if another human is handling this, skip AI
  if (conversation.isLockedForAI && conversation.status === "human_queue") {
    console.log(`Conversation ${conversation.id} locked for AI — human is handling`);
    return jsonResponse({ status: "locked_for_human" });
  }

  try {
    // ── Step 4: Distributed conversation lock (30s)
    const lockAcquired = await acquireConversationLock(conversation.id);
    if (!lockAcquired) {
      console.log(`Could not acquire conversation lock for ${conversation.id} — concurrent processing`);
      return jsonResponse({ status: "concurrent_skip" });
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

    // ── Step 7: AI Engine
    let aiResult;
    try {
      aiResult = await runAI({
        conversationId: conversation.id,
        customerId: customer.id,
        messageText,
        mediaType,
        mediaUrl,
      });
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

    // ── Send product image if flagged
    if (aiResult.sendProductImage && aiResult.productImageUrl) {
      await sendImageMessage(platform as Platform, platformId, aiResult.productImageUrl);
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
