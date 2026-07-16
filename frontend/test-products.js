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
  const res = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/products?select=id,name,stock_quantity,description', {
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
  const data = await res.json();
  console.log(data.filter(p => p.name.toLowerCase().includes('sbh')));
})();
