import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
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

    let allWooProducts: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(`${wooApiEndpoint}?per_page=100&page=${page}`, {
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

      const productsPage = await response.json();
      if (productsPage.length > 0) {
        allWooProducts = allWooProducts.concat(productsPage);
        page++;
      } else {
        hasMore = false;
      }
    }

    // 3. Transform and Upsert to Supabase
    let syncedCount = 0;

    for (const wp of allWooProducts) {
      const images = wp.images?.map((img: any) => img.src) || [];
      const stock = wp.manage_stock && wp.stock_quantity !== null 
        ? wp.stock_quantity 
        : (wp.stock_status === "instock" ? 10 : 0);
      const category = wp.categories && wp.categories.length > 0 
        ? wp.categories.map((c: any) => c.name).join(", ") 
        : null;
      
      // Strip HTML tags from description
      let plainTextDesc = wp.short_description 
        ? wp.short_description.replace(/<[^>]*>?/gm, '') 
        : wp.description?.replace(/<[^>]*>?/gm, '') || "";
        
      // Append Attributes (Sizes, Colors, etc.) so AI knows about variations
      if (wp.attributes && wp.attributes.length > 0) {
        const attrStrings = wp.attributes.map((attr: any) => `${attr.name}: ${attr.options?.join(", ")}`);
        if (attrStrings.length > 0) {
          plainTextDesc += `\n[Available Options -> ${attrStrings.join(" | ")}]`;
        }
      }

      // We use woo_product_id to uniquely identify items
      // Check if product already exists
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("woo_product_id", wp.id)
        .maybeSingle();

      let variationsData = [];
      if (wp.type === "variable" && wp.variations && wp.variations.length > 0) {
        try {
          const varRes = await fetch(
            `${settings.woo_api_url}/wp-json/wc/v3/products/${wp.id}/variations?consumer_key=${settings.woo_consumer_key}&consumer_secret=${settings.woo_consumer_secret}&per_page=100`
          );
          if (varRes.ok) {
            const varJson = await varRes.json();
            variationsData = varJson.map((v: any) => ({
              id: v.id,
              price: parseFloat(v.sale_price) || parseFloat(v.regular_price) || parseFloat(v.price) || 0,
              stock: v.manage_stock ? v.stock_quantity : (v.stock_status === "instock" ? 10 : 0),
              image_url: v.image?.src || null,
              attributes: v.attributes?.reduce((acc: any, attr: any) => {
                acc[attr.name] = attr.option;
                return acc;
              }, {}) || {}
            }));
          }
        } catch (err) {
          console.error("Failed to fetch variations for product:", wp.id, err);
        }
      }

      const payload = {
        woo_product_id: wp.id,
        name: wp.name,
        sku: wp.sku || null,
        regular_price: parseFloat(wp.regular_price) || parseFloat(wp.price) || 0,
        sale_price: wp.sale_price ? parseFloat(wp.sale_price) : null,
        stock_quantity: stock,
        images: images,
        category: category,
        description: plainTextDesc,
        is_active: wp.status === "publish",
        variations: variationsData
      };

      if (existing) {
        await supabase.from("products").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("products").insert([payload]);
      }
      syncedCount++;
    }

    // 4. Trigger Vector Embedding Generation asynchronously
    // Fire and forget - don't wait for it to complete so we don't hold up the API response
    const embedFnUrl = `${supabaseUrl}/functions/v1/embed-products`;
    fetch(embedFnUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`
      }
    }).catch(err => console.error("Failed to trigger embed-products:", err));

    return NextResponse.json({ success: true, count: syncedCount });

  } catch (error: any) {
    console.error("WooSync Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
