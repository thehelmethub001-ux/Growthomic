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
    .from("products")
    .select("name, variations")
    .limit(5);

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(JSON.stringify(data, null, 2));
}

main();
