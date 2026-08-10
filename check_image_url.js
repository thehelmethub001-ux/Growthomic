const fs = require('fs');
const https = require('https');

const envFile = fs.readFileSync('.env.production', 'utf8');
const env = {};
for (const line of envFile.split('\n')) {
  const idx = line.indexOf('=');
  if (idx > 0) {
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[k] = v;
  }
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];

function fetchProducts() {
  return new Promise((resolve, reject) => {
    const url = new URL('/rest/v1/products?select=id,name,images,variations&limit=300', SUPABASE_URL);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json'
      }
    };
    https.get(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function run() {
  const products = await fetchProducts();
  console.log('Products loaded:', products.length);

  const TARGET = 'WhatsApp-Image-2026-05-13-at-9.46.07-PM';
  let found = false;

  // Check target image
  for (const p of products) {
    if (p.images && p.images.some(i => i && i.includes(TARGET))) {
      console.log('\nFOUND in product images:', p.name, p.id);
      found = true;
    }
    if (p.variations) {
      for (const v of p.variations) {
        if (v.image_url && v.image_url.includes(TARGET)) {
          console.log('\nFOUND in variation:', p.name, '| var', v.id, '| attrs:', JSON.stringify(v.attributes), '| stock:', v.stock);
          found = true;
        }
      }
    }
  }
  if (!found) console.log('\nImage NOT FOUND in any product or variation in database!');

  // Also show ALL Spark Metro variations
  console.log('\n=== All Spark Metro Products and Variations ===');
  const sparkMetro = products.filter(p => p.name && p.name.toLowerCase().includes('spark metro'));
  for (const p of sparkMetro) {
    console.log('\nProduct:', p.name, '| ID:', p.id);
    if (p.variations && p.variations.length > 0) {
      for (const v of p.variations) {
        const img = v.image_url ? v.image_url.slice(0, 100) + '...' : 'NO IMAGE';
        console.log('  Variation', v.id, '| attrs:', JSON.stringify(v.attributes), '| stock:', v.stock, '| img:', img);
      }
    } else {
      console.log('  No variations');
    }
  }
}

run().catch(console.error);
