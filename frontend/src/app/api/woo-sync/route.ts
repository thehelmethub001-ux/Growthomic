import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Make sure these are in your .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST() {
  try {
    // 1. Get WooCommerce Credentials
    const { data: settings, error: settingsError } = await supabase
      .from("business_settings")
      .select("woo_api_url, woo_consumer_key, woo_consumer_secret")
      .limit(1)
      .single();

    if (settingsError || !settings) {
      return NextResponse.json({ error: "Could not find business settings" }, { status: 400 });
    }

    if (!settings.woo_api_url || !settings.woo_consumer_key || !settings.woo_consumer_secret) {
      return NextResponse.json({ error: "WooCommerce credentials not set in Settings" }, { status: 400 });
    }

    // 2. Fetch products from WooCommerce
    const storeUrl = settings.woo_api_url.replace(/\/$/, ""); // remove trailing slash
    const wooApiEndpoint = `${storeUrl}/wp-json/wc/v3/products`;

    // Basic Auth for WooCommerce
    const authString = Buffer.from(`${settings.woo_consumer_key}:${settings.woo_consumer_secret}`).toString("base64");

    const response = await fetch(`${wooApiEndpoint}?per_page=100`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${authString}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("WooCommerce fetch error:", errText);
      return NextResponse.json({ error: "Failed to fetch products from WooCommerce" }, { status: 400 });
    }

    const wooProducts = await response.json();

    // 3. Transform and Upsert to Supabase
    let syncedCount = 0;

    for (const wp of wooProducts) {
      const images = wp.images?.map((img: any) => img.src) || [];
      const stock = wp.stock_quantity || (wp.in_stock ? 10 : 0); // fallback if stock management is disabled
      const category = wp.categories?.[0]?.name || null;
      
      // Strip HTML tags from description
      const plainTextDesc = wp.short_description 
        ? wp.short_description.replace(/<[^>]*>?/gm, '') 
        : wp.description?.replace(/<[^>]*>?/gm, '') || "";

      // We use woo_product_id to uniquely identify items
      // Check if product already exists
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("woo_product_id", wp.id)
        .maybeSingle();

      const payload = {
        woo_product_id: wp.id,
        name: wp.name,
        sku: wp.sku || null,
        regular_price: parseFloat(wp.regular_price) || 0,
        sale_price: wp.sale_price ? parseFloat(wp.sale_price) : null,
        stock_quantity: stock,
        images: images,
        category: category,
        description: plainTextDesc,
        is_active: wp.status === "publish"
      };

      if (existing) {
        await supabase.from("products").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("products").insert([payload]);
      }
      syncedCount++;
    }

    return NextResponse.json({ success: true, count: syncedCount });

  } catch (error: any) {
    console.error("WooSync Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
