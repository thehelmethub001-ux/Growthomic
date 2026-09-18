import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runCleanup() {
  console.log("Running one-time cleanup for bad variant IDs...");

  // 1. Clean Conversations table
  const { data: convs, error: convErr } = await supabase
    .from("conversations")
    .select("id, last_product_id, last_variant_id")
    .not("last_variant_id", "is", null);

  if (convErr) {
    console.error("Error fetching conversations:", convErr);
    return;
  }

  let convUpdated = 0;
  for (const c of convs) {
    if (c.last_product_id === c.last_variant_id) {
      const { error: updateErr } = await supabase
        .from("conversations")
        .update({ last_variant_id: null })
        .eq("id", c.id);
      
      if (!updateErr) {
        console.log(`Reset last_variant_id for conversation ${c.id}`);
        convUpdated++;
      }
    }
  }

  console.log(`Finished checking conversations. Reset ${convUpdated} corrupted rows.`);
}

runCleanup().catch(console.error);
