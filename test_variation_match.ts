import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import * as dotenv from 'https://deno.land/x/dotenv/mod.ts';

const env = dotenv.load();
const supabaseUrl = env.SUPABASE_URL || Deno.env.get('SUPABASE_URL');
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const sb = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await sb.from('products').select('woo_product_id, variations, name').limit(10);
  if (error) { console.error(error); return; }
  
  for (const p of data) {
    if (p.variations && p.variations.length > 0) {
      console.log(`Product: ${p.name}`);
      for (const v of p.variations) {
        console.log(`  Variation: ${v.id}, Attrs: ${JSON.stringify(v.attributes)}`);
        
        // Test matching
        const itemName = `${p.name} - ${Object.values(v.attributes).join(' ')}`;
        console.log(`    Testing with name: ${itemName}`);
        
        let match = true;
        const attrs = v.attributes || {};
        for (const key in attrs) {
          if (!itemName.toLowerCase().includes(String(attrs[key]).toLowerCase())) {
            match = false;
            break;
          }
        }
        console.log(`    Old Match Logic Result: ${match}`);
      }
    }
  }
}

test();
