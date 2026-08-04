import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkProducts() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/products?name=ilike.*Spark%20Metro%20Solid*&select=name,variations';
  const res = await fetch(url, {
    headers: {
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`
    }
  });
  
  const data = await res.json();
  fs.writeFileSync('scratch/products_rest.json', JSON.stringify(data, null, 2));
  console.log("Saved to scratch/products_rest.json");
}

checkProducts().catch(console.error);
