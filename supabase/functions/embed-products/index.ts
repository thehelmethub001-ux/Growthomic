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

async function getGeminiTextEmbedding(text: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/text-embedding-004",
      content: { parts: [{ text: text }] },
      outputDimensionality: 768
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.embedding.values;
}

interface EmbedTask {
  productId: string;
  variationWooId: number | null;
  imageUrl: string;
  productData: any;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: corsHeaders }); }

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

    // Fetch active products with images and variations
    const { data: allProducts, error: prodErr } = await sb
      .from("products")
      .select(`
        id,
        name,
        description,
        category,
        images,
        variations,
        is_active
      `);

    if (prodErr) throw prodErr;

    const tasks: EmbedTask[] = [];

    for (const p of allProducts || []) {
      if (p.images) {
        for (const img of p.images) {
          tasks.push({ productId: p.id, variationWooId: null, imageUrl: img, productData: p });
        }
      }
      if (p.variations) {
        for (const v of p.variations) {
          if (v.image_url) {
            tasks.push({ productId: p.id, variationWooId: v.woo_variation_id || null, imageUrl: v.image_url, productData: p });
          }
        }
      }
    }

    if (tasks.length === 0) {
      return new Response(JSON.stringify({ message: "No active products with images found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Fetch existing embedded image_urls to skip them
    const { data: existingEmbeddings, error: embedErr } = await sb
      .from("product_embeddings")
      .select("image_url")
      .not("image_url", "is", null);

    if (embedErr) throw embedErr;

    const existingUrls = new Set(existingEmbeddings?.map(e => e.image_url) || []);
    
    // Filter out already embedded images, deduplicate by image_url, and take only the first 10
    const uniqueTasks = new Map<string, EmbedTask>();
    for (const task of tasks) {
      if (!existingUrls.has(task.imageUrl) && !uniqueTasks.has(task.imageUrl)) {
        uniqueTasks.set(task.imageUrl, task);
      }
    }

    const tasksToProcess = Array.from(uniqueTasks.values()).slice(0, 10);

    if (tasksToProcess.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "All images already embedded." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const errorLogs: string[] = [];

    for (const task of tasksToProcess) {
      try {
        // 1. Download and convert to Base64
        const { base64, mimeType } = await urlToBase64(task.imageUrl);

        // 2. Call Gemini
        let embeddingValues: number[];
        try {
           embeddingValues = await getGeminiEmbedding(base64, mimeType, apiKey);
        } catch (apiErr) {
           console.warn(`Initial API call failed for image ${task.imageUrl}, retrying once...`, apiErr);
           embeddingValues = await getGeminiEmbedding(base64, mimeType, apiKey);
        }

        // Add a delay to avoid hitting rate limits
        await new Promise(r => setTimeout(r, 2000));

        // 3. Save to product_embeddings
        const { error: insertErr } = await sb.from("product_embeddings").insert({
          product_id: task.productId,
          variation_woo_id: task.variationWooId,
          image_url: task.imageUrl,
          embedding: embeddingValues
        });

        if (insertErr) {
          console.error(`DB Insert Error for image ${task.imageUrl}:`, insertErr);
          throw insertErr;
        }
        
        processed++;
        console.log(`Successfully embedded image ${task.imageUrl}`);
        
      } catch (err: any) {
        console.error(`Failed to process an image ${task.imageUrl}:`, err);
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
