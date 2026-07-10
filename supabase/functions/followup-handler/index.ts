// followup-handler/index.ts
// Supabase Edge Function — Follow-Up Engine
// Called by QStash after a delay (followUpDelayMinutes)
// Once-per-day rule enforced here

import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { verifyQStashSignature } from "../_shared/upstash.ts";
import {
  getConversationById,
  hasFollowUpSentToday,
  markFollowUpSent,
  getBusinessSettings,
  saveMessage,
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

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  // Verify QStash signature
  const isValid = await verifyQStashSignature(req.clone());
  if (!isValid) return errorResponse("Unauthorized", 401);

  let payload: FollowUpPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const { conversationId, platform, platformId, detectedProductId } = payload;

  console.log(`Follow-up check for conversation: ${conversationId}`);

  // ── Rule 1: Once-per-day ceiling
  const alreadySent = await hasFollowUpSentToday(conversationId);
  if (alreadySent) {
    console.log(`Follow-up already sent today for ${conversationId} — skipped`);
    return jsonResponse({ status: "already_sent_today" });
  }

  // ── Rule 2: Check if customer already replied (conversation should still be open)
  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    return jsonResponse({ status: "conversation_not_found" });
  }

  // If conversation was resolved or moved to human queue, skip follow-up
  if (conversation.status !== "open") {
    console.log(`Conversation ${conversationId} is ${conversation.status} — skipping follow-up`);
    return jsonResponse({ status: "skipped_not_open" });
  }

  // ── Check last message — if customer replied after the job was scheduled, skip
  const { getSupabaseClient } = await import("../_shared/supabase-client.ts");
  const sb = getSupabaseClient();

  const { data: lastMessages } = await sb
    .from("messages")
    .select("role, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(2);

  if (lastMessages && lastMessages.length > 0) {
    const lastMsg = lastMessages[0];
    // If the last message is from the customer (they replied), cancel follow-up
    if (lastMsg.role === "customer") {
      console.log(`Customer replied after follow-up was scheduled — skipping`);
      return jsonResponse({ status: "customer_replied" });
    }
  }

  // ── Build follow-up message
  const settings = await getBusinessSettings();

  let followUpText: string;
  if (detectedProductId) {
    // Fetch product name for personalized follow-up
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

  // ── Send follow-up message
  try {
    await sendTextMessage(platform, platformId, followUpText);

    // Save to messages DB
    await saveMessage({
      conversationId,
      role: "ai",
      content: followUpText,
    });

    // ── Mark follow-up job as sent
    // Find the follow_up_jobs row for this conversation
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

    console.log(`Follow-up sent to [${platform}] ${platformId} ✓`);
    return jsonResponse({ status: "sent" });
  } catch (err) {
    console.error("Follow-up send failed:", err);
    return errorResponse("Send failed", 500);
  }
});
