// woo-retry/index.ts
// Supabase Edge Function — WooCommerce Order Push Retry
// Called by QStash on failed WooCommerce pushes
// 3 attempts with exponential backoff: 1min → 5min → 15min

import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { qstashPublish, verifyQStashSignature } from "../_shared/upstash.ts";
import {
  updateOrderWooSync,
  getSupabaseClient,
} from "../_shared/supabase-client.ts";
import { pushOrderToWooCommerce } from "../_shared/woocommerce.ts";
import type { OrderItem } from "../_shared/types.ts";

interface WooRetryPayload {
  orderId: string;
  attempt: number; // 1, 2, or 3
}

const WOO_RETRY_URL = () => Deno.env.get("WOO_RETRY_URL")!;

// Exponential backoff delays in seconds
const RETRY_DELAYS = [
  0,    // attempt 1 (immediate, already delayed by previous job)
  300,  // attempt 2: 5 minutes
  900,  // attempt 3: 15 minutes
];

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const isValid = await verifyQStashSignature(req.clone());
  if (!isValid) return errorResponse("Unauthorized", 401);

  let payload: WooRetryPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const { orderId, attempt } = payload;
  console.log(`WooCommerce retry: order ${orderId}, attempt ${attempt}`);

  // Load order from DB
  const sb = getSupabaseClient();
  const { data: order, error } = await sb
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    console.error(`Order ${orderId} not found`);
    return errorResponse("Order not found", 404);
  }

  // Already synced? Skip
  if (order.woo_sync_status === "synced") {
    console.log(`Order ${orderId} already synced — skipping retry`);
    return jsonResponse({ status: "already_synced" });
  }

  // Load customer for name/phone
  const { data: customer } = await sb
    .from("customers")
    .select("name, platform, platform_id")
    .eq("id", order.customer_id)
    .single();

  // Attempt WooCommerce push
  const wooResult = await pushOrderToWooCommerce({
    items: order.items as OrderItem[],
    customerName: customer?.name ?? undefined,
    customerPhone:
      customer?.platform === "whatsapp" ? customer?.platform_id : undefined,
    deliveryAddress: order.delivery_address ?? undefined,
    totalAmount: order.total_amount,
  });

  if (wooResult.success && wooResult.wooOrderId) {
    // Success — update order
    await updateOrderWooSync(orderId, wooResult.wooOrderId, "synced", attempt);
    console.log(`Order ${orderId} → WooCommerce #${wooResult.wooOrderId} ✓ (attempt ${attempt})`);
    return jsonResponse({ status: "synced", wooOrderId: wooResult.wooOrderId });
  }

  // ── Failed — check if we should retry
  console.error(`WooCommerce push failed (attempt ${attempt}):`, wooResult.error);
  await updateOrderWooSync(orderId, null, "failed", attempt);

  if (attempt < 3) {
    const nextAttempt = attempt + 1;
    const delay = RETRY_DELAYS[nextAttempt - 1] ?? 900;

    await qstashPublish({
      url: WOO_RETRY_URL(),
      body: { orderId, attempt: nextAttempt },
      delaySeconds: delay,
      retries: 0,
    });

    console.log(`Scheduled retry attempt ${nextAttempt} in ${delay}s`);
    return jsonResponse({ status: "retry_scheduled", nextAttempt });
  }

  // ── All 3 attempts failed — flag for manual push in dashboard
  console.error(`Order ${orderId} failed all 3 WooCommerce sync attempts — needs manual push`);

  // The dashboard Orders tab shows woo_sync_status = 'failed' with a "Manual Push" button
  // No further automatic action — human must intervene
  return jsonResponse({
    status: "all_retries_failed",
    orderId,
    message: "Order flagged for manual push in dashboard",
  });
});
