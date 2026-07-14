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
  getAllOffers,
  getAllActiveProducts,
} from "./supabase-client.ts";
import type { AIResult, BusinessSettings, LearnedResponse, MessageIntent, Product, Offer } from "./types.ts";

const GEMINI_TEXT_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent";

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
function buildSystemPrompt(settings: BusinessSettings, ragContext: string, ragLearned: string, offersContext: string): string {
  const restrictedTopicsList =
    settings.restrictedTopics.length > 0
      ? settings.restrictedTopics.join(", ")
      : "none";

  return `তুমি "${settings.businessName}"-এর একজন দক্ষ ও অভিজ্ঞ বাংলাদেশী সেলস এক্সিকিউটিভ। তুমি একজন মানুষের মতো কথা বলবে, ঠান্ডা মাথায়, বিশ্বাসযোগ্যভাবে, এবং সবসময় কাস্টমারের সাহায্যের জন্য প্রস্তুত।

══════════════════════════════════════
🔴 HARD RULES — কখনো ভাঙবে না:
══════════════════════════════════════
1. তুমি শুধুমাত্র নিচে দেওয়া PRODUCT KNOWLEDGE BASE থেকে তথ্য নেবে। এই ডেটার বাইরে কোনো product information নিজে থেকে বানাবে না।
2. যদি কোনো product সম্পর্কে তোমার কাছে তথ্য না থাকে, তাহলে বলবে: "এই পণ্যটি সম্পর্কে আমাদের কাছে বিস্তারিত তথ্য নেই। আমাদের টিম আপনাকে সাহায্য করবে।"
3. কখনো প্রাইস বানাবে না। শুধু product data-তে যে দাম আছে সেটাই বলবে।
4. OUT OF STOCK পণ্যের জন্য অর্ডার নেবে না।
5. কোনো competitor brand বা product নিয়ে কথা বলবে না।
6. ব্যবসার মালিকের ব্যক্তিগত তথ্য শেয়ার করবে না।
7. অনুমতি ছাড়া কোনো discount অফার করবে না।
8. অফ-টপিক প্রশ্নে বলবে: "আমি শুধুমাত্র ${settings.businessName}-এর পণ্য ও অর্ডার সংক্রান্ত বিষয়ে সাহায্য করতে পারি।"
9. Restricted topics — কখনো আলোচনা করবে না: ${restrictedTopicsList}
10. অর্ডার স্ট্যাটাস জানতে চাইলে বলবে: "অর্ডার স্ট্যাটাস চেক করার জন্য আমাদের একজন সাপোর্ট এক্সিকিউটিভ একটু পরেই আপনাকে রিপ্লাই দিচ্ছেন।" এবং intent = "order_status" দেবে।
11. কাস্টমার রাগান্বিত বা অভিযোগ করলে খুব বিনয়ী হবে এবং intent = "complaint" দেবে।
12. কাস্টমার ছবি পাঠালে সেটা analyze করে আমাদের কোনো product এর সাথে মিলে কিনা দেখবে।

══════════════════════════════════════
💬 ভাষা ও টোন নিয়ম:
══════════════════════════════════════
- সবসময় বিশুদ্ধ বাংলায় লিখবে। ইংরেজি বা বাংলিশ ব্যবহার করবে না।
- টোন: ${settings.replyTone}
- কাস্টমার যদি শুধু "hi", "hello" বা "আস্সালামু আলাইকুম" লেখে: "স্যার/ম্যাম, কোন পণ্যটা সম্পর্কে জানতে চাচ্ছেন?" জিজ্ঞেস করবে।
- স্বাভাবিকভাবে, মানুষের মতো কথা বলবে। রোবোটিক বা তালিকা-ভিত্তিক উত্তর এড়াবে।

══════════════════════════════════════
🏢 ব্যবসার তথ্য:
══════════════════════════════════════
- নাম: ${settings.businessName}
- বিবরণ: ${settings.description ?? ""}
- অবস্থান: ${settings.location ?? ""}
- ব্যবসার সময়: ${settings.businessHours ?? ""}
- ডেলিভারি এলাকা: ${settings.deliveryArea ?? ""}
- ডেলিভারি চার্জ: ${settings.deliveryChargeInfo ?? ""}
- যোগাযোগ: ${settings.contactInfo ?? ""}
- ডেলিভারি সময়: সাধারণত ৩ কার্যদিবস (পণ্যভেদে ভিন্ন হতে পারে)

${settings.customPrompt ? `══════════════════════════════════════
🤖 কাস্টম এজেন্ট পার্সোনা (এই নিয়মগুলো কঠোরভাবে মানবে):
══════════════════════════════════════
${settings.customPrompt}
` : ""}

${ragLearned ? `══════════════════════════════════════
📚 আগের মানুষের রিপ্লাই (এই স্টাইলে একই ধরনের প্রশ্নের উত্তর দাও):
══════════════════════════════════════
${ragLearned}
` : ""}

══════════════════════════════════════
🎁 বর্তমান অফার ও ডিসকাউন্ট:
══════════════════════════════════════
${offersContext || "এই মুহূর্তে কোনো বিশেষ অফার নেই।"}

══════════════════════════════════════
📦 পণ্যের তথ্য (PRODUCT KNOWLEDGE BASE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  IMPORTANT: নিচের তথ্য ছাড়া কোনো product সম্পর্কে কিছু বলবে না।
      এখানে যা নেই, সেটা তোমার জানা নেই — বানাবে না।
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ragContext || "কোনো পণ্যের তথ্য পাওয়া যায়নি।"}

══════════════════════════════════════
🛒 অর্ডার নেওয়ার নিয়ম:
══════════════════════════════════════
- কাস্টমার কিনতে চাইলে, product এর "Required Order Fields" অনুযায়ী তথ্য নাও।
- সব required field না পাওয়া পর্যন্ত অর্ডার confirm করবে না।
- কাস্টমার সব তথ্য দিলে orderData field-এ সব কিছু সঠিকভাবে ভরবে।

══════════════════════════════════════
📸 ছবি পাঠানোর নিয়ম:
══════════════════════════════════════
- কাস্টমার যদি EXPLICITLY ছবি চায় (যেমন: "ছবি দাও", "দেখতে কেমন", "photo pathao") তাহলে "sendProductImage": true এবং detectedProductId সেট করবে।
- শুধু দাম বা তথ্য জানতে চাইলে ছবি পাঠাবে না।
- IMAGE ONLY MODE: শুধু ছবি চাইলে — "imageOnly": true, "reply": "" (খালি), "sendProductImage": true সেট করবে।

══════════════════════════════════════
📋 OUTPUT FORMAT (JSON — কোনো markdown নয়):
══════════════════════════════════════
{
  "reply": "কাস্টমারকে বাংলায় উত্তর (imageOnly হলে খালি string)",
  "intent": "product_inquiry|price_inquiry|order_intent|return_intent|complaint|order_status|greeting|follow_up_response|how_to_use|unboxing|off_topic|spam|unknown",
  "detectedProductId": "product UUID অথবা null",
  "imageOnly": false,
  "orderData": null,
  "sendProductImage": false,
  "productImageUrl": "product data থেকে image URL অথবা null",
  "sendVideo": false,
  "videoUrl": null
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

  // 2.5 Fetch offers
  const offers = await getAllOffers();
  const offersContext = offers.length > 0 
    ? offers.map(o => {
      const condition = o.min_order_amount ? `(Min Order: ৳${o.min_order_amount})` : "";
      const disc = o.discount_type === "percentage" ? `${o.discount_value}% OFF` : `৳${o.discount_value} OFF`;
      return `- ${o.name}: ${disc} ${condition}. Details: ${o.description}`;
    }).join("\n")
    : "";

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
  
  // If user sent an image, we need a larger catalog context because text search on "what is this?" is useless
  const isImage = mediaType === "image";
  const searchLimit = isImage ? 15 : 8; 

  if (effectiveText && effectiveText.trim().length > 0) {
    if (settings.openaiApiKey) {
      try {
        const embedding = await generateEmbedding(effectiveText, settings.openaiApiKey);
        ragProducts = await hybridProductSearch(embedding, effectiveText, searchLimit);
        learnedResponses = await hybridKnowledgeSearch(embedding, 3);
      } catch (err) {
        console.error("RAG embedding error — falling back to text-only:", err);
        try {
          ragProducts = await textOnlyProductSearch(effectiveText, searchLimit);
        } catch (textErr) {
          console.error("Text-only search also failed:", textErr);
        }
      }
    } else {
      console.log("No OpenAI key — using text-only product search");
      try {
        ragProducts = await textOnlyProductSearch(effectiveText, searchLimit);
      } catch (textErr) {
        console.error("Text-only search failed:", textErr);
      }
    }
  }

  // 4.5. Fallback & Image Enrichment: 
  // If no products found, OR if it's an image (where text search is unreliable), load more active products
  if (ragProducts.length === 0 || isImage) {
    console.log("Loading catalog fallback (empty search or image detected)");
    try {
      const fallbackProducts = await getAllActiveProducts(isImage ? 20 : 10);
      // Merge uniquely
      const existingIds = new Set(ragProducts.map(p => p.id));
      for (const fp of fallbackProducts) {
        if (!existingIds.has(fp.id)) {
          ragProducts.push(fp);
          existingIds.add(fp.id);
        }
      }
    } catch (e) {
      console.error("Failed to load full catalog fallback:", e);
    }
  }

  // 5. Build RAG context string — include ALL product fields so AI has complete info
  const ragContext = ragProducts
    .map((p) => {
      const price = p.salePrice
        ? `বিক্রয় মূল্য: ৳${p.salePrice} (নিয়মিত মূল্য: ৳${p.regularPrice})`
        : `মূল্য: ৳${p.regularPrice}`;
      const stock = p.stockQuantity > 0
        ? `স্টক আছে: ${p.stockQuantity} টি`
        : "❌ স্টক শেষ (অর্ডার নেওয়া যাবে না)";

      const qna = p.qnaPairs.length > 0
        ? p.qnaPairs.map((q) => `  প্রশ্ন: ${q.question}\n  উত্তর: ${q.answer}`).join("\n")
        : "  নেই";

      const orderFields = p.requiredOrderFields && p.requiredOrderFields.length > 0
        ? p.requiredOrderFields.map((f) => `  - ${f.fieldName}: ${f.question}`).join("\n")
        : "  শুধু ডেলিভারি ঠিকানা লাগবে";

      const imageInfo = p.images.length > 0
        ? `ছবির URL: ${p.images[0]}`
        : "ছবি নেই";

      return [
        `▶ পণ্যের নাম: ${p.name}`,
        `  ID: ${p.id}`,
        `  ক্যাটাগরি: ${p.category ?? "উল্লেখ নেই"}`,
        `  SKU: ${p.sku ?? "নেই"}`,
        `  ${price}`,
        `  ${stock}`,
        `  বিবরণ: ${p.description ?? "কোনো বিবরণ নেই"}`,
        `  রিটার্ন পলিসি: ${p.returnConditions ?? "স্ট্যান্ডার্ড পলিসি প্রযোজ্য"}`,
        `  ${imageInfo}`,
        `  অর্ডার করতে যা জানতে হবে:`,
        orderFields,
        `  সাধারণ প্রশ্ন ও উত্তর:`,
        qna,
      ].join("\n");
    })
    .join("\n\n" + "─".repeat(50) + "\n\n");

  const ragLearned = learnedResponses
    .filter(lr => (lr.similarity ?? 0) > 0.75) // Only highly relevant learned responses
    .map((lr) => `Q: ${lr.question}\nA: ${lr.answer}`)
    .join("\n\n");

  // 6. Build Gemini messages array
  const systemPrompt = buildSystemPrompt(settings, ragContext, ragLearned, offersContext);

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

  // 10. Enrich with product image ONLY IF the AI decided to send an image
  if (aiResult.sendProductImage) {
    if (aiResult.detectedProductId && !aiResult.productImageUrl) {
      // If AI wants to send an image and provided product ID but no URL, fetch from DB
      const product = await getProductById(aiResult.detectedProductId);
      if (product?.images?.[0]) {
        aiResult.productImageUrl = product.images[0];
      }
    } else if (!aiResult.productImageUrl && ragProducts.length > 0 && ragProducts[0].images?.[0]) {
      // AI said to send image but didn't provide URL or product ID - find best match from RAG results
      aiResult.productImageUrl = ragProducts[0].images[0];
    }
  }

  return aiResult;
}
