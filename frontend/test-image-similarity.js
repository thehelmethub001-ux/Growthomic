const fs = require('fs');

async function run() {
  console.log("Fetching a product image...");
  // Let's call supabase directly using fetch since we don't have the client setup locally easily
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://pfzsursjuchrgawzsluu.supabase.co";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseKey) {
     console.log("No supabase key found");
     return;
  }

  const prodRes = await fetch(`${supabaseUrl}/rest/v1/products?select=id,name,images&limit=2`, {
    headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` }
  });
  const products = await prodRes.json();
  const targetProduct = products[0];
  console.log(`Target Product: ${targetProduct.name}`);
  const imageUrl = targetProduct.images[0];
  console.log(`Image URL: ${imageUrl}`);

  console.log("Fetching image buffer...");
  const imgRes = await fetch(imageUrl);
  const imgBuffer = await imgRes.arrayBuffer();
  const base64 = Buffer.from(imgBuffer).toString('base64');
  console.log(`Base64 length: ${base64.length}`);

  console.log("Calling image-match edge function...");
  const matchRes = await fetch(`${supabaseUrl}/functions/v1/image-match`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseKey}`
    },
    body: JSON.stringify({
      base64,
      mimeType: "image/jpeg",
      threshold: 0.45,
      matchCount: 3
    })
  });
  
  if (!matchRes.ok) {
     console.log("Error from image-match:", await matchRes.text());
     return;
  }

  const result = await matchRes.json();
  console.log("Matches found:", JSON.stringify(result, null, 2));
}

run().catch(console.error);
