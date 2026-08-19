import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/encryption";
function parseOrderContactInfo(
  rawAddress: string = "",
  customerName: string = "",
  platformId: string = "",
  platform: string = ""
) {
  // 1. Extract 11-digit phone number using regex
  let phone = "";
  const phoneMatch = rawAddress.match(/(?:01\d{9})|(?:\+?8801\d{9})/);
  if (phoneMatch) {
    phone = phoneMatch[0];
  } else if (platform === "whatsapp" && platformId) {
    phone = platformId;
  }

  // 2. Extract customer name
  let name = customerName || "";
  const parts = rawAddress.split(",").map(p => p.trim());
  if (parts.length > 0 && !parts[0].match(/\d/) && parts[0].length < 30) {
    if (!name || name === platformId) {
      name = parts[0];
    }
  }
  if (!name) name = "Customer";

  const nameParts = name.split(" ");
  const firstName = nameParts[0] || "Customer";
  const lastName = nameParts.slice(1).join(" ") || "";

  // 3. Clean delivery address: remove name part and phone number part
  let cleanAddress = rawAddress;
  if (phone) {
    cleanAddress = cleanAddress.replace(phone, "");
  }
  if (parts.length > 2 && parts[0] === nameParts[0]) {
    cleanAddress = parts.slice(1).join(", ");
  }
  cleanAddress = cleanAddress.replace(/^[\s,]+|[\s,]+$/g, "").replace(/,\s*,/g, ",");
  if (!cleanAddress) cleanAddress = rawAddress;

  return { firstName, lastName, phone, cleanAddress };
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const body = await req.json().catch(() => ({}));
    const selectedOrderIds: string[] = body?.orderIds || [];

    // 1. Get the settings
    const { data: settings, error: settingsError } = await supabase
      .from("business_settings")
      .select("woo_api_url, woo_consumer_key, woo_consumer_secret")
      .limit(1)
      .single();

    if (settingsError || !settings || !settings.woo_api_url) {
      return NextResponse.json({ error: "WooCommerce credentials not set in Settings" }, { status: 400 });
    }

    let consumerKey = settings.woo_consumer_key || "";
    let consumerSecret = settings.woo_consumer_secret || "";

    if (consumerKey.includes(":")) {
      try { consumerKey = decryptSecret(consumerKey); } catch (_) {}
    }
    if (consumerSecret.includes(":")) {
      try { consumerSecret = decryptSecret(consumerSecret); } catch (_) {}
    }

    // 2. Fetch selected orders or pending/failed orders
    let query = supabase
      .from("orders")
      .select("*, customers(name, platform_id, platform)")
      .not("status", "eq", "cancelled");

    if (selectedOrderIds.length > 0) {
      query = query.in("id", selectedOrderIds);
    } else {
      query = query.in("woo_sync_status", ["pending", "failed"]);
    }

    const { data: pendingOrders, error: ordersError } = await query;

    if (ordersError || !pendingOrders || pendingOrders.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    // 3. Process each selected order
    let syncedCount = 0;
    const apiUrl = settings.woo_api_url.replace(/\/$/, "");
    const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

    for (const order of pendingOrders) {
      try {
        const rawLineItems = [];
        for (const i of (order.items || [])) {
          let resolvedWooProductId = i.wooProductId;
          let resolvedVariationId = i.wooVariationId;
          let variantSku: string | undefined;
          let variantAttrs: Record<string, string> | undefined;
          
          let productData: any = null;

          if (i.productId) {
            const { data } = await supabase
              .from("products")
              .select("woo_product_id, variations")
              .eq("id", i.productId)
              .maybeSingle();
              
            productData = data;

            if (data?.woo_product_id) resolvedWooProductId = data.woo_product_id;

            if (i.variantId && data?.variations) {
              const variant = (data.variations as any[]).find(
                (v: any) => String(v.id) === String(i.variantId) || String(v.woo_variation_id) === String(i.variantId)
              );
              if (variant) {
                if (variant.woo_variation_id) resolvedVariationId = variant.woo_variation_id;
                if (variant.sku) variantSku = variant.sku;
                if (variant.attributes) variantAttrs = variant.attributes;
              }
            }
          }

          const itemTotal = String((i.unitPrice || 0) * (i.qty || 1));
          const lineItem: any = {
            product_id: resolvedWooProductId,
            quantity: i.qty || 1,
            total: itemTotal,
            subtotal: itemTotal,
          };
          
          if (resolvedVariationId) {
            lineItem.variation_id = resolvedVariationId;
          }
          
          if (variantSku) lineItem.sku = variantSku;
          if (variantAttrs) {
            lineItem.meta_data = Object.entries(variantAttrs).map(([key, value]) => ({
              key: `attribute_${key.toLowerCase().replace(/\s+/g, "-")}`,
              value: String(value),
            }));
          }

          // Strict validation: if the product has variations but no variation_id is set,
          // we should NOT blindly sync the base product.
          const hasVariations = productData?.variations && (productData.variations as any[]).length > 0;
          if (hasVariations && !resolvedVariationId) {
            console.error(`[SYNC BLOCK] Order ${order.id} item ${i.productId} requires a variation but none was resolved. Blocking sync.`);
            // Append a warning to the item for future debugging
            rawLineItems.push({ _sync_blocked_missing_variant: true, product_id: resolvedWooProductId });
            continue;
          }

          rawLineItems.push(lineItem);
        }

        const lineItems = rawLineItems.filter((i: any) => i.product_id && !i._sync_blocked_missing_variant);

        if (lineItems.length === 0 || rawLineItems.some((i: any) => i._sync_blocked_missing_variant)) {
          // Can't push an order with no mapped products or if it was explicitly blocked
          console.error(`[SYNC FAILED] Order ${order.id} failed due to missing variation or no valid items.`);
          
          // Optionally add an internal note indicating missing variant
          let failedReason = "No valid products found.";
          if (rawLineItems.some((i: any) => i._sync_blocked_missing_variant)) {
            failedReason = "⚠️ NO VARIANT CONFIRMED";
          }
          
          await supabase.from("orders").update({ 
            woo_sync_status: "failed",
            woo_sync_attempts: (order.woo_sync_attempts || 0) + 1,
            // we could store the reason in a new column or just leave it failed so admin checks it
          }).eq("id", order.id);
          continue;
        }

        // ── Priority: Use DB columns (customer_name, customer_phone) over parsing delivery_address
        const dbPhone = order.customer_phone || "";
        const dbName = order.customer_name || order.customers?.name || "";
        const { firstName: parsedFirst, lastName: parsedLast, phone: parsedPhone, cleanAddress } = parseOrderContactInfo(
          order.delivery_address || "",
          dbName,
          order.customers?.platform_id || "",
          order.customers?.platform || ""
        );

        // Use DB phone first, then parsed from address, then WhatsApp platform_id
        const finalPhone = dbPhone || parsedPhone || (order.customers?.platform === "whatsapp" ? order.customers.platform_id : "");
        // Use DB name first, then parsed
        const finalName = dbName || `${parsedFirst} ${parsedLast}`.trim() || "Customer";
        const nameParts = finalName.split(" ");
        const firstName = nameParts[0] || "Customer";
        const lastName = nameParts.slice(1).join(" ") || "";
        // Use clean address — strip phone and name from raw delivery_address
        const finalAddress = cleanAddress || order.delivery_address || "";

        const payload = {
          payment_method: order.payment_method === "cod" ? "cod" : "bacs",
          payment_method_title: order.payment_method === "cod" ? "Cash on Delivery" : "Bank Transfer",
          set_paid: false,
          status: "processing",
          billing: {
            first_name: firstName,
            last_name: lastName,
            phone: finalPhone,
            address_1: finalAddress,
            country: "BD",
          },
          shipping: {
            first_name: firstName,
            last_name: lastName,
            address_1: finalAddress,
            country: "BD",
          },
          line_items: lineItems,
          meta_data: [{ key: "_growthomic_source", value: "ai_chat_agent" }],
        };

        const res = await fetch(`${apiUrl}/wp-json/wc/v3/orders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${authString}`,
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const wooOrder = await res.json();
          await supabase.from("orders").update({ 
            woo_sync_status: "synced", 
            woo_order_id: wooOrder.id 
          }).eq("id", order.id);
          syncedCount++;
        } else {
          await supabase.from("orders").update({ woo_sync_status: "failed" }).eq("id", order.id);
        }
      } catch (err) {
        console.error("Error syncing individual order", err);
        await supabase.from("orders").update({ woo_sync_status: "failed" }).eq("id", order.id);
      }
    }

    return NextResponse.json({ success: true, count: syncedCount });

  } catch (error: any) {
    console.error("Bulk WooSync Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
