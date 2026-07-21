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
  getAllInStockProducts,
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
12. কাস্টমার ছবি পাঠালে — সেটা Gemini Vision দিয়ে analyze করে PRODUCT KNOWLEDGE BASE-এর সাথে মিলিয়ে দেখবে। 
⚠️ CRITICAL RULE: কখনোই রোবটের মতো "আপনার পাঠানো ছবির সাথে আমাদের প্রোডাক্টের মিল খুঁজে পাচ্ছি" বা "ছবিটির সাথে এই পণ্যটি মিলেছে" - এরকম কথা বলবে না!
একদম মানুষের মতো স্বাভাবিকভাবে বলবে, যেমন: "স্যার, এই হেলমেটটি তো আমাদের স্টকে আছে!" বা "এই মডেলটার দাম পড়বে..."। কোনো product-এর সাথে মিলে গেলে সেই product-এর ID "detectedProductId"-এ সেট করবে।
13. **Formatting:** বড় প্যারাগ্রাফ পরিহার করবে। প্রোডাক্টের নাম, দাম এবং অন্যান্য তথ্য লেখার সময় সঠিক স্পেসিং এবং নতুন লাইন (Line Breaks) ব্যবহার করবে যাতে কাস্টমার খুব সহজে পড়তে পারে।
14. **Context Carry-forward:** Conversation history-তে যদি দেখো "[PRODUCT_CONTEXT:" দিয়ে কোনো line আছে, সেটা মানে আগে সেই product-এর ছবি পাঠানো হয়েছিল। কাস্টমার যদি "এর দাম কত?" বা "এটা নিতে চাই" বলে, তাহলে সেই product-এর তথ্য ব্যবহার করবে।
15. **Ambiguous Context:** যদি Conversation history-তে "[HIDDEN_AMBIGUOUS_CONTEXT:" দেখো, তার মানে কাস্টমার আগে এমন ছবি দিয়েছিল যার সাথে একাধিক প্রোডাক্টের মিল ছিল। কাস্টমার যদি সেই প্রোডাক্টগুলোর ছবি দেখতে চায়, তাহলে সেখানে দেওয়া Image URL গুলো ব্যবহার করে productImageUrls-এ পাঠাবে।

══════════════════════════════════════
💬 ভাষা ও টোন নিয়ম:
══════════════════════════════════════
- সবসময় বিশুদ্ধ বাংলায় লিখবে। ইংরেজি বা বাংলিশ ব্যবহার করবে না।
- টোন: ${settings.replyTone}
- কাস্টমারকে সর্বদা "স্যার" (Sir) বলে সম্বোধন করবে, কখনোই "ভাই" (Brother) বা অন্য কিছু বলবে না।
- কাস্টমার যদি শুধু "hi", "hello" বা "আস্সালামু আলাইকুম" লেখে: "স্যার, কোন পণ্যটা সম্পর্কে জানতে চাচ্ছেন?" জিজ্ঞেস করবে।
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
  (ফরম্যাট: { "items": [{"productId": "id", "name": "নাম", "qty": 1, "unitPrice": 1500}], "totalAmount": 1500, "deliveryAddress": "ঠিকানা ও মোবাইল নাম্বার" })

══════════════════════════════════════
📸 ছবি পাঠানোর নিয়ম:
══════════════════════════════════════
- কাস্টমার যদি EXPLICITLY একটি পণ্যের বা নির্দিষ্ট ভ্যারিয়েশনের (কালার/সাইজ) ছবি চায় (যেমন: "লাল রঙের ছবি দাও", "দেখতে কেমন", "photo pathao") তাহলে:
  - নির্দিষ্ট কালারের ভ্যারিয়েশন চাইলে: KNOWLEDGE BASE-এ ভ্যারিয়েশনের URL থাকলে "sendProductImage": true এবং "productImageUrl": "ভ্যারিয়েশনের URL" দেবে।
  - সাধারণ পণ্যের জন্য: "sendProductImage": true, "detectedProductId": "<ID>"
  - IMAGE ONLY MODE: শুধু ছবি চাইলে — "imageOnly": true, "reply": "", "sendProductImage": true
- কাস্টমার যদি একাধিক পণ্যের ছবি চায় (যেমন: "সব হেলমেটের ছবি দাও", "সবগুলো দেখাও"):
  - "sendProductImage": true, "productImageUrls": ["url1", "url2", ...] (KNOWLEDGE BASE থেকে image URL)
  - imageOnly মোডে reply ফাঁকা রাখবে
