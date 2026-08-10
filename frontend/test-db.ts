import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await sb
    .from("orders")
    .select("id, created_at, items, woo_order_id, woo_sync_status")
    .order('created_at', { ascending: false })
    .limit(3);

  for (const o of data || []) {
    console.log(`\nOrder ID: ${o.id}`);
    console.log(`WooOrderId: ${o.woo_order_id}`);
    console.log("Items:");
    for (const item of (o.items || [])) {
      console.log(`  - Name: ${item.name}`);
      console.log(`    wooVariationId: ${item.wooVariationId}`);
    }
  }
}

main();
