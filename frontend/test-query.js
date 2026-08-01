const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envStr = fs.readFileSync('.env.local', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
  if (line.includes('=')) {
    const [k, ...v] = line.split('=');
    env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
});

(async () => {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await sb
      .from("products")
      .select("id, images")
      .not("images", "eq", "{}")
      .not("images", "is", null);
      
  console.log("Returned count:", data ? data.length : 0);
  if (error) console.error(error);
})();
