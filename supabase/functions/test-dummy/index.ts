import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getSupabaseClient } from "../_shared/supabase-client.ts";

serve(async (req) => {
  try {
    const sb = getSupabaseClient();
    const { data: order } = await sb.from("orders").select("*").eq("woo_order_id", 55476).single();

    return new Response(JSON.stringify({ order }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json" },
    });
  }
});
