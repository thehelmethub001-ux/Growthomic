// followup-handler/index.ts
// Supabase Edge Function — Follow-Up Engine
// Called by QStash after a delay (followUpDelayMinutes)
// Once-per-day rule enforced here.
//
// STALENESS GUARDS (fire-time, not schedule-time):
//   1. conversation.last_product_id changed → different product now active
//   2. cart_state contains a DIFFERENT product → customer moved on to order something else
//   3. Recent customer messages contain rejection keywords ("নেবো না", "nibo na" etc.)
//   4. Customer replied after job was scheduled (existing check, kept)
//   All skipped jobs are marked status="skipped" with a reason for auditability.

import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { verifyQStashSignature } from "../_shared/upstash.ts";
import {
  getConversationById,
  hasFollowUpSentToday,
  markFollowUpSent,
  getBusinessSettings,
  saveMessage,
  getSupabaseClient,
} from "../_shared/supabase-client.ts";
import { sendTextMessage } from "../_shared/platform-send.ts";
import type { Platform } from "../_shared/types.ts";

interface FollowUpPayload {
  conversationId: string;
  customerId: string;
  platform: Platform;
  platformId: string;
  detectedProductId?: string;
  followUpJobId?: string;
}

// Rejection patterns — must match queue-processor's cancelCartPatterns for consistency
const REJECTION_PATTERNS = [
  /নেবো\s*না/i,
  /nibo\s*na/i,
  /\bna\s+nibo\b/i,
  /বাদ\s*দাও/i,
  /remove\s*koro/i,
  /এটা\s*(না|নেবো\s*না)/i,
  /ওইটা\s*(না|নেবো\s*না)/i,
  /\bcancel\b/i,
  /want\s*to\s*cancel/i,
  /দরকার\s*নেই/i,
  /লাগবে\s*না/i,
];

