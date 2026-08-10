import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const envFile = fs.readFileSync(envPath, 'utf8');
  for (const line of envFile.split('\n')) {
    const [key, ...values] = line.split('=');
    if (key && values.length > 0) {
      let val = values.join('=').trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      process.env[key.trim()] = val;
    }
  }
}

async function run() {
  loadEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl) throw new Error('No supabase URL');
  
  const sb = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await sb.from('products').select('id, name, variations').ilike('name', '%Spark Metro%');
  if (error) {
    console.error(error);
  } else {
    for (const p of data) {
      console.log(`Product: ${p.name}`);
      for (const v of p.variations || []) {
        console.log(`  - Variation ${v.id}: ${JSON.stringify(v.attributes)}, stock: ${v.stock}, image: ${v.image_url}`);
      }
    }
  }
}
run();
