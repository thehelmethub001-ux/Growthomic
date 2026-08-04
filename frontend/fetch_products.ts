import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Get keys from .env
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const { data } = await sb.from('products').select('name, variations').ilike('name', '%Spark Metro%');
  fs.writeFileSync('scratch/products.json', JSON.stringify(data, null, 2));
  console.log('Saved to scratch/products.json');
}

run();
