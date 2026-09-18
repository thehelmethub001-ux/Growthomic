// test_woo_order.js
// Test script: DB theke credentials niye WooCommerce-e test order push kore verify korbe
// SKU, variation_id, color attribute sob ache kina

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: "./frontend/.env.local" });
require("dotenv").config({ path: "./frontend/.env" });

// Read from supabase env
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ SUPABASE_URL or KEY missing. Check your .env files.");
  process.exit(1);
}

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. Get WooCommerce credentials
  const { data: settings } = await sb
    .from("business_settings")
    .select("woo_api_url, woo_consumer_key, woo_consumer_secret")
    .limit(1)
    .single();

  if (!settings?.woo_api_url) {
    console.error("❌ WooCommerce settings not found in DB");
    process.exit(1);
  }

  console.log("✅ WooCommerce URL:", settings.woo_api_url);

  // 2. Fetch a variable product with variations from DB
  const { data: products } = await sb
    .from("products")
    .select("id, name, woo_product_id, variations")
    .not("woo_product_id", "is", null)
    .limit(20);

  const variableProduct = products?.find(p =>
    p.variations && p.variations.length > 0 &&
    p.variations.some((v) => v.woo_variation_id && v.sku && v.attributes)
  );

  if (!variableProduct) {
    // Try any product with variations
    const anyWithVars = products?.find(p => p.variations && p.variations.length > 0);
    if (!anyWithVars) {
      console.error("❌ No product with woo_product_id + variations found in DB.");
      console.log("Products found:", products?.map(p => `${p.name} (vars: ${p.variations?.length || 0})`));
      process.exit(1);
    }
    console.log("⚠️  Found product with variations but missing sku/attributes:", anyWithVars.name);
    console.log("Variations sample:", JSON.stringify(anyWithVars.variations?.[0], null, 2));
    process.exit(1);
  }

  const testVariant = variableProduct.variations.find(v => v.woo_variation_id && v.sku && v.attributes);
  console.log("\n✅ Test Product:", variableProduct.name);
  console.log("   woo_product_id:", variableProduct.woo_product_id);
  console.log("   Variant:", JSON.stringify(testVariant, null, 2));

  // 3. Build WooCommerce order payload (same as our woocommerce.ts logic)
  const attrMeta = Object.entries(testVariant.attributes || {}).map(([key, value]) => ({
    key: `attribute_pa_${key.toLowerCase().replace(/\s+/g, "-")}`,
    value: String(value),
  }));

  const lineItem = {
    product_id: variableProduct.woo_product_id,
    quantity: 1,
    variation_id: testVariant.woo_variation_id,
    sku: testVariant.sku,
    meta_data: attrMeta,
  };

  console.log("\n📦 Line item to push:", JSON.stringify(lineItem, null, 2));

  const payload = {
    payment_method: "cod",
    payment_method_title: "সম্পূর্ণ ক্যাশ অন ডেলিভারি",
    set_paid: false,
    status: "processing",
    billing: {
      first_name: "Test",
      last_name: "Growthomic",
      phone: "01700000000",
      address_1: "Test Address, Dhaka",
      country: "BD",
    },
    shipping: {
      first_name: "Test",
      last_name: "Growthomic",
      address_1: "Test Address, Dhaka",
      country: "BD",
    },
    line_items: [lineItem],
    meta_data: [{ key: "_growthomic_source", value: "test_script" }],
  };

  // 4. Push to WooCommerce
  const credentials = Buffer.from(`${settings.woo_consumer_key}:${settings.woo_consumer_secret}`).toString("base64");
  const apiUrl = settings.woo_api_url.replace(/\/$/, "");

  console.log("\n🚀 Pushing test order to WooCommerce...");
  const res = await fetch(`${apiUrl}/wp-json/wc/v3/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json();

  if (!res.ok) {
    console.error("❌ WooCommerce push FAILED:", JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log("\n✅ ORDER CREATED SUCCESSFULLY!");
  console.log("   WooCommerce Order ID:", result.id);
  console.log("   Order URL: " + apiUrl + "/wp-admin/admin.php?page=wc-orders&action=edit&id=" + result.id);
  console.log("\n   Line Items in WooCommerce:");
  for (const li of result.line_items || []) {
    console.log(`   - ${li.name}`);
    console.log(`     SKU: ${li.sku || "❌ MISSING"}`);
    console.log(`     Variation ID: ${li.variation_id || "❌ MISSING"}`);
    const color = li.meta_data?.find(m => m.key?.includes("color") || m.display_key?.toLowerCase().includes("color"));
    console.log(`     Color: ${color?.display_value || color?.value || "❌ MISSING"}`);
  }
}

main().catch(err => {
  console.error("Script Error:", err);
  process.exit(1);
});
