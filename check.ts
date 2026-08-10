import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  const { data, error } = await sb.from('products').select('id, name, variations').ilike('name', '%Spark Metro%');
  if (error) {
    console.error(error);
  } else {
    for (const p of data) {
      console.log(`Product: ${p.name}`);
      for (const v of p.variations || []) {
        console.log(`  - Variation ${v.id}: ${JSON.stringify(v.attributes)}, stock: ${v.stock}`);
      }
    }
  }
}
run();
