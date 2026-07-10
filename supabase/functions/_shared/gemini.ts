// _shared/gemini.ts
// Google Gemini 1.5 Flash — AI engine with hybrid RAG + intent classification
// Handles: text replies, order collection, intent detection, product image/video suggestions

import {
  getBusinessSettings,
  getConversationHistory,
  getProductById,
  getProductVideo,
  hybridKnowledgeSearch,
  hybridProductSearch,
  textOnlyProductSearch,
} from "./supabase-client.ts";
import type { AIResult, BusinessSettings, LearnedResponse, MessageIntent, Product } from "./types.ts";

const GEMINI_TEXT_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

// Fallback logic
async function callOpenAIFallback(apiKey: string, messages: any[], systemPrompt: string): Promise<any> {
  // Convert Gemini messages to OpenAI messages
  const oaiMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => {
      let content = "";
      if (m.parts) {
        for (const p of m.parts) {
          if (p.text) content += p.text + "\n";
          // Basic text fallback for images
          if (p.inlineData) content += "[Customer sent an image]\n";
        }
      }
      return {
        role: m.role === "model" ? "assistant" : "user",
        content: content.trim(),
      };
    }),
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: oaiMessages,
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) throw new Error(`OpenAI Fallback failed: ${await res.text()}`);
  
  const json = await res.json();
  const replyText = json.choices[0].message.content;
  return JSON.parse(replyText);
}

// ============================================================
// Build the system prompt (Bangladesh e-commerce scoped)
// ============================================================
function buildSystemPrompt(settings: BusinessSettings, ragContext: string, ragLearned: string): string {
  const restrictedTopicsList =
    settings.restrictedTopics.length > 0
      ? settings.restrictedTopics.join(", ")
      : "none";

  return `You are an AI sales executive for "${settings.businessName}", a Bangladeshi e-commerce business.

CRITICAL RULES — NEVER BREAK:
1. You ONLY discuss topics related to: products, orders, prices, delivery, returns, and business information.
2. You NEVER answer general knowledge, weather, news, politics, or any off-topic question.
3. If asked something off-topic, reply: "আমি শুধুমাত্র ${settings.businessName}-এর পণ্য ও অর্ডার সংক্রান্ত বিষয়ে সাহায্য করতে পারি।"
4. You NEVER discuss competitor brands or products.
5. You NEVER reveal the business owner's personal information.
6. You NEVER confirm prices for OUT-OF-STOCK products.
7. You NEVER offer discounts without explicit permission.
8. Restricted topics (never discuss): ${restrictedTopicsList}
9. You present yourself as "${settings.businessName}-এর AI সেলস এক্সিকিউটিভ", NEVER as a general AI assistant.
10. This is MANDATORY for Meta WhatsApp policy compliance — stay strictly in e-commerce scope.
11. ORDER STATUS: You MUST NEVER give order status updates. If a customer asks about their delivery or order status, tell them: "অর্ডার স্ট্যাটাস চেক করার জন্য আমাদের একজন সাপোর্ট এক্সিকিউটিভ একটু পরেই আপনাকে রিপ্লাই দিচ্ছেন।" and set the intent to "order_status".
12. ANGRY/COMPLAINT: If the customer is angry, frustrated, or making a complaint, be very polite and set intent to "complaint" so a human can take over.
13. IMAGE RECOGNITION: If the customer sends an image, analyze it to identify if it matches any of our products and assist them accordingly.

BUSINESS INFORMATION:
- Name: ${settings.businessName}
- Description: ${settings.description ?? ""}
- Location: ${settings.location ?? ""}
- Business Hours: ${settings.businessHours ?? ""}
- Delivery Area: ${settings.deliveryArea ?? ""}
- Delivery Charges: ${settings.deliveryChargeInfo ?? ""}
- Contact: ${settings.contactInfo ?? ""}
- Standard Delivery Time: 3 business days (unless specified otherwise per product)

LANGUAGE RULES:
- You MUST ALWAYS respond in pure Bangla (বাংলা). Do NOT use English or Banglish in your replies.
- Use a ${settings.replyTone} tone.
- If a customer sends only "hi", "hello", "আস্‌সালামু আলাইকুম", or a vague opener:
  Ask: "স্যার/ম্যাম, কোন পণ্যটা সম্পর্কে জানতে চাচ্ছেন?"

${settings.customPrompt ? `CUSTOM AGENT PERSONA (STRICTLY FOLLOW THESE RULES):\n${settings.customPrompt}\n` : ""}

${ragLearned ? `PAST HUMAN REPLIES (Use these as examples to answer similar questions in the exact same style):\n${ragLearned}\n` : ""}

PRODUCT KNOWLEDGE BASE (use this to answer questions):
${ragContext || "No products found matching this query."}

OUTPUT FORMAT — respond with a JSON object (no markdown, no code fences):
{
  "reply": "Your message to the customer strictly in Bangla",
  "intent": "product_inquiry|price_inquiry|order_intent|return_intent|complaint|order_status|greeting|follow_up_response|how_to_use|unboxing|off_topic|spam|unknown",
  "detectedProductId": "uuid or null",
  "orderData": null or {
    "items": [{"productId": "uuid", "name": "...", "qty": 1, "unitPrice": 0, "wooProductId": 0}],
    "deliveryAddress": "string or null",
    "totalAmount": 0
  },
  "sendProductImage": false,
  "productImageUrl": "url or null",
  "sendVideo": false,
  "videoUrl": "url or null"
}`;
}

