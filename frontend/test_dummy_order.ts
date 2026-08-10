import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.production" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // 1. Get business settings for Woo credentials
  const { data: settings } = await supabase
    .from("business_settings")
    .select("woo_api_url, woo_consumer_key, woo_consumer_secret")
    .limit(1)
    .single();

  if (!settings?.woo_api_url) {
    console.error("No Woo credentials");
    return;
  }

  // 2. Find a product that has a woo_variation_id
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .not("woo_product_id", "is", null);

  let targetProduct = null;
  let targetVariation = null;

  for (const p of products || []) {
    if (p.variations && p.variations.length > 0) {
      for (const v of p.variations) {
        if (v.woo_variation_id) {
          targetProduct = p;
          targetVariation = v;
          break;
        }
      }
    }
    if (targetVariation) break;
  }

  if (!targetProduct || !targetVariation) {
    console.log("Could not find any product with a woo_variation_id to test.");
    return;
  }

  console.log(`Testing with product: ${targetProduct.name}`);
  console.log(`Variation:`, targetVariation);

  const payload = {
    payment_method: "cod",
    payment_method_title: "Cash on Delivery",
    set_paid: false,
    status: "processing",
    billing: {
      first_name: "Test",
      last_name: "Customer",
      phone: "01700000000",
      address_1: "Test Address, Dhaka",
      country: "BD",
    },
    shipping: {
      first_name: "Test",
      last_name: "Customer",
      address_1: "Test Address, Dhaka",
      country: "BD",
    },
    line_items: [
      {
        name: targetProduct.name + " - " + Object.values(targetVariation.attributes || {})[0],
        product_id: targetProduct.woo_product_id,
        variation_id: targetVariation.woo_variation_id,
        quantity: 1,
        total: String(targetVariation.price || targetProduct.sale_price || targetProduct.regular_price)
      }
    ],
    meta_data: [
      {
        key: "_growthomic_source",
        value: "ai_chat_agent",
      },
    ],
  };

  const baseUrl = settings.woo_api_url.endsWith("/") ? settings.woo_api_url.slice(0, -1) : settings.woo_api_url;
  const authHeader = "Basic " + Buffer.from(`${settings.woo_consumer_key}:${settings.woo_consumer_secret}`).toString("base64");

  console.log("Pushing to WooCommerce:", JSON.stringify(payload, null, 2));

  const res = await fetch(`${baseUrl}/wp-json/wc/v3/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader,
    },
    body: JSON.stringify(payload),
  });

  const resText = await res.text();
  if (res.ok) {
    const orderData = JSON.parse(resText);
    console.log("Success! Created Woo Order ID:", orderData.id);
  } else {
    console.error("Failed to create order:", resText);
  }
}

main().catch(console.error);
