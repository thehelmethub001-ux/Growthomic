import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, getBusinessSettings } from "../_shared/supabase-client.ts";
import { corsHeaders } from "../_shared/cors.ts";

async function getGeminiEmbedding(base64: string, mimeType: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-2",
      content: { parts: [{ inlineData: { mimeType, data: base64 } }] },
      outputDimensionality: 768
    })
  });
  if (!res.ok) throw new Error(`Gemini API Error: ${await res.text()}`);
  const json = await res.json();
  return json.embedding.values;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: corsHeaders }); }
  try {
    const body = await req.json();
    const { base64, mimeType = "image/jpeg", threshold = 0.45, matchCount = 6 } = body;
    if (!base64) { return new Response(JSON.stringify({ error: "Missing base64 image data" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

    const sb = getSupabaseClient();
    const settings = await getBusinessSettings();
    const apiKey = settings.geminiApiKey || Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) { return new Response(JSON.stringify({ error: "No GEMINI_API_KEY found" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

    const queryEmbedding = await getGeminiEmbedding(base64, mimeType, apiKey);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    const { data: matches, error: rpcErr } = await sb.rpc("match_product_by_image", { query_embedding: embeddingStr, match_threshold: threshold, match_count: matchCount });
    if (rpcErr) throw rpcErr;

    const enrichedMatches: any[] = [];
    if (matches && matches.length > 0) {
      const productIds = Array.from(new Set(matches.map((m: any) => m.product_id).filter(Boolean)));
      
      const { data: products } = await sb
        .from("products")
        .select(`
          id,
          name,
          sale_price,
          regular_price,
          stock_quantity,
          is_active,
          images,
          variations
        `)
        .in("id", productIds);

      if (products) {
        for (const match of matches) {
          const product = products.find((p: any) => p.id === match.product_id);
          if (product) {
            // Find specific variation if variation_woo_id is present
            let color = "Default";
            let images = product.images || [];
            let stock_quantity = product.stock_quantity;
            let variation_woo_id = match.variation_woo_id;
            
            if (variation_woo_id && product.variations) {
               const variant = product.variations.find((v: any) => v.woo_variation_id === variation_woo_id);
               if (variant) {
                 // Try all common color attribute key names (WooCommerce stores as pa_color, Color, color etc.)
                 const attrs = variant.attributes || {};
                 color = attrs["Color"] || attrs["color"] || attrs["pa_color"] || attrs["Colour"] || attrs["colour"] || "Default";
                 images = variant.image_url ? [variant.image_url] : images;
                 // stock_quantity is now correctly saved as stock_quantity (fixed in woo-sync)
                 stock_quantity = typeof variant.stock_quantity === 'number' ? variant.stock_quantity : stock_quantity;
               }
            }

            enrichedMatches.push({
              product_id: product.id,
              variation_woo_id: variation_woo_id,
              product_name: product.name,
              color: color,
              sale_price: product.sale_price,
              regular_price: product.regular_price,
              images: images,
              stock_quantity: stock_quantity,
              is_active: product.is_active,
              similarity: match.similarity
            });
          }
        }
      }
    }
    enrichedMatches.sort((a, b) => b.similarity - a.similarity);

    return new Response(JSON.stringify({ success: true, matches: enrichedMatches }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("image-match error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