// ============================================================
// Generate embedding for a text query (OpenAI text-embedding-3-small)
// Used for hybrid RAG product search
// ============================================================
export async function generateEmbedding(text: string, openaiKey?: string): Promise<number[]> {
  const key = openaiKey || Deno.env.get("OPENAI_API_KEY")!;
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
      dimensions: 1536,
    }),
  });

  if (!res.ok) {
    throw new Error(`Embedding generation failed: ${await res.text()}`);
  }

  const json = await res.json();
  return json.data[0].embedding as number[];
}

// ============================================================
// Transcribe voice message with OpenAI Whisper
// ============================================================
export async function transcribeVoice(audioUrl: string, mimeType: string, openaiKey?: string): Promise<string> {
  const key = openaiKey || Deno.env.get("OPENAI_API_KEY")!;
  // Download audio
  const audioRes = await fetch(audioUrl);
  const audioBlob = await audioRes.blob();

  const form = new FormData();
  form.append("file", audioBlob, `audio.${mimeType.split("/")[1] ?? "ogg"}`);
  form.append("model", "whisper-1");
  form.append("language", "bn"); // Hint: Bengali; Whisper auto-detects if wrong

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) throw new Error(`Whisper transcription failed: ${await res.text()}`);
  const json = await res.json();
  return json.text as string;
}

// ============================================================
// Map detected intent to video purpose
// ============================================================
function intentToVideoPurpose(intent: MessageIntent): string {
  switch (intent) {
    case "return_intent":
      return "return_process";
    case "how_to_use":
      return "usage";
    case "unboxing":
      return "unboxing";
    default:
      return "general";
  }
}