- শুধু দাম বা তথ্য জানতে চাইলে ছবি পাঠাবে না।

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
  "productImageUrl": "একটি product-এর image URL অথবা null",
  "productImageUrls": null,
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
export async function transcribeVoice(audioUrl: string, mimeType: string, openaiKey?: string, audioToken?: string): Promise<string> {
  const key = openaiKey || Deno.env.get("OPENAI_API_KEY")!;
  // Download audio
  const headers = audioToken ? { Authorization: `Bearer ${audioToken}` } : undefined;
  const audioRes = await fetch(audioUrl, { headers });
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
  platform?: string;
  preMatchedProductId?: string;
  candidateProducts?: { id: string; name: string; imageUrl: string }[];
}): Promise<AIResult> {
  const { conversationId, messageText, mediaType, mediaUrl, platform, preMatchedProductId, candidateProducts } = params;

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

  // 2.6 Extract current batch from history
  let batchStartIndex = history.length;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "customer") {
      batchStartIndex = i + 1;
      break;
    }
  }
  if (batchStartIndex === history.length) {
    batchStartIndex = 0;
  }
  const previousHistory = history.slice(0, batchStartIndex);
  const currentBatch = history.slice(batchStartIndex);

  // Combine text from the current batch, fallback to params.messageText
  const combinedText = currentBatch.map(m => m.content).filter(Boolean).join("\n").trim();
  let effectiveText = combinedText || messageText;

  // Find the latest image/voice in the batch
  const latestMediaMsg = [...currentBatch].reverse().find(m => m.media_url);
  const batchMediaType = latestMediaMsg?.media_type || mediaType;
  const batchMediaUrl = latestMediaMsg?.media_url || mediaUrl;

  // 3. Transcribe voice if needed
  if (batchMediaType === "voice" && batchMediaUrl) {
    try {
      let finalAudioUrl = batchMediaUrl;
      let finalAudioMimeType = "audio/ogg";
      let audioToken: string | undefined = undefined;

      if (platform === "whatsapp") {
        const { downloadMetaMedia, getMetaAccessToken } = await import("./platform-send.ts");
        const metaRes = await downloadMetaMedia(batchMediaUrl);
        finalAudioUrl = metaRes.url;
        finalAudioMimeType = metaRes.mimeType;
        audioToken = await getMetaAccessToken();
      }

      effectiveText = await transcribeVoice(finalAudioUrl, finalAudioMimeType, settings.openaiApiKey ?? undefined, audioToken);
    } catch (err) {
      console.error("Whisper transcription failed:", err);
      effectiveText = "[Voice message — could not transcribe]";
    }
  }

  // 4. Hybrid RAG: search for relevant products and learned responses
  let ragProducts: Product[] = [];
  let learnedResponses: LearnedResponse[] = [];
  
  // If user sent an image, we need a larger catalog context because text search on "what is this?" is useless
  const isImage = batchMediaType === "image";
  const searchLimit = isImage ? 20 : 12;  // Increased limit so AI gets more product context

  let searchText = effectiveText?.trim() || "";
  if (!searchText && isImage) {
    // If image has no caption, use the last text message sent by the customer as context
    const lastCustomerText = [...history].reverse().find(h => h.role === "customer" && h.content?.trim().length > 0);
    if (lastCustomerText && lastCustomerText.content) {
      searchText = lastCustomerText.content.trim();
    }
  }

  if (searchText && searchText.length > 0) {
    if (settings.openaiApiKey) {
      try {
        const embedding = await generateEmbedding(searchText, settings.openaiApiKey);
        ragProducts = await hybridProductSearch(embedding, searchText, searchLimit);
        learnedResponses = await hybridKnowledgeSearch(embedding, 3);
      } catch (err) {
        console.error("RAG embedding error — falling back to text-only:", err);
        try {
          ragProducts = await textOnlyProductSearch(searchText, searchLimit);
        } catch (textErr) {
          console.error("Text-only search also failed:", textErr);
        }
      }
    } else {
      console.log("No OpenAI key — using text-only product search");
      try {
        ragProducts = await textOnlyProductSearch(searchText, searchLimit);
      } catch (textErr) {
        console.error("Text-only search failed:", textErr);
      }
    }
  }

  // 4.5: ALWAYS load ALL in-stock products so AI knows every available product.
  // Out-of-stock products are noted separately for reference.
  {
    try {
      const allInStock = await getAllInStockProducts(); // ALL in-stock — no limit
      const existingIds = new Set(ragProducts.map(p => p.id));
      // Put search results first (most relevant), then fill in remaining in-stock products
      for (const p of allInStock) {
        if (!existingIds.has(p.id)) {
          ragProducts.push(p);
          existingIds.add(p.id);
        }
      }
    } catch (e) {
      console.error("Failed to load all in-stock products:", e);
      // Fallback to limited set
      try {
        const fallback = await getAllActiveProducts(isImage ? 25 : 20);
        const existingIds = new Set(ragProducts.map(p => p.id));
        for (const fp of fallback) {
          if (!existingIds.has(fp.id)) ragProducts.push(fp);
        }
      } catch (e2) {
        console.error("Fallback also failed:", e2);
      }
    }
  }

  // 5. Build TWO-TIER RAG context:
  //    Tier 1: In-stock products — full details (price, stock, image, ordering info)
  //    Tier 2: Out-of-stock products — compact list only (so AI knows they exist but can't order)
  const inStockProducts = ragProducts.filter(p => p.stockQuantity > 0);
  const outOfStockProducts = ragProducts.filter(p => p.stockQuantity <= 0);

  const inStockContext = inStockProducts
    .map((p) => {
      const price = p.salePrice
        ? `বিক্রয় মূল্য: ৳${p.salePrice} (নিয়মিত মূল্য: ৳${p.regularPrice})`
        : `মূল্য: ৳${p.regularPrice}`;

      const qna = p.qnaPairs.length > 0
        ? p.qnaPairs.map((q) => `  প্রশ্ন: ${q.question}\n  উত্তর: ${q.answer}`).join("\n")
        : "  নেই";

      const orderFields = p.requiredOrderFields && p.requiredOrderFields.length > 0
        ? p.requiredOrderFields.map((f) => `  - ${f.fieldName}: ${f.question}`).join("\n")
        : "  শুধু ডেলিভারি ঠিকানা লাগবে";

      let variationInfo = "";
      if (p.variations && p.variations.length > 0) {
        variationInfo = "  ভ্যারিয়েশনসমূহ:\n" + p.variations.map((v: any) => {
          const attrs = Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(", ");
          return `    - ${attrs} (URL: ${v.image_url || "ছবি নেই"})`;
        }).join("\n");
      }

      const imageInfo = p.images.length > 0 ? `ছবির URL: ${p.images[0]}` : "ছবি নেই";

      return [
        `▶ [✅ স্টক আছে] ${p.name}`,
        `  ID: ${p.id}`,
        `  ক্যাটাগরি: ${p.category ?? "উল্লেখ নেই"}`,
        `  ${price}`,
        `  স্টক: ${p.stockQuantity} টি`,
        `  বিবরণ: ${p.description ?? "কোনো বিবরণ নেই"}`,
        `  ${imageInfo}`,
        variationInfo ? variationInfo : "",
        `  অর্ডার করতে যা জানতে হবে:`,
        orderFields,
        `  সাধারণ প্রশ্ন ও উত্তর:`,
        qna,
      ].join("\n");
    })
    .join("\n\n" + "─".repeat(40) + "\n\n");

  // Out-of-stock: compact one-liner each
  const outOfStockContext = outOfStockProducts.length > 0
    ? `\n\n══ ❌ স্টক শেষ (অর্ডার নেওয়া যাবে না) ══\n` +
      outOfStockProducts.map(p =>
        `• ${p.name} | ক্যাটাগরি: ${p.category ?? "–"} | মূল্য: ৳${p.salePrice ?? p.regularPrice}`
      ).join("\n")
    : "";

  const ragContext = inStockContext + outOfStockContext;

  const ragLearned = learnedResponses
    .filter(lr => (lr.similarity ?? 0) > 0.75) // Only highly relevant learned responses
    .map((lr) => `Q: ${lr.question}\nA: ${lr.answer}`)
    .join("\n\n");

  // 6. Build Gemini messages array
  const systemPrompt = buildSystemPrompt(settings, ragContext, ragLearned, offersContext);

  // Convert history to Gemini format (compressing consecutive messages of the same role to avoid Gemini 400 Bad Request)
  const historyContents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const msg of previousHistory) {
    const role = msg.role === "customer" ? "user" : "model";
    const text = msg.content || "[Media message]";
    if (historyContents.length > 0 && historyContents[historyContents.length - 1].role === role) {
      historyContents[historyContents.length - 1].parts[0].text += "\n" + text;
    } else {
      historyContents.push({ role, parts: [{ text }] });
    }
  }

  // Current message (may include image for Gemini Vision)
  const currentParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (effectiveText) {
    currentParts.push({ text: effectiveText });
  }

  // Image vision: download and pass to Gemini
  if (batchMediaType === "image" && batchMediaUrl) {
    try {
      // 1. If candidateProducts are provided, fetch them in parallel to give Gemini visual references
      if (candidateProducts && candidateProducts.length > 0) {
        currentParts.push({ text: "--- REFERENCE PRODUCTS FOR VISUAL COMPARISON ---\n" });
        
        const candidatePromises = candidateProducts.map(async (candidate) => {
          try {
            const res = await fetch(candidate.imageUrl);
            const buf = await res.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = "";
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            return {
              id: candidate.id,
              name: candidate.name,
              mimeType: res.headers.get("content-type") ?? "image/jpeg",
              base64: btoa(binary)
            };
          } catch (e) {
            console.error(`Failed to load reference image for ${candidate.id}`, e);
            return null;
          }
        });
        
        const resolvedCandidates = (await Promise.all(candidatePromises)).filter(c => c !== null);
        
        for (const c of resolvedCandidates) {
          currentParts.push({ text: `Product ID: ${c.id} | Name: ${c.name}` });
          currentParts.push({ inlineData: { mimeType: c.mimeType, data: c.base64 } });
        }
      }

      // 2. Fetch the customer's actual image
      let imgRes: Response;
      if (platform === "whatsapp") {
        const { downloadMetaMedia, getMetaAccessToken } = await import("./platform-send.ts");
        const metaRes = await downloadMetaMedia(batchMediaUrl);
        imgRes = await fetch(metaRes.url, { headers: { Authorization: `Bearer ${await getMetaAccessToken()}` } });
      } else {
        imgRes = await fetch(batchMediaUrl);
      }
      const imgBytes = await imgRes.arrayBuffer();
      const bytes = new Uint8Array(imgBytes);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const mimeType = imgRes.headers.get("content-type") ?? "image/jpeg";
      
      currentParts.push({ text: "\n--- CUSTOMER'S UPLOADED PHOTO ---\n" });
      currentParts.push({ inlineData: { mimeType, data: base64 } });

      // Explicit vision prompt: match against catalog
      currentParts.push({ 
        text: `Customer sent an image. TASK:
1. Analyze the CUSTOMER'S UPLOADED PHOTO carefully.
2. If REFERENCE PRODUCTS are provided above, visually compare the customer's photo against EACH reference product photo (check shape, color, graphics, visor).
3. If it perfectly matches one of the reference photos, set detectedProductId to that product's ID and tell the customer the product name and price.
4. If it doesn't match any product exactly, say we don't have that exact product but suggest similar ones from the catalog.
5. Reply in Bengali.` 
      });
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
    let rawText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    
    // Sanitize markdown JSON blocks that Gemini sometimes outputs despite responseMimeType
    rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
      aiResult = JSON.parse(rawText);
    } catch {
      console.warn("JSON Parse failed for rawText:", rawText);
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
    // Case A: Single product image
    if (aiResult.detectedProductId && !aiResult.productImageUrls?.length) {
      const product = await getProductById(aiResult.detectedProductId);
      if (product?.images?.[0]) {
        aiResult.productImageUrl = product.images[0];
        // Also set productImageUrls for consistency
        aiResult.productImageUrls = product.images.slice(0, 3); // max 3 images per product
      }
    }
    // Case B: Multiple product images (AI returned productImageUrls directly with image URLs from the prompt)
    // productImageUrls may already be set by AI from the knowledge base context — validate they look like URLs
    if (aiResult.productImageUrls?.length) {
      aiResult.productImageUrls = aiResult.productImageUrls
        .filter((url: string) => url && url.startsWith("http"))
        .slice(0, 8); // Cap at 8 images to avoid flooding
    }
    // If still no images found, log
    if (!aiResult.productImageUrl && !aiResult.productImageUrls?.length) {
      console.log("AI requested image but couldn't find image URLs. Skipping.");
      aiResult.sendProductImage = false;
    }
  }

  // 11. If image vector search already confirmed the product before Gemini, use it
  // This ensures detectedProductId is always set when image matching was confident
  if (preMatchedProductId && !aiResult.detectedProductId) {
    aiResult.detectedProductId = preMatchedProductId;
  }

  return aiResult;
}
