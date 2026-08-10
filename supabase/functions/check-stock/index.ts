import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getSupabaseClient } from "../_shared/supabase-client.ts";

serve(async (req) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('products')
      .select('id, name, variations, stock_quantity')
      .ilike('name', '%Spark Metro Solid%');

    if (error) throw error;
    
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
