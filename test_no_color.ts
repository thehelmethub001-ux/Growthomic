import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: "frontend/.env.prod" });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkProducts() {
  const { data: products, error } = await sb.from("products").select("id, name, variations").not("variations", "is", null);
  
  if (error) {
    console.error("DB Error:", error);
    return;
  }
  if (!products) {
    console.log("No products found.");
    return;
  }

  const affected = products.filter((p: any) => {
    if (!p.variations || p.variations.length === 0) return false;
    // return true if ALL variations have NO Color attribute
    const allNoColor = p.variations.every((v: any) => !v.attributes || !v.attributes.Color);
    return allNoColor;
  });

  console.log(`\n=== Products with variations but NO Color attribute (${affected.length} found) ===`);
  affected.forEach((p: any) => console.log(`- ${p.name} (ID: ${p.id})`));
}

checkProducts().catch(console.error);
