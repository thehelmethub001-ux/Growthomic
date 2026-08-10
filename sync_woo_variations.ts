import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Starting Woo Variation Sync...");
  
  // 1. Get business settings
  const { data: settings } = await supabase
    .from("business_settings")
    .select("woo_api_url, woo_consumer_key, woo_consumer_secret")
    .limit(1)
    .single();

  if (!settings?.woo_api_url || !settings?.woo_consumer_key || !settings?.woo_consumer_secret) {
    console.error("WooCommerce credentials not found in business_settings");
    return;
  }

  const { woo_api_url, woo_consumer_key, woo_consumer_secret } = settings;
  const baseUrl = woo_api_url.endsWith("/") ? woo_api_url.slice(0, -1) : woo_api_url;

  const authHeader = "Basic " + Buffer.from(`${woo_consumer_key}:${woo_consumer_secret}`).toString("base64");

  // 2. Get all products with woo_product_id and variations
  const { data: products } = await supabase
    .from("products")
    .select("id, name, woo_product_id, variations")
    .not("woo_product_id", "is", null);

  if (!products || products.length === 0) {
    console.log("No products found mapped to WooCommerce.");
    return;
  }

  let updatedCount = 0;

  for (const product of products) {
    if (!product.variations || product.variations.length === 0) continue;

    console.log(`Processing Product: ${product.name} (Woo ID: ${product.woo_product_id})`);
    
    // Fetch variations from WooCommerce
    try {
      const res = await fetch(`${baseUrl}/wp-json/wc/v3/products/${product.woo_product_id}/variations?per_page=100`, {
        headers: {
          "Authorization": authHeader,
          "Accept": "application/json"
        }
      });
      
      if (!res.ok) {
        console.error(`Failed to fetch variations for ${product.name}: ${res.statusText}`);
        continue;
      }
      
      const wooVariations = await res.json();
      if (!Array.isArray(wooVariations) || wooVariations.length === 0) {
        console.log(`No variations found in WooCommerce for ${product.name}.`);
        continue;
      }
      
      let modified = false;
      const newVariations = product.variations.map((v: any) => {
        // Find matching variation in wooVariations
        // v.attributes looks like: { "Color/Size": "Matt Black Gray" } or { "Variation": "Blue" }
        const attrValues = Object.values(v.attributes || {}).map(String).map(s => s.toLowerCase());
        
        let match = wooVariations.find((wv: any) => {
          // wv.attributes is an array: [ { name: "Color", option: "Blue" }, ... ]
          const wooAttrValues = wv.attributes.map((a: any) => String(a.option).toLowerCase());
          
          // If any of the local attribute values match exactly or are included in the woo attributes
          return attrValues.some(val => 
            wooAttrValues.some((wooVal: string) => val.includes(wooVal) || wooVal.includes(val))
          );
        });

        if (match) {
          if (v.woo_variation_id !== match.id) {
            console.log(`  - Matched '${Object.values(v.attributes || {})}' => Woo ID: ${match.id}`);
            modified = true;
          }
          return { ...v, woo_variation_id: match.id };
        } else {
          console.log(`  - Could NOT match '${Object.values(v.attributes || {})}'`);
          return v;
        }
      });
      
      if (modified) {
        const { error } = await supabase
          .from("products")
          .update({ variations: newVariations })
          .eq("id", product.id);
          
        if (error) {
          console.error(`Failed to update product ${product.id}:`, error.message);
        } else {
          console.log(`Successfully updated ${product.name} with Variation IDs.`);
          updatedCount++;
        }
      }
    } catch (err: any) {
      console.error(`Error processing ${product.name}:`, err.message);
    }
  }
  
  console.log(`Finished! Updated ${updatedCount} products.`);
}

main().catch(console.error);
