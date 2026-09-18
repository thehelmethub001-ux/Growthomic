// push_test_order.js — DB theke credentials niye WooCommerce-e test order push kore
const fs = require('fs');
const envStr = fs.readFileSync('frontend/.env.local', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
  if (line.includes('=')) {
    const [k, ...v] = line.split('=');
    env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: SUPABASE credentials missing in frontend/.env.local");
  process.exit(1);
}

(async () => {
  try {
    // 1. Get WooCommerce settings + a product with variations from DB
    const [settingsRes, productsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/business_settings?select=woo_api_url,woo_consumer_key,woo_consumer_secret&limit=1`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
      }),
      fetch(`${SUPABASE_URL}/rest/v1/products?select=id,name,woo_product_id,variations&woo_product_id=not.is.null&limit=20`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
      })
    ]);

    const [settingsArr, products] = await Promise.all([settingsRes.json(), productsRes.json()]);
    const settings = settingsArr[0];

    if (!settings?.woo_api_url) { console.error("ERROR: WooCommerce settings missing"); process.exit(1); }
    console.log("WooCommerce URL:", settings.woo_api_url);

    // 2. Find a product variant with woo_variation_id + sku + attributes
    let testProduct = null, testVariant = null;
    for (const p of products) {
      const vars = p.variations || [];
      for (const v of vars) {
        if (v.woo_variation_id) {
          testProduct = p;
          testVariant = v;
          break;
        }
      }
      if (testProduct) break;
    }

    if (!testProduct) {
      console.error("ERROR: No product with woo_variation_id found. Variations sample:");
      products.slice(0, 3).forEach(p => {
        console.log(`  ${p.name}: ${(p.variations||[]).length} vars`);
        if (p.variations?.[0]) console.log("  Sample:", JSON.stringify(p.variations[0]));
      });
      process.exit(1);
    }

    console.log("\nTest Product:", testProduct.name);
    console.log("woo_product_id:", testProduct.woo_product_id);
    console.log("Variant:", JSON.stringify(testVariant, null, 2));

    // 3. Build line item (same as our woocommerce.ts)
    const lineItem = {
      product_id: testProduct.woo_product_id,
      quantity: 1,
      variation_id: testVariant.woo_variation_id,
    };
    if (testVariant.sku) lineItem.sku = testVariant.sku;
    if (testVariant.attributes) {
      lineItem.meta_data = Object.entries(testVariant.attributes).map(([k, v]) => ({
        key: `attribute_pa_${k.toLowerCase().replace(/\s+/g, '-')}`,
        value: String(v)
      }));
    }

    console.log("\nLine item to push:", JSON.stringify(lineItem, null, 2));

    // 4. Push to WooCommerce
    const creds = Buffer.from(`${settings.woo_consumer_key}:${settings.woo_consumer_secret}`).toString('base64');
    const wooUrl = settings.woo_api_url.replace(/\/$/, '');

    console.log("\nPushing test order to WooCommerce...");
    const res = await fetch(`${wooUrl}/wp-json/wc/v3/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${creds}` },
      body: JSON.stringify({
        payment_method: 'cod',
        payment_method_title: 'Cash on Delivery',
        set_paid: false,
        status: 'processing',
        billing: { first_name: 'Test', last_name: 'Growthomic', phone: '01700000000', address_1: 'Test Address, Dhaka', country: 'BD' },
        shipping: { first_name: 'Test', last_name: 'Growthomic', address_1: 'Test Address, Dhaka', country: 'BD' },
        line_items: [lineItem],
        meta_data: [{ key: '_growthomic_source', value: 'test_script' }]
      })
    });

    const result = await res.json();
    if (!res.ok) { console.error("FAILED:", JSON.stringify(result, null, 2)); process.exit(1); }

    console.log("\n====== ORDER CREATED SUCCESSFULLY ======");
    console.log("WooCommerce Order ID:", result.id);
    console.log("Order URL:", `${wooUrl}/wp-admin/admin.php?page=wc-orders&action=edit&id=${result.id}`);
    console.log("\nLine Items in WooCommerce:");
    for (const li of result.line_items || []) {
      console.log(`  - ${li.name}`);
      console.log(`    SKU: ${li.sku || 'MISSING'}`);
      console.log(`    variation_id: ${li.variation_id || 'MISSING'}`);
      const color = (li.meta_data || []).find(m => m.key?.includes('color') || m.display_key?.toLowerCase().includes('color'));
      console.log(`    Color: ${color?.display_value || color?.value || 'MISSING'}`);
    }

  } catch (e) { console.error("Error:", e); process.exit(1); }
})();