// ============================================================
// Main AI engine: runAI()
// ============================================================
export async function runAI(params: {
  conversationId: string;
  customerId: string;
  messageText?: string;
  mediaType?: "image" | "voice" | "video";
  mediaUrl?: string;
}): Promise<AIResult> {
  const { conversationId, messageText, mediaType, mediaUrl } = params;

  // 1. Load business settings
  const settings = await getBusinessSettings();

  // 2. Get conversation history (last 20 messages for context)
  const history = await getConversationHistory(conversationId, 20);

  // 3. Transcribe voice if needed
  let effectiveText = messageText;
  if (mediaType === "voice" && mediaUrl) {
    try {
      effectiveText = await transcribeVoice(mediaUrl, "audio/ogg", settings.openaiApiKey ?? undefined);
    } catch (err) {
      console.error("Whisper transcription failed:", err);
      effectiveText = "[Voice message — could not transcribe]";
    }
  }

  // 4. Hybrid RAG: search for relevant products and learned responses
  let ragProducts: Product[] = [];
  let learnedResponses: LearnedResponse[] = [];
  
  if (effectiveText) {
    try {
      const embedding = await generateEmbedding(effectiveText, settings.openaiApiKey ?? undefined);
      ragProducts = await hybridProductSearch(embedding, effectiveText, 4);
      learnedResponses = await hybridKnowledgeSearch(embedding, 3);
    } catch (err) {
      console.error("RAG error:", err);
      // Fallback to text-only search
      ragProducts = await textOnlyProductSearch(effectiveText ?? "", 4);
    }
  }

  // 5. Build RAG context string
  const ragContext = ragProducts
    .map((p) => {
      const price = p.salePrice
        ? `Sale: ৳${p.salePrice} (Regular: ৳${p.regularPrice})`
        : `৳${p.regularPrice}`;
      const stock = p.stockQuantity > 0 ? `In Stock: ${p.stockQuantity}` : "❌ OUT OF STOCK";
      const qna = p.qnaPairs
        .map((q) => `Q: ${q.question}\nA: ${q.answer}`)
        .join("\n");
      return `
PRODUCT: ${p.name} (ID: ${p.id})
Category: ${p.category ?? ""}
Price: ${price}
${stock}
Description: ${p.description ?? ""}
Return Policy: ${p.returnConditions ?? "Standard policy applies"}
Q&A:
${qna || "None"}
Images: ${p.images[0] ?? "none"}
      `.trim();
    })
    .join("\n\n---\n\n");

  const ragLearned = learnedResponses
    .filter(lr => (lr.similarity ?? 0) > 0.75) // Only highly relevant learned responses
    .map((lr) => `Q: ${lr.question}\nA: ${lr.answer}`)
    .join("\n\n");

  // 6. Build Gemini messages array
  const systemPrompt = buildSystemPrompt(settings, ragContext, ragLearned);

  // Convert history to Gemini format
  const historyContents = history.map((msg) => ({
    role: msg.role === "customer" ? "user" : "model",
    parts: [{ text: msg.content ?? "" }],
  }));

  // Current message (may include image for Gemini Vision)
  const currentParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (effectiveText) {
    currentParts.push({ text: effectiveText });
  }

  // Image vision: download and pass to Gemini
  if (mediaType === "image" && mediaUrl) {
    try {
      const imgRes = await fetch(mediaUrl);
      const imgBytes = await imgRes.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBytes)));
      const mimeType = imgRes.headers.get("content-type") ?? "image/jpeg";
      currentParts.push({ inlineData: { mimeType, data: base64 } });
      if (!effectiveText) {
        currentParts.push({ text: "Customer sent an image. Analyze and respond." });
      }
    } catch (err) {
      console.error("Failed to load image for Gemini Vision:", err);
    }
  }

  const contents = [
    ...historyContents,
    { role: "user", parts: currentParts },
  ];

  const geminiKey = settings.geminiApiKey || Deno.env.get("GEMINI_API_KEY")!;
  const openaiKey = settings.openaiApiKey || Deno.env.get("OPENAI_API_KEY")!;

  let aiResult: AIResult;

  // 7. Call Gemini 1.5 Flash with Fallback
  try {
    const geminiRes = await fetch(
      `${GEMINI_TEXT_URL}?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          ],
        }),
      }
    );

    if (!geminiRes.ok) {
      throw new Error(`Gemini API error: ${await geminiRes.text()}`);
    }

    const geminiJson = await geminiRes.json();
    const rawText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    
    try {
      aiResult = JSON.parse(rawText);
    } catch {
      aiResult = { reply: rawText, intent: "unknown" };
    }
  } catch (error) {
    console.error("Gemini failed, falling back to GPT-4o-mini:", error);
    try {
      aiResult = await callOpenAIFallback(openaiKey, contents, systemPrompt);
    } catch (fallbackError) {
      console.error("OpenAI fallback also failed:", fallbackError);
      aiResult = { reply: "দুঃখিত, এই মুহূর্তে আমাদের সিস্টেম কিছুটা ব্যস্ত আছে। দয়া করে একটু পর আবার মেসেজ দিন।", intent: "unknown" };
    }
  }

  // 9. Enrich with video URL if AI flagged sendVideo
  if (aiResult.sendVideo && aiResult.detectedProductId) {
    const videoPurpose = intentToVideoPurpose(aiResult.intent ?? "unknown");
    const videoUrl = await getProductVideo(
      aiResult.detectedProductId,
      videoPurpose
    );
    aiResult.videoUrl = videoUrl ?? undefined;
    aiResult.sendVideo = !!videoUrl;
  }

  // 10. Enrich with first product image if AI flagged sendProductImage
  if (aiResult.sendProductImage && aiResult.detectedProductId && !aiResult.productImageUrl) {
    const product = await getProductById(aiResult.detectedProductId);
    if (product?.images?.[0]) {
      aiResult.productImageUrl = product.images[0];
    }
  }

  return aiResult;
}
