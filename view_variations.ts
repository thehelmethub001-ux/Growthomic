import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import * as dotenv from 'https://deno.land/x/dotenv/mod.ts';

const env = dotenv.load();
const supabaseUrl = env.SUPABASE_URL || Deno.env.get('SUPABASE_URL');
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const sb = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await sb.from('products').select('id, name, woo_product_id, variations').ilike('name', '%Spark Metro%');
  if (error) { console.error(error); return; }
  console.log(JSON.stringify(data, null, 2));
}

test();
