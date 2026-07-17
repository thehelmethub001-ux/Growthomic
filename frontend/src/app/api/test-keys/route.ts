import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { count: productCount } = await supabase.from("products").select("*", { count: "exact", head: true });
  const { count: embeddingCount } = await supabase.from("product_embeddings").select("*", { count: "exact", head: true });
  
  return NextResponse.json({ 
    productCount, 
    embeddingCount,
    message: embeddingCount === 0 ? "No embeddings found. Did the sync trigger the edge function?" : "Embeddings exist."
  });
}
