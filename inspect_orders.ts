import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const sb = createClient(supabaseUrl, supabaseKey);

async function checkRecentOrders() {
  console.log("Fetching most recent 3 orders...");
  const { data: orders, error } = await sb
    .from('orders')
    .select('id, created_at, items, woo_order_id, woo_sync_status')
    .order('created_at', { ascending: false })
    .limit(3);

  if (error) {
    console.error("Error fetching orders:", error);
    return;
  }

  for (const o of orders) {
    console.log(`\nOrder ID: ${o.id}`);
    console.log(`Created: ${o.created_at}, WooSync: ${o.woo_sync_status}, WooOrderId: ${o.woo_order_id}`);
    console.log("Items:");
    for (const item of (o.items || [])) {
      console.log(`  - Name: ${item.name}`);
      console.log(`    Supabase productId: ${item.productId}`);
      console.log(`    wooProductId: ${item.wooProductId}`);
      console.log(`    wooVariationId: ${item.wooVariationId}`);
      console.log(`    qty: ${item.qty}, price: ${item.unitPrice}`);
      
      if (item.productId) {
        const { data: p } = await sb.from('products').select('woo_product_id, sku').eq('id', item.productId).single();
        console.log(`    -> Product DB woo_product_id: ${p?.woo_product_id}, sku: ${p?.sku}`);
      }
    }
  }
}

checkRecentOrders();
