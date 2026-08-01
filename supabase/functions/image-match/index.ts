import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, getBusinessSettings } from "../_shared/supabase-client.ts";
import { corsHeaders } from "../_shared/cors.ts";

async function getGeminiEmbedding(base64: string, mimeType: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`;
  
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "models/gemini-embedding-2",
      content: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64
            }
          }
        ]
      },
      outputDimensionality: 768
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini Embedding API Error: ${text}`);
  }

  const json = await res.json();
  if (!json.embedding || !json.embedding.values) {
    throw new Error(`Unexpected Gemini response format: ${JSON.stringify(json)}`);
  }

  return json.embedding.values;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { base64, mimeType = "image/jpeg", threshold = 0.70, matchCount = 3 } = body;

    if (!base64) {
      return new Response(JSON.stringify({ error: "Missing base64 image data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const sb = getSupabaseClient();
    const settings = await getBusinessSettings();
    const apiKey = settings.geminiApiKey || Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No GEMINI_API_KEY found in settings or env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 1. Get embedding for the query image
    const embeddingValues = await getGeminiEmbedding(base64, mimeType, apiKey);
    const embeddingStr = `[${embeddingValues.join(",")}]`;

    // 2. Call Supabase RPC to find best matches
    const { data: matches, error: rpcErr } = await sb.rpc("match_product_by_image", {
      query_embedding: embeddingStr,
      match_threshold: threshold,
      match_count: matchCount
    });

    if (rpcErr) throw rpcErr;

    // 3. Fetch product details for the matches
    const enrichedMatches = [];
    if (matches && matches.length > 0) {
      const productIds = matches.map((m: any) => m.product_id);
      const { data: products } = await sb
        .from("products")
        .select("id, name, sale_price, regular_price, images, stock_quantity, is_active")
        .in("id", productIds);

      if (products) {
        for (const match of matches) {
          const productInfo = products.find(p => p.id === match.product_id);
          if (productInfo) {
            enrichedMatches.push({
              ...productInfo,
              similarity: match.similarity
            });
          }
        }
      }
    }

    // Sort enriched matches purely by similarity descending. 
    // We MUST NOT prioritize in-stock items over higher similarity matches, 
    // because the AI needs to correctly identify the exact product (even if out of stock) 
    // so it can tell the customer "This item is out of stock".
    enrichedMatches.sort((a, b) => b.similarity - a.similarity);

    return new Response(JSON.stringify({ success: true, matches: enrichedMatches }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("image-match error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
