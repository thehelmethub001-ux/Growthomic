const fs = require('fs');
const envStr = fs.readFileSync('.env.local', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
  if (line.includes('=')) {
    const [k, ...v] = line.split('=');
    env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
});
(async () => {
  try {
    const res = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/business_settings?select=*', {
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
      }
    });
    const data = await res.json();
    const settings = data[0];
    
    // WooCommerce uses Base64 encode but wait! 
    // In node we can just pass auth headers or construct base64.
    const credentials = Buffer.from(settings.woo_consumer_key + ':' + settings.woo_consumer_secret).toString('base64');
    const wooUrl = settings.woo_api_url.replace(/\/$/, '') + '/wp-json/wc/v3/products?per_page=5';
    
    console.log("Fetching: " + wooUrl);
    const wooRes = await fetch(wooUrl, {
      headers: { Authorization: 'Basic ' + credentials }
    });
    const wooData = await wooRes.json();
    
    console.log(JSON.stringify(wooData.map(p => ({
      name: p.name,
      type: p.type,
      attributes: p.attributes,
      variations: p.variations
    })), null, 2));
  } catch (e) {
    console.error(e);
  }
})();
