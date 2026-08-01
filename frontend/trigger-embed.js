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
    const url = env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/embed-products';
    console.log("Triggering: " + url);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
        console.error("HTTP Error:", res.status, res.statusText);
        console.error(await res.text());
        return;
    }
    
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));

  } catch (e) {
    console.error(e);
  }
})();
