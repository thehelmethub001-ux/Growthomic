import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient } from "../_shared/supabase-client.ts";
import { runAI } from "../_shared/gemini.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  
  try {
    const { offset = 0, limit = 5 } = await req.json();
    const sb = getSupabaseClient();
    
    const { data: products } = await sb.from("products").select("id, name, images").eq("is_active", true);
    if (!products) throw new Error("Failed to fetch products");
    
    const validProducts = products.filter(p => p.images && p.images.length > 0 && typeof p.images[0] === 'string' && p.images[0].startsWith('http'));
    const targetProducts = validProducts.slice(offset, offset + limit);
    
    const results = [];
    
    for (const p of targetProducts) {
       try {
         const imgUrl = p.images[0];
         const imgRes = await fetch(imgUrl);
         if (!imgRes.ok) throw new Error("Image fetch failed");
         
         const buffer = await imgRes.arrayBuffer();
         const base64 = encodeBase64(buffer);
         let mimeType = imgRes.headers.get("content-type") || "image/jpeg";
         if (!mimeType.startsWith("image/")) mimeType = "image/jpeg";
         
         const matchReq = await sb.functions.invoke("image-match", {
           body: { base64, mimeType, threshold: 0.70, matchCount: 3 }
         });
         
         let preMatchedProductId = undefined;
         let messageText = "I want this product."; // Default query with the image
         
         if (matchReq.data?.success && matchReq.data.matches?.length > 0) {
           const topMatch = matchReq.data.matches[0];
           if (topMatch.similarity >= 0.85) {
             preMatchedProductId = topMatch.id;
             messageText = `[SYSTEM_INSTRUCTION: The customer just sent a photo of product ID: ${topMatch.id}. 
Act like a real human shopkeeper who just saw the customer pointing at a helmet in the shop. 
CRITICAL RULE: Do NOT say anything like "your sent picture matched with our product". That sounds like a robot.
Start your response naturally with something like: "জি স্যার, এই মডেলটি তো আমাদের স্টকে এভেইলেবল আছে!"
ALWAYS address the customer as "স্যার" (Sir). Keep it very conversational and friendly.] ` + messageText;
           } else {
             const optionsText = matchReq.data.matches.map((m: any) => `- ${m.name} (Price: ৳${m.sale_price || m.regular_price}, Image URL: ${m.images?.[0] || 'None'})`).join("\n");
             const instruction = `[SYSTEM_INSTRUCTION: The customer sent an image which looks like it could be one of these products:\n${optionsText}\n\nTalk like a natural human shopkeeper. Address the customer as "স্যার" (Sir).\nTell the customer that the image looks like it could be one of a few models we have, and conversationally ask them which one they are looking for or mention their prices naturally. \nIf the customer asks to see pictures of them, you MUST use the provided Image URLs to send them.]`;
             messageText = instruction + "\n" + messageText;
           }
         }
         
         const aiResult = await runAI({
           conversationId: `test-conv-${p.id}`,
           customerId: `test-cust-${p.id}`,
           messageText,
           mediaType: "image",
           mediaUrl: imgUrl,
           preMatchedProductId
         });
         
         results.push({
           product: p.name,
           reply: aiResult.reply
         });
         
       } catch (err: any) {
         results.push({
           product: p.name,
           reply: "ERROR: " + err.message
         });
       }
    }
    
    return new Response(JSON.stringify({ totalTested: targetProducts.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
    
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
