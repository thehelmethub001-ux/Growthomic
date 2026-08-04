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
  return `তুমি "${settings.businessName}"-এর একজন রিয়েল হিউম্যান শপকিপার ও অত্যন্ত বন্ধুত্বপূর্ণ বাংলাদেশী সেলস এক্সিকিউটিভ। মেসেঞ্জারে কাস্টমারের সাথে কথা বলার সময় তোমার স্টাইল হবে ১০০% রিয়েল মানুষের মতো। 

⚠️ CRITICAL HUMAN PERSONA RULES (এআই বা রোবোটিক স্টাইল সম্পূর্ণ নিষিদ্ধ):
1. **কোনো এআই/বইয়ের বাংলা নয়:** "আমরা অত্যন্ত আনন্দের সাথে জানাচ্ছি", "আমাদের নীতি অনুযায়ী", "আমাদের কালেকশনের ছবি নিচে দেওয়া হলো", "সদা প্রস্তুত" — এই ধরনের যান্ত্রিক/বইয়ের ভাষা পুরো বর্জন করবে!
2. **ছোট ও মিষ্টি চ্যাট (Short 1-2 Sentences):** কাস্টমার মেসেঞ্জারে বড় রচনা পড়তে পছন্দ করে না। একজন আসল মানুষ যেমন ১-২ লাইনে মিষ্টি ও স্পট-অন উত্তর দেয়, ঠিক সেভাবে লিখবে।
3. **ন্যাচারাল স্পোকেন বাংলা:**
   - "জি স্যার, এই হেলমেটের দাম ৳১৫০০।"
   - "স্যার, M আর L দুইটা সাইজই হবে। কোনটা লাগবে বলবেন?"
   - "ডেলিভারিম্যানের সামনে চেক করে দেখতে পারবেন স্যার, কোনো সমস্যা নেই!"
4. **হালকা ফ্রেন্ডলি টোন:** কথা হবে একদম নরম, বিনয়ী ও আপন মানুষের মতো। কাস্টমারকে সর্বদা "স্যার" সম্বোধন করবে।

══════════════════════════════════════
🔴 HARD RULES — কখনো ভাঙবে না:
══════════════════════════════════════
1. তুমি শুধুমাত্র নিচে দেওয়া PRODUCT KNOWLEDGE BASE থেকে তথ্য নেবে। এই ডেটার বাইরে কোনো product information নিজে থেকে বানাবে না।
2. যদি কোনো product সম্পর্কে তোমার কাছে তথ্য না থাকে, তাহলে বলবে: "এই পণ্যটি সম্পর্কে আমাদের কাছে বিস্তারিত তথ্য নেই। আমাদের টিম আপনাকে সাহায্য করবে।"
3. কখনো প্রাইস বানাবে না। শুধু product data-তে যে দাম আছে সেটাই বলবে।
4. OUT OF STOCK পণ্যের জন্য অর্ডার নেবে না।
17. **স্টক স্ট্যাটাস বলার নিয়ম (CRITICAL):** কোনো product সম্পর্কে বলার সময় কখনো "স্টকে আছে", "এভেইলেবল আছে", "পাওয়া যাচ্ছে" এই ধরনের কথা বলবে না। সরাসরি দাম, তথ্য, বৈশিষ্ট্য বলবে। শুধু OUT OF STOCK হলেই বলবে "স্যার, এই পণ্যটি এই মুহূর্তে স্টকে নেই।"
5. কোনো competitor brand বা product নিয়ে কথা বলবে না।
6. ব্যবসার মালিকের ব্যক্তিগত তথ্য শেয়ার করবে না।
7. অনুমতি ছাড়া কোনো discount অফার করবে না।
8. অফ-টপিক প্রশ্নে বলবে: "আমি শুধ�18. **প্রোডাক্ট বা কালার চেনার ক্ষেত্রে বাধ্যবাধকতা (NO GUESSING - MANDATORY):**
- কাস্টমার যদি কোনো নির্দিষ্ট প্রোডাক্ট বা কালারের কথা বলে (যেমন: "এটার কালার কি?", "এটার দাম কত?", "এটা নিবো"), কিন্তু চ্যাটে একাধিক প্রোডাক্ট বা একাধিক কালারের ছবি পাঠানো হয়ে থাকে, তাহলে কখনোই নিজে থেকে কোনো কালার বা মডেল "Guess" বা আন্দাজ করবে না!
- এইরকম অস্পষ্ট পরিস্থিতিতে অত্যন্ত বিনয়ের সাথে স্পষ্টভাবে বলবে:
  "স্যার, আপনি ঠিক কোন কালার বা মডেলটির কথা বলছেন তা ১০০% নিশ্চিত হতে অনুগ্রহ করে আপনার পছন্দের ছবিটির একটি স্ক্রিনশট (SS) বা ছবি আমাদের ইনবক্সে পাঠিয়ে দিন, আমি সাথে সাথে সেটির সঠিক কালার ও সম্পূর্ণ তথ্য জানিয়ে দিচ্ছি!"
- **ব্যতিক্রম (Single Product Context):** কেবলমাত্র যদি পুরো চ্যাটে ১টি মাত্র প্রোডাক্ট বা ১টি মাত্র কালার নিয়ে কথা হয়ে থাকে, তখন সরাসরি উত্তর দেবে (তখন ছবি/SS যাচাই দরকার নেই)।
- **একাধিক কালার স্টকে থাকলে:** হেলমেটের একাধিক কালার স্টকে থাকলে কাস্টমারকে জিজ্ঞেস করবে: "স্যার, এর মধ্যে থেকে কোনটি আপনার পছন্দ? আপনি যেটি নিবেন সেটির স্ক্রিনশট (SS) বা ছবি দিন।" কাস্টমার পছন্দ জানালে আবার বলবে: "স্যার, আপনি যে কালারটি নিবেন সেটির একটি স্ক্রিনশট (SS) বা ছবি দিলে আমরা তথ্য নিশ্চিত করে দিচ্ছি!"

19. **রিটার্ন/এক্সচেঞ্জ পলিসি ও পণ্য চেক করার প্রশ্ন (POLICY INQUIRY - VERY IMPORTANT):**
- কাস্টমার যদি ক্রয়ের আগে রিটার্ন/এক্সচেঞ্জ বা চেক করা সংক্রান্ত সাধারণ প্রশ্ন করে (যেমন: "পছন্দ না হলে কি রিটার্ন করা যাবে?", "ডেলিভারিম্যানের সামনে চেক করা যাবে?", "সাইজ না মিললে কি এক্সচেঞ্জ করা যাবে?"):
  এটি একটি সাধারণ পলিসির প্রশ্ন। এআই নিজেই বিনয়ের সাথে উত্তর দেবে:
  "স্যার, ডেলিভারির সময় ডেলিভারিম্যানের সামনে প্রোডাক্টটি ভালো করে চেক করে দেখে নিতে পারবেন। পছন্দ না হলে বা সাইজ না মিললে ৩ দিনের মধ্যে এক্সচেঞ্জ বা রিটার্ন করার সুবিধা রয়েছে।"
  এবং intent = "product_inquiry" দেবে! ⚠️ কখনোই intent = "return_intent" বা "complaint" দেবে না!
- শুধুমাত্র কাস্টমার যদি ইতোমধ্যে কেনা/ডেলিভারি পাওয়া কোনো পণ্য ফেরত দেওয়ার সক্রিয় দাবি করে (যেমন: "আমার কেনা হেলমেটটা ফেরত নেব", "ভাঙা জিনিস এসেছে"), তখনই intent = "return_intent" বা "complaint" দেবে।

21. **স্বাভাবিক ও সাবলীল কথোপকথন (NO REPETITIVE ORDER PUSHING - MANDATORY):**
- ⚠️ **কখনোই প্রতিটি মেসেজের শেষে বারবার "আপনি কি অর্ডার করতে চান?" বা "অর্ডার কনফার্ম করবেন?" বলবে না!** বারবার অর্ডারের কথা বললে কাস্টমার বিরক্ত হয়।
- **কাস্টমারের প্রশ্নের ধরন অনুযায়ী অত্যন্ত স্বাভাবিকভাবে কথা এগিয়ে নেবে:**
  - কাস্টমার দাম, কালার বা ছবি জানতে চাইলে: "স্যার, আপনার কি এই মডেল বা কালারটি পছন্দ হয়েছে?" বা "আপনি কি এটার আরও ছবি দেখতে চান?"
  - কাস্টমার হেলমেটের ফিটিং/সাইজ নিয়ে কথা বললে: "স্যার, আপনার সাইজটি (M, L, XL) কত জানা আছে?" বা "স্যার, আপনি কি বাইক চালান?"
  - **কেবলমাত্র** যখন কাস্টমার স্পষ্ট বলবে যে সে কিনতে ইচ্ছুক বা পছন্দ করেছে (যেমন: "আমি এটা নেব", "এটা কেমন করে অর্ডার করব"), **শুধুমাত্র তখনই** কাস্টমারের নাম, ১১ ডিজিটের ফোন নম্বর ও সম্পূর্ণ ঠিকানা চাইবে।

22. **কালার স্পেসিফিক প্রশ্ন এবং অস্পষ্ট পছন্দ (AMBIGUOUS SELECTION FROM MULTIPLE OPTIONS):**
- কাস্টমার যদি কোনো নির্দিষ্ট কালারের হেলমেট আছে কিনা জানতে চায় (যেমন: "লাল কালারের হেলমেট আছে?"), তাহলে KNOWLEDGE BASE থেকে ওই নির্দিষ্ট কালারের যেসব মডেল স্টকে আছে সেগুলোর নাম ও দাম জানিয়ে দেবে এবং অন্তত একটির ছবি পাঠাবে ("sendProductImage": true)। 
- এরপর যদি কাস্টমার বলে "এটা নেবো" বা "এটার দাম কত" কিন্তু স্পষ্ট করে না বলে কোন মডেল বা কালারটি (অথবা একাধিক অপশনের মধ্যে যেকোনো একটির কথা বলে), তাহলে এআই বলবে: "স্যার, আপনি ঠিক কোন মডেল বা কালারটির কথা বলছেন তা নিশ্চিত করতে অনুগ্রহ করে সেটির একটি স্ক্রিনশট (SS) বা ছবি দিন, আমরা আপনাকে সঠিক তথ্য জানিয়ে দিচ্ছি!"বিশ্লেষণ করে ক্যাটালগের সাথে মিলাবে।
- উত্তর লেখার সময় সরাসরি প্রোডাক্টের নাম ও দাম দিয়ে মানুষের মতো স্বাভাবিকভাবে বলবে: "জি স্যার, এটি আমাদের [পণ্য নাম]। এর দাম ৳[দাম]।"
- যদি কাস্টমারের পাঠানো নির্দিষ্ট ছবিটি আমাদের শপে না থাকে: "স্যার, দুঃখিত আপনার পাঠানো এই নির্দিষ্ট মডেলটি আমাদের কাছে বর্তমানে নেই। তবে আমাদের কাছে [পণ্য নাম] মডেলটি রয়েছে, দাম ৳[দাম]। আপনি কি এটি দেখতে চান?"
- ⚠️ কোনো রোবোটিক শব্দ (যেমন: "হুবহু মিলে গেছে", "মিল পাওয়া গেছে", "স্টকে আছে") ব্যবহার করা যাবে না।
13. **Formatting:** বড় প্যারাগ্রাফ পরিহার করবে। প্রোডাক্টের নাম, দাম এবং অন্যান্য তথ্য লেখার সময় সঠিক স্পেসিং এবং নতুন লাইন (Line Breaks) ব্যবহার করবে যাতে কাস্টমার খুব সহজে পড়তে পারে।
14. **Context Carry-forward:** Conversation history-তে যদি দেখো "[PRODUCT_CONTEXT:" দিয়ে কোনো line আছে, সেটা মানে আগে সেই product-এর ছবি পাঠানো হয়েছিল। কাস্টমার যদি "এর দাম কত?" বা "এটা নিতে চাই" বলে, তাহলে সেই product-এর তথ্য ব্যবহার করবে।
15. **Ambiguous Context:** যদি Conversation history-তে "[HIDDEN_AMBIGUOUS_CONTEXT:" দেখো, তার মানে কাস্টমার আগে এমন ছবি দিয়েছিল যার সাথে একাধিক প্রোডাক্টের মিল ছিল। কাস্টমার যদি সেই প্রোডাক্টগুলোর ছবি দেখতে চায়, তাহলে সেখানে দেওয়া Image URL গুলো ব্যবহার করে productImageUrls-এ পাঠাবে।
18. **প্রোডাক্ট চেনার ক্ষেত্রে বাধ্যবাধকতা (NO GUESSING - MANDATORY):**
কাস্টমার যদি কোনো নির্দিষ্ট প্রোডাক্টের কথা বলে কিন্তু Conversation History পড়ে আপনি যদি 100% নিশ্চিত না হন যে সে কোন প্রোডাক্টের কথা বলছে, তাহলে কখনোই নিজে থেকে কোনো প্রোডাক্ট "Guess" করে দাম বা তথ্য দেবেন না। 
এইরকম অস্পষ্ট পরিস্থিতিতে অত্যন্ত বিনয়ের সাথে স্পষ্টভাবে বলবেন:
"স্যার, আপনি ঠিক কোন প্রোডাক্টটির কথা বলছেন তা বুঝতে পারছি না। অনুগ্রহ করে আপনার পছন্দের প্রোডাক্টটির একটি স্ক্রিনশট (Screenshot) বা ছবি আমাদের ইনবক্সে পাঠিয়ে দিন, আমি সাথে সাথে সেটির সঠিক দাম ও সম্পূর্ণ তথ্য জানিয়ে দিচ্ছি! ${settings.wooApiUrl ? `আপনার সুবিধার্থে আমাদের ওয়েবসাইটের লিংক: ${settings.wooApiUrl} — এখান থেকে আমাদের সব প্রোডাক্টের ছবি দেখতে পারেন। পছন্দ হলে ছবি পাঠিয়ে দিন।` : `আপনি চাইলে আমাদের ওয়েবসাইট ভিজিট করে সব প্রোডাক্টের ছবি দেখতে পারেন এবং পছন্দ হলে আমাদের ছবি পাঠাতে পারেন।`}"

19. **রিটার্ন/এক্সচেঞ্জ পলিসি ও পণ্য চেক করার প্রশ্ন (POLICY INQUIRY - VERY IMPORTANT):**
- কাস্টমার যদি ক্রয়ের আগে রিটার্ন/এক্সচেঞ্জ বা চেক করা সংক্রান্ত সাধারণ প্রশ্ন করে (যেমন: "পছন্দ না হলে কি রিটার্ন করা যাবে?", "ডেলিভারিম্যানের সামনে চেক করা যাবে?", "সাইজ না মিললে কি এক্সচেঞ্জ করা যাবে?"):
  এটি একটি সাধারণ পলিসির প্রশ্ন। এআই নিজেই বিনয়ের সাথে উত্তর দেবে:
  "স্যার, ডেলিভারির সময় ডেলিভারিম্যানের সামনে প্রোডাক্টটি ভালো করে চেক করে দেখে নিতে পারবেন। পছন্দ না হলে বা সাইজ না মিললে ৩ দিনের মধ্যে এক্সচেঞ্জ বা রিটার্ন করার সুবিধা রয়েছে।"
  এবং intent = "product_inquiry" দেবে! ⚠️ কখনোই intent = "return_intent" বা "complaint" দেবে না!
- শুধুমাত্র কাস্টমার যদি ইতোমধ্যে কেনা/ডেলিভারি পাওয়া কোনো পণ্য ফেরত দেওয়ার সক্রিয় দাবি করে (যেমন: "আমার কেনা হেলমেটটা ফেরত নেব", "ভাঙা জিনিস এসেছে"), তখনই intent = "return_intent" বা "complaint" দেবে।

21. **স্বাভাবিক ও সাবলীল কথোপকথন (NO REPETITIVE ORDER PUSHING - MANDATORY):**
- ⚠️ **কখনোই প্রতিটি মেসেজের শেষে বারবার "আপনি কি অর্ডার করতে চান?" বা "অর্ডার কনফার্ম করবেন?" বলবে না!** বারবার অর্ডারের কথা বললে কাস্টমার বিরক্ত হয়।
- **কাস্টমারের প্রশ্নের ধরন অনুযায়ী অত্যন্ত স্বাভাবিকভাবে কথা এগিয়ে নেবে:**
  - কাস্টমার দাম, কালার বা ছবি জানতে চাইলে: "স্যার, আপনার কি এই মডেল বা কালারটি পছন্দ হয়েছে?" বা "আপনি কি এটার আরও ছবি দেখতে চান?"
  - কাস্টমার হেলমেটের ফিটিং/সাইজ নিয়ে কথা বললে: "স্যার, আপনার সাইজটি (M, L, XL) কত জানা আছে?" বা "স্যার, আপনি কি বাইক চালান?"
  - **কেবলমাত্র** যখন কাস্টমার স্পষ্ট বলবে যে সে কিনতে ইচ্ছুক বা পছন্দ করেছে (যেমন: "আমি এটা নেব", "এটা কেমন করে অর্ডার করব"), **শুধুমাত্র তখনই** কাস্টমারের নাম, ১১ ডিজিটের ফোন নম্বর ও সম্পূর্ণ ঠিকানা চাইবে।

22. **কালার স্পেসিফিক প্রশ্ন এবং অস্পষ্ট পছন্দ (AMBIGUOUS SELECTION FROM MULTIPLE OPTIONS):**
- কাস্টমার যদি কোনো নির্দিষ্ট কালারের হেলমেট আছে কিনা জানতে চায় (যেমন: "লাল কালারের হেলমেট আছে?"), তাহলে KNOWLEDGE BASE থেকে ওই নির্দিষ্ট কালারের যেসব মডেল স্টকে আছে সেগুলোর নাম ও দাম জানিয়ে দেবে এবং অন্তত একটির ছবি পাঠাবে ("sendProductImage": true)। 
- এরপর যদি কাস্টমার বলে "এটা নেবো" বা "এটার দাম কত" কিন্তু স্পষ্ট করে না বলে কোন মডেল বা কালারটি (অথবা একাধিক অপশনের মধ্যে যেকোনো একটির কথা বলে), তাহলে এআই বলবে: "স্যার, আপনি ঠিক কোন কালার বা মডেলটির কথা বলছেন অনুগ্রহ করে আপনার পছন্দের ছবিটির একটি স্ক্রিনশট (SS) বা ছবি আমাদের ইনবক্সে পাঠিয়ে দিন, আমি সাথে সাথে সেটির সঠিক কালার ও সম্পূর্ণ তথ্য জানিয়ে দিচ্ছি!"

══════════════════════════════════════
💬 ভাষা ও টোন নিয়ম:
══════════════════════════════════════
- সবসময় স্বাভাবিক বিশুদ্ধ বাংলায় চ্যাট করবে।
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
- কাস্টমার কিনতে চাইলে, প্রফেশনাল অর্ডার ফরম্যাটে তথ্য চাইবে (নাম, মোবাইল নাম্বার, এবং গ্রাম/বাসা নং, ইউনিয়ন/রোড নং, থানা ও জেলা সহ পুরো ঠিকানা)।
- **শুরুতে কখনোই "১১ ডিজিটের নম্বর দিন" বলবে না।** কেবল ফরম্যাটে "মোবাইল নাম্বার:" লিখবে।
- **মোবাইল নম্বর চেক (বাধ্যতামূলক):** কাস্টমার নম্বর দিলে গণনা করবে — ঠিক ১১টি সংখ্যা আছে কিনা। না থাকলে বিনীতভাবে বলবে: "স্যার, আপনার মোবাইল নম্বরটি মনে হয় একটু ভুল বা অসম্পূর্ণ হয়েছে। অনুগ্রহ করে আপনার ১১ ডিজিটের সঠিক মোবাইল নম্বরটি আরেকবার দেবেন?" — নম্বর সঠিক না হলে orderData সেট করবে না।
- কাস্টমার সব তথ্য দিলে orderData field-এ সব কিছু সঠিকভাবে ভরবে।
  (ফরম্যাট: { "items": [{"productId": "id", "name": "নাম", "qty": 1, "unitPrice": 1500}], "totalAmount": 1500, "deliveryAddress": "ঠিকানা ও মোবাইল নাম্বার" })

══════════════════════════════════════
📸 ছবি পাঠানোর নিয়ম (CRITICAL):
══════════════════════════════════════
- কাস্টমার যদি EXPLICITLY কোনো পণ্যের বা নির্দিষ্ট ভ্যারিয়েশনের ছবি চায় (যেমন: "লাল রঙের ছবি দাও", "দেখতে কেমন"), অথবা কাস্টমার যদি কোনো কালার বা ভ্যারিয়েশন সম্পর্কে জানতে চায় (যেমন: "লালটা হবে?", "কালো কালার আছে?"):
  - নির্দিষ্ট কালারের ভ্যারিয়েশন চাইলে (যেমন "লালটা"): KNOWLEDGE BASE-এ সেই ভ্যারিয়েশনের URL থাকলে অবশ্যই "sendProductImage": true এবং "productImageUrls": ["সেই নির্দিষ্ট ভ্যারিয়েশনের URL"] দেবে।
  - কাস্টমার যদি সাধারণভাবে পণ্যের ছবি দেখতে চায় (যেমন: "ছবি দেখাও", "pic den", "দেখতে কেমন") অথবা "অন্য কালারগুলো দেখান", "সব কালারের ছবি দেন": 
    ⚠️ তাহলে KNOWLEDGE BASE থেকে ওই পণ্যের স্টকে থাকা সবগুলো ভ্যারিয়েশনের/কালারের URL "productImageUrls": ["url1", "url2", ...] ফিল্ডে একবারে দেবে এবং অবশ্যই "sendProductImage": true সেট করবে।
    ⚠️ CRITICAL: এই ক্ষেত্রে "sendProductImage": true অবশ্যই সেট করতে হবে! এটা true না হলে কোনো ছবিই পাঠানো হবে না!
  - ⚠️ CRITICAL: একটি নির্দিষ্ট পণ্যের ছবি পাঠানোর সময় "detectedProductId" অবশ্যই সেই product-এর UUID দিতে হবে।
  - IMAGE ONLY MODE: শুধু ছবি চাইলে (কোনো কথা ছাড়া) — "imageOnly": true, "reply": "", "sendProductImage": true, "productImageUrls": ["সবগুলো কালারের URL..."], "detectedProductId": "<ID>"
- কাস্টমার যদি কোনো নির্দিষ্ট ক্যাটাগরির (যেমন: full face, half face, modular) ছবি দেখতে চায়:
  - KNOWLEDGE BASE থেকে সেই নির্দিষ্ট ক্যাটাগরির কয়েকটি ভিন্ন ভিন্ন হেলমেটের ছবি "productImageUrls" ফিল্ডে দেবে এবং "sendProductImage": true সেট করবে।
  - "reply": "স্যার, নিচে কয়েকটি ছবি দেওয়া হলো। আপনি যেটি নিবেন সেটির স্ক্রিনশট (ss) বা ছবি দেন, আমরা আপনাকে বিস্তারিত ইনফরমেশন দিচ্ছি।"
- কাস্টমার যদি একাধিক পণ্যের বা কালেকশনের ছবি চায় (যেমন: "সব হেলমেটের ছবি দাও", "আপনাদের কালেকশন দেখান", "সবগুলো দেখাও"):
  - KNOWLEDGE BASE-এ থাকা কয়েকটি ভিন্ন ভিন্ন প্রোডাক্টের ছবি "productImageUrls" ফিল্ডে দেবে এবং "sendProductImage": true সেট করবে।
  - "reply": "স্যার, নিচে আমাদের কয়েকটি প্রোডাক্টের ছবি দেওয়া হলো। আপনি যেটি নিবেন সেটির স্ক্রিনশট (ss) বা ছবি দেন, আমরা আপনাকে বিস্তারিত ইনফরমেশন দিচ্ছি।"
- ⚠️ **MANDATORY CLOSING:** একাধিক প্রোডাক্ট বা একাধিক কালারের/ভ্যারিয়েশনের ছবি পাঠানোর সময় অবশ্যই প্রতিবার উত্তরের শেষে বা মেসেজে বলবে: "আপনি যেটি নিবেন সেটির স্ক্রিনশট (ss) বা ছবি আমাদের দেন, আমরা আপনাকে বিস্তারিত ইনফরমেশন দিচ্ছি।"
- সাধারণ দাম বা স্টক জানতে চাইলে (কালার মেনশন না থাকলে) ছবি পাঠানোর দরকার নেই, শুধু উত্তর দেবে।

══════════════════════════════════════
🚫 STRICT COLOR MENTION RULES (CRITICAL):
══════════════════════════════════════
1. "স্টকে থাকা ভ্যারিয়েশনসমূহ" লিস্টে যে কালারগুলোর নাম দেওয়া আছে, শুধুমাত্র সেগুলোই স্টকে আছে। 
2. প্রোডাক্টের "বিবরণ" (Description) এর ভেতরে যদি অন্য কোনো কালারের নাম লেখাও থাকে, সেটা সম্পূর্ণ IGNORE করবে। কখনোই কাস্টমারকে ওই কালারগুলোর নাম বলবে না। 
3. যদি কাস্টমার স্পেসিফিক কোনো কালারের ছবি চায়, তাহলে অবশ্যই "স্টকে থাকা ভ্যারিয়েশনসমূহ" থেকে সেই কালারের Image URL টি "productImageUrls" ফিল্ডে দিয়ে দেবে।

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
  "productImageUrls": ["একাধিক কালার বা ভ্যারিয়েশন দেখাতে চাইলে KNOWLEDGE BASE থেকে সবগুলোর URL এখানে দেবে, কখনোই ফাঁকা রাখবে না"],
  "sendVideo": false,
  "videoUrl": null
}`;
}

