import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getSupabaseClient } from "../_shared/supabase-client.ts";

serve(async (req) => {
  try {
    const sb = getSupabaseClient();
    
    // 1. Fetch messages for the conversation
    const { data: messages } = await sb.from("messages")
      .select("id, role, content, media_url, platform_message_id, created_at")
      .eq("conversation_id", "4181dfd8-0631-4bea-8109-57388d57aca0")
      .order("created_at", { ascending: false })
      .limit(20);

    // 2. Fetch a few products to check URL format
    const { data: prods } = await sb.from("products")
      .select("id, name, images, variations")
      .limit(5);

    return new Response(JSON.stringify({ messages, prods }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json" },
    });
  }
});

