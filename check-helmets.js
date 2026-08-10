import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, stock_quantity, is_active, category")
    .ilike("name", "%helmet%");
    
  console.log("DB Helmets:", data);
  
  if (error) console.error(error);
}

check();
