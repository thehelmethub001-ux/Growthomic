import { getSupabaseClient } from "./supabase/functions/_shared/supabase-client.ts";

async function run() {
  const sb = getSupabaseClient();
  const { data: embeddings } = await sb.from("product_embeddings").select("product_id, embedding").limit(5);
  
  if (!embeddings || embeddings.length < 2) return console.log("Not enough embeddings");
  
  const v1 = JSON.parse(embeddings[0].embedding);
  const v2 = JSON.parse(embeddings[1].embedding);
  
  let dotProduct = 0;
  for(let i=0; i<v1.length; i++) {
     dotProduct += v1[i] * v2[i];
  }
  console.log(`Cosine similarity between two DIFFERENT products: ${dotProduct}`);
}
run();
