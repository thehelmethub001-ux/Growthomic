// _shared/woocommerce.ts
// WooCommerce REST API client — one-way order push only

import type { OrderItem } from "./types.ts";
import { getBusinessSettings } from "./supabase-client.ts";

// ============================================================
// WooCommerce order push result
// ============================================================
export interface WooPushResult {
  success: boolean;
  wooOrderId?: number;
  error?: string;
}

// ============================================================
// pushOrderToWooCommerce()
// Creates a COD order in WooCommerce from a local order
// ============================================================
export async function pushOrderToWooCommerce(params: {
  items: OrderItem[];
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  totalAmount: number;
}): Promise<WooPushResult> {
  const settings = await getBusinessSettings();

  if (!settings.wooApiUrl || !settings.wooConsumerKey || !settings.wooConsumerSecret) {
    return {
      success: false,
      error: "WooCommerce credentials not configured",
    };
  }

  // Build WooCommerce order payload
  const lineItems = params.items
    .filter((i) => i.wooProductId) // only push items with a known WooCommerce product ID
    .map((i) => ({
      product_id: i.wooProductId!,
      quantity: i.qty,
      ...(i.wooVariationId ? { variation_id: i.wooVariationId } : {})
    }));

  if (lineItems.length === 0) {
    return {
      success: false,
      error: "No items with WooCommerce product IDs — cannot push order",
    };
  }

  // Parse name into first/last
  const nameParts = (params.customerName ?? "Customer").split(" ");
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ") || "";

  const payload = {
    payment_method: "cod",
    payment_method_title: "Cash on Delivery",
    set_paid: false,
    status: "processing",
    billing: {
      first_name: firstName,
      last_name: lastName,
      phone: params.customerPhone ?? "",
      address_1: params.deliveryAddress ?? "",
      country: "BD",
    },
    shipping: {
      first_name: firstName,
      last_name: lastName,
      address_1: params.deliveryAddress ?? "",
      country: "BD",
    },
    line_items: lineItems,
    meta_data: [
      {
        key: "_growthomic_source",
        value: "ai_chat_agent",
      },
    ],
  };

  try {
    // WooCommerce uses Basic Auth (Consumer Key + Secret)
    const credentials = btoa(
      `${settings.wooConsumerKey}:${settings.wooConsumerSecret}`
    );

    const apiUrl = settings.wooApiUrl.replace(/\/$/, "");
    const res = await fetch(`${apiUrl}/wp-json/wc/v3/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        success: false,
        error: `WooCommerce API returned ${res.status}: ${errorText}`,
      };
    }

    const wooOrder = await res.json();
    return {
      success: true,
      wooOrderId: wooOrder.id as number,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================
// requiredFieldGate()
// Check if all required pre-order fields for a product are answered.
// Returns { complete: true } if all answered, or { complete: false, nextQuestion }
// ============================================================
export function requiredFieldGate(params: {
  requiredOrderFields: Array<{ fieldName: string; question: string }>;
  customerAnswers: Record<string, string>; // {fieldName: answer} for this product
}): { complete: boolean; nextQuestion?: string; nextFieldName?: string } {
  const { requiredOrderFields, customerAnswers } = params;

  for (const field of requiredOrderFields) {
    if (!customerAnswers[field.fieldName]) {
      return {
        complete: false,
        nextQuestion: field.question,
        nextFieldName: field.fieldName,
      };
    }
  }

  return { complete: true };
}