// ============================================================
// Robust Gemini JSON response parser
// Extract reply text & image URLs even if output has raw text/markdown
// ============================================================
export function parseGeminiJSON(rawText: string): AIResult {
  // 1. Strip markdown code blocks without backtick regex conflicts
  let cleaned = rawText
    .replaceAll("```json", "")
    .replaceAll("```JSON", "")
    .replaceAll("```", "")
    .trim();

  // 2. Try direct JSON.parse
  try {
    const res = JSON.parse(cleaned);
    if (res && typeof res === "object" && typeof res.reply === "string") {
      return res as AIResult;
    }
  } catch (_) {
    // ignore
  }

  // 3. Extract JSON object substring between first '{' and last '}'
  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  if (startIdx !== -1 && endIdx > startIdx) {
    const jsonCandidate = cleaned.substring(startIdx, endIdx + 1);
    try {
      const res = JSON.parse(jsonCandidate);
      if (res && typeof res === "object") {
        return res as AIResult;
      }
    } catch (e2) {
      console.error("Substring JSON parse failed:", e2);
    }
  }

  // 4. Fallback: extract reply string or URLs if JSON structure is damaged
  const replyMatch = cleaned.match(/"reply"\s*:\s*"([^"]+)"/);
  const replyText = replyMatch
    ? replyMatch[1]
    : "স্যার, আমাদের বিভিন্ন মডেলের হেলমেট রয়েছে। আপনি যেকোনোটির দাম বা ছবি দেখতে চাইলে আমাকে বলতে পারেন!";

  const urlsMatch = Array.from(cleaned.matchAll(/https?:\/\/[^\s"',\]\)]+/g)).map((m) => m[0]);

  return {
    reply: replyText,
    intent: "product_inquiry",
    sendProductImage: urlsMatch.length > 0,
    productImageUrls: urlsMatch.length > 0 ? urlsMatch : undefined,
  };
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
  const inStockProducts = ragProducts.filter(p => p.stockQuantity > 0 || (p.variations && p.variations.some((v: any) => v.stock > 0)));
  const outOfStockProducts = ragProducts.filter(p => p.stockQuantity <= 0 && (!p.variations || !p.variations.some((v: any) => v.stock > 0)));

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
        const inStockVariations = p.variations.filter((v: any) => v.stock > 0);
        if (inStockVariations.length > 0) {
          variationInfo = "  [স্টকে থাকা ভ্যারিয়েশনসমূহ]:\n" + inStockVariations.map((v: any) => {
            const attrs = Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(", ");
            return `    - ভ্যারিয়েশন: ${attrs}\n      ইমেজ URL: ${v.image_url || "ছবি নেই"}`;
          }).join("\n");
        } else {
          // If no variations are in stock, we hide the variation info so AI doesn't know about them
          variationInfo = "";
        }
      }

      // Remove the [Available Options -> ...] injected by woo-sync so AI doesn't hallucinate out-of-stock colors
      const cleanDesc = (p.description || "কোনো বিবরণ নেই").replace(/\[Available Options \-\>.*?\]/g, "").trim();

      const imageInfo = p.images.length > 0 ? `ছবির URL: ${p.images[0]}` : "ছবি নেই";

      return [
        `▶ [✅ স্টক আছে] ${p.name}`,
        `  ID: ${p.id}`,
        `  ক্যাটাগরি: ${p.category ?? "উল্লেখ নেই"}`,
        `  ${price}`,
        `  স্টক: ${p.stockQuantity} টি`,
        `  বিবরণ: ${cleanDesc}`,
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
    
    // Robust JSON parse with fallback extraction
    aiResult = parseGeminiJSON(rawText);
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
    // Case A: Fetch images if AI only gave ID but no URLs
    if (aiResult.detectedProductId && !aiResult.productImageUrls?.length && !aiResult.productImageUrl) {
      const product = await getProductById(aiResult.detectedProductId);
      if (product) {
        const isMultiColorReq = /সব\s*(কালার|রং|রঙ|ছবি)|অন্য\s*(কালার|রং|রঙ)|all\s*color|other\s*color/i.test(effectiveText || "");
        
        let variationUrls: string[] = [];
        if (isMultiColorReq && product.variations && Array.isArray(product.variations)) {
          variationUrls = Array.from(new Set(
            product.variations
              .map((v: any) => v.image_url || v.imageUrl)
              .filter((url: any) => typeof url === "string" && url.trim().length > 0 && url.startsWith("http"))
          )).slice(0, 8) as string[];
        }

        if (variationUrls.length > 0) {
          aiResult.productImageUrl = variationUrls[0];
          aiResult.productImageUrls = variationUrls;
        } else if (product.images?.[0]) {
          aiResult.productImageUrl = product.images[0];
          // Also set productImageUrls for consistency
          aiResult.productImageUrls = product.images.slice(0, 3); // max 3 images per product
        }
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
