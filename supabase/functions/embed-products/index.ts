import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, getBusinessSettings } from "../_shared/supabase-client.ts";
import { corsHeaders } from "../_shared/cors.ts";

async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
  
  const buffer = await res.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
  );
  
  let mimeType = res.headers.get("content-type") || "image/jpeg";
  if (!mimeType.startsWith("image/")) mimeType = "image/jpeg";
  
  return { base64, mimeType };
}

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
    const sb = getSupabaseClient();
    const settings = await getBusinessSettings();
    const apiKey = settings.geminiApiKey || Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No GEMINI_API_KEY found in settings or env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Fetch products and filter for those with images in JS to avoid PostgREST array format quirks
    const { data: allProducts, error: prodErr } = await sb
      .from("products")
      .select("id, images");

    if (prodErr) throw prodErr;
    
    const products = (allProducts || []).filter(p => p.images && p.images.length > 0);
    
    if (products.length === 0) {
      return new Response(JSON.stringify({ message: "No products with images found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Fetch existing embedded product IDs to skip them
    const { data: existingEmbeddings, error: embedErr } = await sb
      .from("product_embeddings")
      .select("product_id");

    if (embedErr) throw embedErr;

    const existingIds = new Set(existingEmbeddings?.map(e => e.product_id) || []);
    
    // Filter out already embedded products and take only the first 5
    const productsToProcess = products.filter(p => !existingIds.has(p.id)).slice(0, 5);

    if (productsToProcess.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "All products are already embedded." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const errorLogs: string[] = [];

    // Process products
    for (const product of productsToProcess) {

      const imagesToProcess = product.images || [];
      if (imagesToProcess.length === 0) {
        skipped++;
        continue;
      }

      let successForProduct = false;

      for (const imageUrl of imagesToProcess) {
        try {
          // 1. Download and convert to Base64
          const { base64, mimeType } = await urlToBase64(imageUrl);

          // 2. Call Gemini
          let embeddingValues: number[];
          try {
             embeddingValues = await getGeminiEmbedding(base64, mimeType, apiKey);
          } catch (apiErr) {
             console.warn(`Initial API call failed for ${product.id} image, retrying once...`, apiErr);
             embeddingValues = await getGeminiEmbedding(base64, mimeType, apiKey);
          }

          // Add a delay to avoid hitting rate limits (especially for variants)
          await new Promise(r => setTimeout(r, 2000));

          // 3. Save to product_embeddings
          const { error: insertErr } = await sb.from("product_embeddings").insert({
            product_id: product.id,
            embedding: embeddingValues
          });

          if (insertErr) {
            console.error(`DB Insert Error for ${product.id}:`, insertErr);
            throw insertErr;
          }
          successForProduct = true;
        } catch (err: any) {
          console.error(`Failed to process an image for ${product.id}:`, err);
        }
      }

      if (successForProduct) {
        processed++;
        console.log(`Successfully embedded product ${product.id}`);
      } else {
        errors++;
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed, 
      skipped, 
      errors,
      errorLogs
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Unhandled edge function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
