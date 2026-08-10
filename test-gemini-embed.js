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
    // 1. Get GEMINI_API_KEY from Supabase
    const sbRes = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/business_settings?select=gemini_api_key', {
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
      }
    });
    const sbData = await sbRes.json();
    const geminiKey = sbData[0]?.gemini_api_key;
    if (!geminiKey) throw new Error("No Gemini API key found");

    // 2. Test gemini-embedding-2 endpoint with a text first to see if it even exists
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiKey}`;
    console.log("Testing URL:", url);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "models/gemini-embedding-2",
        content: {
          parts: [{ text: "Helmet" }]
        }
      })
    });
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));

  } catch (e) {
    console.error(e);
  }
})();
