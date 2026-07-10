import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-client.ts";
import { sendTextMessage } from "../_shared/platform-send.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { conversationId, text } = await req.json();

    if (!conversationId || !text) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createAdminClient();

    // 1. Get the conversation and customer details
    const { data: conv, error: convErr } = await sb
      .from("conversations")
      .select("id, platform, is_locked_for_ai, customers(id, platform_id)")
      .eq("id", conversationId)
      .single();

    if (convErr || !conv) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Send the message via Meta Graph API
    await sendTextMessage(
      conv.platform as "messenger" | "instagram" | "whatsapp",
      conv.customers.platform_id,
      text
    );

    // 3. Save the message to the database
    const { data: msgData, error: msgErr } = await sb.from("messages").insert([
      {
        conversation_id: conv.id,
        role: "human_agent",
        content: text,
      },
    ]).select().single();

    if (msgErr) {
      console.error("Failed to insert message:", msgErr);
    }

    // 4. Auto-Learning: Capture last customer message and human answer
    try {
      // Find the last customer message
      const { data: lastCustomerMsgs } = await sb
        .from("messages")
        .select("content")
        .eq("conversation_id", conv.id)
        .eq("role", "customer")
        .order("created_at", { ascending: false })
        .limit(1);

      if (lastCustomerMsgs && lastCustomerMsgs.length > 0 && lastCustomerMsgs[0].content) {
        const question = lastCustomerMsgs[0].content.trim();
        const answer = text.trim();

        if (question.length > 3 && answer.length > 2) {
          // Generate embedding for the question
          // Note: We need to import generateEmbedding. Let's do it dynamically to avoid huge imports if not needed,
          // or we can just import it at the top. Let's assume it's imported at the top.
          const { generateEmbedding } = await import("../_shared/gemini.ts");
          const embedding = await generateEmbedding(question);

          await sb.from("ai_learned_responses").insert([{
            question,
            answer,
            embedding
          }]);
          console.log("Auto-learned new response:", { question, answer });
        }
      }
    } catch (learnErr) {
      console.error("Auto-learning failed:", learnErr);
      // We don't fail the manual reply if learning fails
    }

    // 5. Pause AI for this conversation
    if (!conv.is_locked_for_ai) {
      await sb.from("conversations").update({ is_locked_for_ai: true }).eq("id", conv.id);
    }

    return new Response(JSON.stringify({ success: true, message: msgData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Manual reply error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