/** Mark a follow_up_jobs row as skipped with a human-readable reason. */
async function markJobSkipped(conversationId: string, reason: string): Promise<void> {
  try {
    const sb = getSupabaseClient();
    const { data: job } = await sb
      .from("follow_up_jobs")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("status", "scheduled")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (job?.id) {
      await sb
        .from("follow_up_jobs")
        .update({ status: "skipped", notes: reason })
        .eq("id", job.id);
      console.log(`[FOLLOW-UP] Job ${job.id} marked skipped: ${reason}`);
    }
  } catch (e) {
    console.error("[FOLLOW-UP] Could not mark job skipped:", e);
  }
}

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const isValid = await verifyQStashSignature(req.clone());
  if (!isValid) return errorResponse("Unauthorized", 401);

  let payload: FollowUpPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const { conversationId, platform, platformId, detectedProductId } = payload;
  console.log(`[FOLLOW-UP] Checking conversation: ${conversationId}, scheduledProduct: ${detectedProductId ?? "none"}`);

  // ── Guard 1: Once-per-day ceiling
  const alreadySent = await hasFollowUpSentToday(conversationId);
  if (alreadySent) {
    console.log(`[FOLLOW-UP] Already sent today for ${conversationId} — skipped`);
    return jsonResponse({ status: "already_sent_today" });
  }

  // ── Fetch current conversation state (fire-time, not schedule-time snapshot)
  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    return jsonResponse({ status: "conversation_not_found" });
  }

  // ── Guard 2: Conversation no longer open
  if (conversation.status !== "open") {
    console.log(`[FOLLOW-UP] Conversation ${conversationId} is ${conversation.status} — skipping`);
    await markJobSkipped(conversationId, `conversation_status:${conversation.status}`);
    return jsonResponse({ status: "skipped_not_open" });
  }

  const sb = getSupabaseClient();

  // ── Guard 3: Fetch recent messages (last 15) for staleness checks
  const { data: recentMessages } = await sb
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(15);

  if (recentMessages && recentMessages.length > 0) {
    // Guard 3a: Customer replied after follow-up was scheduled → they're already engaged
    const lastMsg = recentMessages[0];
    if (lastMsg.role === "customer") {
      console.log(`[FOLLOW-UP] Customer replied after scheduling — skipping`);
      await markJobSkipped(conversationId, "customer_replied_after_schedule");
      return jsonResponse({ status: "customer_replied" });
    }

    // Guard 3b: Customer rejected the scheduled product via text (before or after scheduling)
    if (detectedProductId) {
      const recentCustomerTexts = recentMessages
        .filter((m) => m.role === "customer")
        .map((m) => (m.content || "").toLowerCase());

      const customerRejected = recentCustomerTexts.some((text) =>
        REJECTION_PATTERNS.some((p) => p.test(text))
      );

      if (customerRejected) {
        console.log(`[FOLLOW-UP] Customer explicitly rejected product — skipping nudge`);
        await markJobSkipped(conversationId, "customer_rejected_product");
        return jsonResponse({ status: "skipped_rejected" });
      }
    }
  }

  // ── Guard 4: Product context changed since scheduling
  // If last_product_id is now different from the product this nudge is about,
  // the customer has moved on to discussing/ordering something else.
  if (detectedProductId && conversation.lastProductId && conversation.lastProductId !== detectedProductId) {
    console.log(
      `[FOLLOW-UP] Product context changed: scheduled for ${detectedProductId}, now ${conversation.lastProductId} — skipping`
    );
    await markJobSkipped(
      conversationId,
      `product_changed:was_${detectedProductId}_now_${conversation.lastProductId}`
    );
    return jsonResponse({ status: "skipped_product_changed" });
  }

  // ── Guard 5: Cart now has a DIFFERENT product
  // If cart_state is non-empty and none of the items match the scheduled product,
  // the customer has moved on to actively ordering something else.
  if (detectedProductId && conversation.cart_state && (conversation.cart_state as any[]).length > 0) {
    const cartProductIds = (conversation.cart_state as any[]).map((item: any) => item.productId);
    const scheduledProductInCart = cartProductIds.includes(detectedProductId);
    const otherProductsInCart = cartProductIds.some((id: string) => id !== detectedProductId);

    if (!scheduledProductInCart && otherProductsInCart) {
      console.log(
        `[FOLLOW-UP] Cart contains different products (${cartProductIds.join(",")}) — scheduled product ${detectedProductId} not in cart — skipping`
      );
      await markJobSkipped(
        conversationId,
        `cart_has_different_product:${cartProductIds.join(",")}`
      );
      return jsonResponse({ status: "skipped_cart_changed" });
    }
  }

  // ── All guards passed — safe to send the nudge ──
  const settings = await getBusinessSettings();

  let followUpText: string;
  if (detectedProductId) {
    const { data: product } = await sb
      .from("products")
      .select("name")
      .eq("id", detectedProductId)
      .single();

    const productName = product?.name ?? "পণ্যটি";
    followUpText = `স্যার/ম্যাম, আপনি কি ${productName} সম্পর্কে আরো কিছু জানতে চান, নাকি অর্ডার কনফার্ম করতে চান? আমরা সাহায্য করতে সদা প্রস্তুত! 😊`;
  } else {
    followUpText = `স্যার/ম্যাম, আপনি কি এখনো ${settings.businessName}-এর কোনো পণ্য সম্পর্কে জানতে চান? যেকোনো প্রশ্নে আমরা সাহায্য করতে পারি।`;
  }

  try {
    await sendTextMessage(platform, platformId, followUpText);

    await saveMessage({
      conversationId,
      role: "ai",
      content: followUpText,
    });

    // Mark the scheduled job as sent
    const { data: job } = await sb
      .from("follow_up_jobs")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("status", "scheduled")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (job?.id) {
      await markFollowUpSent(job.id);
    }

    console.log(`[FOLLOW-UP] Sent to [${platform}] ${platformId} ✓`);
    return jsonResponse({ status: "sent" });
  } catch (err) {
    console.error("[FOLLOW-UP] Send failed:", err);
    return errorResponse("Send failed", 500);
  }
});
