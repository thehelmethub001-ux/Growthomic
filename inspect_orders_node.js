const fs = require('fs');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync('.env.local'));

async function main() {
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/orders?select=id,created_at,woo_order_id,items,woo_sync_status&order=created_at.desc&limit=3`;
  const res = await fetch(url, {
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

main();
