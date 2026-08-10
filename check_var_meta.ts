import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'frontend/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: settings } = await supabase
    .from("business_settings")
    .select("woo_api_url, woo_consumer_key, woo_consumer_secret")
    .limit(1)
    .single();

  if (!settings) {
    console.error("No settings");
    return;
  }

  const url = `${settings.woo_api_url}/wp-json/wc/v3/products/18585/variations/18616?consumer_key=${settings.woo_consumer_key}&consumer_secret=${settings.woo_consumer_secret}`;
  console.log("Fetching:", url.replace(settings.woo_consumer_secret, "SECRET"));
  
  const res = await fetch(url);
  const data = await res.json();
  
  console.log("Variation Main Image:", data.image?.src);
  
  if (data.meta_data) {
    console.log("\nMeta Data:");
    for (const meta of data.meta_data) {
      if (typeof meta.value === 'string' && meta.value.includes('http')) {
         console.log(`${meta.key} -> ${meta.value}`);
      } else if (Array.isArray(meta.value)) {
         console.log(`${meta.key} -> Array of length ${meta.value.length}`);
      } else if (typeof meta.value === 'object') {
         console.log(`${meta.key} -> Object`);
      } else if (meta.key.includes('gallery') || meta.key.includes('image')) {
         console.log(`${meta.key} -> ${meta.value}`);
      }
    }
    
    // Specifically check common keys
    const woodmart = data.meta_data.find(m => m.key === 'woodmart_variation_gallery_data');
    if (woodmart) console.log("Woodmart data:", JSON.stringify(woodmart.value));
    
    const wc_additional = data.meta_data.find(m => m.key === '_wc_additional_variation_images');
    if (wc_additional) console.log("WC Additional data:", wc_additional.value);
  }
}

check();
