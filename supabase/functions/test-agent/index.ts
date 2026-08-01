import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient } from "../_shared/supabase-client.ts";

serve(async (req: Request) => {
  const sb = getSupabaseClient();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  
  // 1. Fetch all products with images
  const { data: products, error } = await sb.from("products").select("id, name, images").not("images", "is", null);
  if (error) return new Response(JSON.stringify({ error }), { status: 500 });
  
  let body: any = {};
  try {
      body = await req.json();
  } catch(e) {}
  const offset = body.offset || 0;
  const limit = body.limit || 5;
  
  const validProducts = products.filter((p: any) => p.images && p.images.length > 0);
  const targetProducts = validProducts.slice(offset, offset + limit);
  
  let successCount = 0;
  let failCount = 0;
  let results: any[] = [];
  
  await Promise.all(targetProducts.map(async (p: any) => {
    const url = p.images[0];
    try {
      const imgRes = await fetch(url);
      const arrayBuffer = await imgRes.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(arrayBuffer);
      for (let j = 0; j < bytes.byteLength; j++) {
          binary += String.fromCharCode(bytes[j]);
      }
      const base64Image = btoa(binary);
      
      const res = await fetch(`https://pfzsursjuchrgawzsluu.supabase.co/functions/v1/image-match`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`
        },
        body: JSON.stringify({ base64: base64Image, mimeType: "image/jpeg" })
      });
      
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch(e) {
        throw new Error(`Invalid JSON from image-match: ${text.substring(0, 50)}`);
      }
      
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      if (data.matches && data.matches.length > 0) {
        const topMatch = data.matches[0];
        if (topMatch.id === p.id) {
          successCount++;
          results.push({ name: p.name, status: "PASS (Top Match)" });
        } else {
           let found = false;
           for(let k=0; k<data.matches.length; k++) {
              if (data.matches[k].id === p.id) { found = true; break; }
           }
           if(found) {
             successCount++;
             results.push({ name: p.name, status: "PASS (Ambiguous Variant Match)" });
           } else {
             failCount++;
             results.push({ name: p.name, status: `FAIL (Matched ${topMatch.name} instead)` });
           }
        }
      } else {
        failCount++;
        results.push({ name: p.name, status: "FAIL (No Matches)" });
      }
    } catch(e: any) {
      failCount++;
      results.push({ name: p.name, status: `ERROR: ${e.message}` });
    }
  }));
  
  return new Response(JSON.stringify({
      totalTested: targetProducts.length,
      successCount,
      failCount,
      results
  }, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
});
