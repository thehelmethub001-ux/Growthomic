import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    // 1. Get the settings
    const { data: settings, error: settingsError } = await supabase
      .from("business_settings")
      .select("woo_api_url, woo_consumer_key, woo_consumer_secret")
      .limit(1)
      .single();

    if (settingsError || !settings || !settings.woo_api_url) {
      return NextResponse.json({ error: "WooCommerce credentials not set" }, { status: 400 });
    }

    // 2. Fetch all pending or failed orders from the database
    const { data: pendingOrders, error: ordersError } = await supabase
      .from("orders")
      .select("*, customers(name, platform_id, platform)")
      .in("woo_sync_status", ["pending", "failed"])
      .not("status", "eq", "cancelled"); // don't sync cancelled ones

    if (ordersError || !pendingOrders || pendingOrders.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    // 3. Process each pending order
    let syncedCount = 0;
    const apiUrl = settings.woo_api_url.replace(/\/$/, "");
    const authString = Buffer.from(`${settings.woo_consumer_key}:${settings.woo_consumer_secret}`).toString("base64");

    for (const order of pendingOrders) {
      try {
        const lineItems = (order.items || [])
          .filter((i: any) => i.wooProductId)
          .map((i: any) => ({
            product_id: i.wooProductId,
            quantity: i.qty,
          }));

        if (lineItems.length === 0) {
          // Can't push an order with no mapped products
          await supabase.from("orders").update({ woo_sync_status: "failed" }).eq("id", order.id);
          continue;
        }

        const nameParts = (order.customers?.name || "Customer").split(" ");
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(" ") || "";
        const phone = order.customers?.platform === "whatsapp" ? order.customers?.platform_id : "";

        const payload = {
          payment_method: order.payment_method === "cod" ? "cod" : "bacs",
          payment_method_title: order.payment_method === "cod" ? "Cash on Delivery" : "Bank Transfer",
          set_paid: false,
          status: "processing",
          billing: {
            first_name: firstName,
            last_name: lastName,
            phone: phone,
            address_1: order.delivery_address || "",
            country: "BD",
          },
          shipping: {
            first_name: firstName,
            last_name: lastName,
            address_1: order.delivery_address || "",
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
