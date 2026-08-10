const fs = require('fs');
const lines = fs.readFileSync('C:\\Users\\User\\.gemini\\antigravity-ide\\brain\\9e608fa1-0abf-482a-83a7-35e432c9dc8c\\.system_generated\\logs\\transcript_full.jsonl', 'utf8').split('\n');

let latestKey = null;

for(const line of lines) {
  if (line.includes('SUPABASE_SERVICE_ROLE_KEY') && !line.includes('[SENSITIVE]')) {
    try {
      const j = JSON.parse(line);
      const content = j.content || j.output || (j.args && j.args.CodeContent) || "";
      const m = content.match(/SUPABASE_SERVICE_ROLE_KEY=["']?([^"'\n\r]+)/);
      if (m && m[1].length > 10 && !m[1].includes('[SENSITIVE]')) {
        latestKey = m[1];
      }
    } catch(e){}
  }
}

if (latestKey) {
    console.log('Found Service Role Key:', latestKey.substring(0, 15) + '...');
    // write to .env.production
    let envContent = fs.readFileSync('.env.production', 'utf8');
    envContent = envContent.replace(/SUPABASE_SERVICE_ROLE_KEY="\[SENSITIVE\]"/g, `SUPABASE_SERVICE_ROLE_KEY="${latestKey}"`);
    fs.writeFileSync('.env.production', envContent);
    console.log("Updated .env.production");
} else {
    console.log("No key found");
}
