const fs = require('fs');

const envStr = fs.readFileSync('.env.production', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
  if (line.includes('=')) {
    const [k, ...v] = line.split('=');
    env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
});

async function run() {
  console.log("Fetching all products with images from Supabase...");
  const sbUrl = "https://pfzsursjuchrgawzsluu.supabase.co/rest/v1/products?select=id,name,images";
  const dbRes = await fetch(sbUrl, {
    headers: {
      "apikey": env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  const products = await dbRes.json();
  const validProducts = products.filter(p => p.images && p.images.length > 0);
  console.log(`Found ${validProducts.length} products with images to test.\n`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const p of validProducts) {
    const url = p.images[0];
    console.log(`Testing product: ${p.name} (${p.id})`);
    console.log(`Image URL: ${url}`);
    
    try {
      // Download image
      const imgRes = await fetch(url);
      const arrayBuffer = await imgRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Image = buffer.toString('base64');
      
      // Call image-match
      const res = await fetch(`https://pfzsursjuchrgawzsluu.supabase.co/functions/v1/image-match`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          base64: base64Image,
          mimeType: "image/jpeg"
        })
      });
      
      const text = await res.text();
      const data = JSON.parse(text);
      if (data.matches && data.matches.length > 0) {
        const topMatch = data.matches[0];
        console.log(`--> Top match: ${topMatch.name} (ID: ${topMatch.id}, Score: ${topMatch.similarity})`);
        
        if (topMatch.id === p.id) {
          console.log(`[PASS] Correctly identified!`);
          successCount++;
        } else {
           // check if it's in ambiguous matches
           let found = false;
           for(let i=0; i<data.matches.length; i++) {
              if (data.matches[i].id === p.id) {
                 console.log(`[PARTIAL] Product found at rank ${i+1} with score ${data.matches[i].similarity}`);
                 found = true;
                 break;
              }
           }
           if(!found) {
             console.log(`[FAIL] AI identified wrong product.`);
             failCount++;
           } else {
             successCount++; // count partials as success for now since they are presented as variants
           }
        }
      } else {
        console.log("[FAIL] No matches found.");
        failCount++;
      }
    } catch(e) {
      console.log(`[ERROR] Failed to test ${p.name}: ${e.message}`);
      failCount++;
    }
    console.log("--------------------------------------------------");
  }
  
  console.log(`\nTest Complete! Total Tested: ${validProducts.length}`);
  console.log(`Success (Ranked Top 3): ${successCount}`);
  console.log(`Failures: ${failCount}`);
}

run().catch(console.error);
