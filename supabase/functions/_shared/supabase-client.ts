// _shared/supabase-client.ts
// Supabase client for Edge Functions (uses service_role key → bypasses RLS)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  BusinessSettings,
  Conversation,
  Customer,
  LearnedResponse,
  Platform,
  Product,
  Offer,
} from "./types.ts";

export function getSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// ============================================================
// business_settings helpers
// ============================================================
import { decryptSecret } from "./encryption.ts";

export async function getBusinessSettings(): Promise<BusinessSettings> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("business_settings")
    .select("*")
    .limit(1)
    .single();

  if (error || !data) throw new Error("business_settings not found");

  let geminiKey = data.gemini_api_key;
  if (geminiKey && geminiKey.includes(":")) geminiKey = await decryptSecret(geminiKey);
  
  let openaiKey = data.openai_api_key;
  if (openaiKey && openaiKey.includes(":")) openaiKey = await decryptSecret(openaiKey);

  return {
    id: data.id,
    businessName: data.business_name,
    description: data.description,
    businessHours: data.business_hours,
    location: data.location,
    deliveryArea: data.delivery_area,
    deliveryChargeInfo: data.delivery_charge_info,
    contactInfo: data.contact_info,
    aiReplyMode: data.ai_reply_mode,
    replyLanguage: data.reply_language,
    replyTone: data.reply_tone,
    followUpEnabled: data.follow_up_enabled,
    followUpDelayMinutes: data.follow_up_delay_minutes,
    followUpMaxPerDay: data.follow_up_max_per_day,
    restrictedTopics: data.restricted_topics ?? [],
    customPrompt: data.custom_prompt,
    wooApiUrl: data.woo_api_url,
    wooConsumerKey: data.woo_consumer_key,
    wooConsumerSecret: data.woo_consumer_secret,
    geminiApiKey: geminiKey,
    openaiApiKey: openaiKey,
    wooSyncEnabled: data.woo_sync_enabled ?? true,
    googleSheetsWebhookUrl: data.google_sheets_webhook_url,
  };
}

// ============================================================
// Offers helpers
// ============================================================
export async function getAllOffers(): Promise<Offer[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("offers")
    .select("*")
    .eq("is_active", true)
    .order("start_date", { ascending: false });

  if (error) {
    console.error("Failed to fetch offers:", error);
    return [];
  }
  return data as Offer[];
}

// ============================================================
// customer helpers
// ============================================================
export async function upsertCustomer(
  platform: Platform,
  platformId: string,
  name?: string,
  profilePic?: string
): Promise<Customer> {
  const sb = getSupabaseClient();

  const payload: any = {
    platform,
    platform_id: platformId,
    is_deleted: false,
    ai_reply_enabled: true,
  };
  if (name) payload.name = name;
  if (profilePic) payload.profile_pic = profilePic;

  const { data, error } = await sb
    .from("customers")
    .upsert(payload, {
      onConflict: "platform,platform_id",
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`upsertCustomer failed: ${error?.message}`);

  return mapCustomer(data);
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const sb = getSupabaseClient();
  const { data } = await sb.from("customers").select("*").eq("id", id).single();
  return data ? mapCustomer(data) : null;
}

function mapCustomer(data: Record<string, unknown>): Customer {
  return {
    id: data.id as string,
    name: data.name as string | undefined,
    platform: data.platform as Platform,
    platformId: data.platform_id as string,
    spamScore: data.spam_score as number,
    isSpam: data.is_spam as boolean,
    isBlocked: data.is_blocked as boolean,
    aiReplyEnabled: data.ai_reply_enabled as boolean,
    isVip: data.is_vip as boolean,
    isDeleted: data.is_deleted as boolean,
  };
}

// ============================================================
// conversation helpers
// ============================================================
export async function upsertConversation(
  customerId: string,
  platform: Platform
): Promise<Conversation> {
  const sb = getSupabaseClient();

  // Find existing open conversation for this customer
  const { data: existing } = await sb
    .from("conversations")
    .select("*")
    .eq("customer_id", customerId)
    .eq("platform", platform)
    .in("status", ["open", "human_queue"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) return mapConversation(existing);

  // Create new conversation
  const { data, error } = await sb
    .from("conversations")
    .insert({ customer_id: customerId, platform, status: "open" })
    .select()
    .single();

  if (error || !data) throw new Error(`upsertConversation failed: ${error?.message}`);
  return mapConversation(data);
}

export async function getConversationById(id: string): Promise<Conversation | null> {
  const sb = getSupabaseClient();
  const { data } = await sb.from("conversations").select("*").eq("id", id).single();
  return data ? mapConversation(data) : null;
}

export async function lockConversationForAI(
  conversationId: string,
  lock: boolean
): Promise<void> {
  const sb = getSupabaseClient();
  await sb
    .from("conversations")
    .update({ is_locked_for_ai: lock })
    .eq("id", conversationId);
}

export async function setConversationStatus(
  conversationId: string,
  status: string
): Promise<void> {
  const sb = getSupabaseClient();
  await sb
    .from("conversations")
    .update({ status, is_locked_for_ai: status !== "open" })
    .eq("id", conversationId);
}

export async function updateCustomerAnswers(
  conversationId: string,
  productId: string,
  fieldName: string,
  answer: string
): Promise<void> {
  const sb = getSupabaseClient();
  const { data: conv } = await sb
    .from("conversations")
    .select("customer_answers")
    .eq("id", conversationId)
    .single();

  const current = (conv?.customer_answers as Record<string, Record<string, string>>) ?? {};
  if (!current[productId]) current[productId] = {};
  current[productId][fieldName] = answer;

  await sb
    .from("conversations")
    .update({ customer_answers: current })
    .eq("id", conversationId);
}

export async function getMetaSettings() {
  const sb = getSupabaseClient();
  const { data } = await sb
    .from("business_settings")
    .select("meta_access_token, meta_verify_token, meta_app_secret")
    .limit(1)
    .single();

  if (data) {
    const { decryptSecret } = await import("./encryption.ts");
    if (data.meta_access_token && data.meta_access_token.includes(":")) {
      data.meta_access_token = await decryptSecret(data.meta_access_token);
    }
    if (data.meta_verify_token && data.meta_verify_token.includes(":")) {
      data.meta_verify_token = await decryptSecret(data.meta_verify_token);
    }
    if (data.meta_app_secret && data.meta_app_secret.includes(":")) {
      data.meta_app_secret = await decryptSecret(data.meta_app_secret);
    }
  }
  return data || {};
}

function mapConversation(data: Record<string, unknown>): Conversation {
  return {
    id: data.id as string,
    customerId: data.customer_id as string,
    platform: data.platform as Platform,
    status: data.status as Conversation["status"],
    isLockedForAI: data.is_locked_for_ai as boolean,
    assignedTo: data.assigned_to as string | undefined,
    platformWindowExpiresAt: data.platform_window_expires_at as string | undefined,
    customerAnswers:
      (data.customer_answers as Record<string, Record<string, string>>) ?? {},
  };
}

// ============================================================
// message helpers
// ============================================================
export async function saveMessage(params: {
  conversationId: string;
  role: "customer" | "ai" | "human_agent";
  content?: string;
  mediaType?: "image" | "voice" | "video";
  mediaUrl?: string;
  platformMessageId?: string;
}): Promise<void> {
  const sb = getSupabaseClient();
  
  if (params.platformMessageId) {
    const { data: existing } = await sb
      .from("messages")
      .select("id")
      .eq("platform_message_id", params.platformMessageId)
      .single();
    if (existing) return; // Already saved
  }

  await sb.from("messages").insert({
    conversation_id: params.conversationId,
    role: params.role,
    content: params.content ?? null,
    media_type: params.mediaType ?? null,
    media_url: params.mediaUrl ?? null,
    platform_message_id: params.platformMessageId ?? null,
  });
}

export async function getConversationHistory(
  conversationId: string,
  limit = 20
): Promise<Array<{ role: string; content: string | null; media_type: string | null; media_url: string | null; created_at: string }>> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from("messages")
    .select("role, content, media_type, media_url, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
    
  if (error) {
    console.error("Error fetching history:", error);
    return [];
  }
  return (data ?? []).reverse(); // oldest first for AI context
}

// ============================================================
// AI Knowledge Search (Human-in-the-Loop)
// ============================================================
export async function hybridKnowledgeSearch(
  embedding: number[],
  matchCount: number = 3
): Promise<LearnedResponse[]> {
  const sb = getSupabaseClient();

  // Call the search_learned_responses RPC function
  const { data, error } = await sb.rpc("search_learned_responses", {
    query_embedding: embedding,
    match_count: matchCount,
  });

  if (error) {
    console.error("hybridKnowledgeSearch error:", error);
    return [];
  }

  return (data || []) as LearnedResponse[];
}

// ============================================================
// Product search helpers
// ============================================================
export async function hybridProductSearch(
  queryEmbedding: number[],
  queryText: string,
  matchCount = 5
): Promise<Product[]> {
  const sb = getSupabaseClient();
  const { data } = await sb.rpc("hybrid_product_search", {
    query_embedding: queryEmbedding,
    query_text: queryText,
    match_count: matchCount,
    vector_weight: 0.7,
    text_weight: 0.3,
  });
  return (data ?? []).map(mapProduct);
}

export async function textOnlyProductSearch(
  queryText: string,
  matchCount = 5
): Promise<Product[]> {
  const sb = getSupabaseClient();

  // Basic dictionary for Banglish to Bengali translation
  const synonyms: Record<string, string[]> = {
    "helmet": ["হেলমেট", "হেলমেটের"],
    "light": ["লাইট", "আলো"],
    "horn": ["হর্ন"],
    "cover": ["কভার"],
    "bag": ["ব্যাগ"],
    "sticker": ["স্টিকার"],
    "lock": ["লক", "তালা"],
    "glove": ["গ্লাভস", "হাতমোজা"],
    "gloves": ["গ্লাভস", "হাতমোজা"],
    "visor": ["ভাইজর"],
    "indicator": ["ইন্ডিকেটর", "সিগন্যাল"],
    "mount": ["মাউন্ট"]
  };

  // 1. Extract words
  let words = queryText
    .toLowerCase()
    .replace(/[^\w\s\u0980-\u09FF]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  // Expand with synonyms
  const expandedWords = new Set<string>();
  for (const w of words) {
    expandedWords.add(w);
    if (synonyms[w]) {
      synonyms[w].forEach(s => expandedWords.add(s));
    }
  }
  words = Array.from(expandedWords);

  if (words.length > 0) {
    // 2. Build OR condition to fetch ANY potential match
    const orConditions = words
      .map((w) => `name.ilike.%${w}%,description.ilike.%${w}%,category.ilike.%${w}%`)
      .join(",");

    const { data, error } = await sb
      .from("products")
      .select("*")
      .eq("is_active", true)
      .or(orConditions)
      .limit(200);

    if (!error && data && data.length > 0) {
      // 3. Score them locally
      const scored = data.map((p) => {
        let score = 0;
        const name = (p.name || "").toLowerCase();
        const desc = (p.description || "").toLowerCase();
        const cat = (p.category || "").toLowerCase();

        for (const w of words) {
          if (name.includes(w)) score += 5; // highest weight to name
          else if (cat.includes(w)) score += 3; // category is important
          else if (desc.includes(w)) score += 1;
        }

        // Give slight boost to products that have stock
        if (p.stock_quantity > 0) score += 0.5;

        return { product: p, score };
      });

      // 4. Sort by score descending and take top matches
      const bestMatches = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, matchCount)
        .map((s) => mapProduct(s.product));

      if (bestMatches.length > 0) {
        return bestMatches;
      }
    }
  }

  // Fallback to naive RPC if nothing else worked
  const { data } = await sb.rpc("text_only_product_search", {
    query_text: queryText,
    match_count: matchCount,
  });
  return (data ?? []).map(mapProduct);
}

// ============================================================
// Get ALL in-stock products (no limit) — for full catalog context
// ============================================================
export async function getAllInStockProducts(): Promise<Product[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("is_active", true)
    .gt("stock_quantity", 0)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("getAllInStockProducts error:", error);
    return [];
  }
  return (data ?? []).map(mapProduct);
}

export async function getAllActiveProducts(limit = 15): Promise<Product[]> {
  const sb = getSupabaseClient();
  // First fetch in-stock products, then out-of-stock — so AI always sees available items first
  const { data: inStock, error: e1 } = await sb
    .from("products")
    .select("*")
    .eq("is_active", true)
    .gt("stock_quantity", 0)
    .order("name", { ascending: true })
    .limit(limit);

  if (e1) {
    console.error("getAllActiveProducts (inStock) error:", e1);
  }

  if (inStock && inStock.length >= limit) {
    return inStock.map(mapProduct);
  }

  // If not enough in-stock, pad with out-of-stock products
  const remaining = limit - (inStock?.length ?? 0);
  const { data: outStock, error: e2 } = await sb
    .from("products")
    .select("*")
    .eq("is_active", true)
    .eq("stock_quantity", 0)
    .order("name", { ascending: true })
    .limit(remaining);

  if (e2) console.error("getAllActiveProducts (outStock) error:", e2);

  const combined = [...(inStock ?? []), ...(outStock ?? [])];
  if (combined.length === 0) {
    return [];
  }
  return combined.map(mapProduct);
}

export async function getProductById(id: string): Promise<Product | null> {
  const sb = getSupabaseClient();
  const { data } = await sb.from("products").select("*").eq("id", id).single();
  return data ? mapProduct(data) : null;
}

function mapProduct(data: Record<string, unknown>): Product {
  return {
    id: data.id as string,
    sku: data.sku as string | undefined,
    name: data.name as string,
    images: (data.images as string[]) ?? [],
    regularPrice: data.regular_price as number,
    salePrice: data.sale_price as number | undefined,
    stockQuantity: data.stock_quantity as number,
    category: data.category as string | undefined,
    description: data.description as string | undefined,
    qnaPairs:
      (data.qna_pairs as Array<{ question: string; answer: string }>) ?? [],
    returnConditions: data.return_conditions as string | undefined,
    requiredOrderFields:
      (data.required_order_fields as Array<{ fieldName: string; question: string }>) ?? [],
    relatedProductIds: (data.related_product_ids as string[]) ?? [],
    wooProductId: data.woo_product_id as number | undefined,
  };
}

// ============================================================
// product_videos helpers
// ============================================================
export async function getProductVideo(
  productId: string,
  purpose: string
): Promise<string | null> {
  const sb = getSupabaseClient();

  // Try exact purpose first
  const { data } = await sb
    .from("product_videos")
    .select("video_url")
    .eq("product_id", productId)
    .eq("purpose", purpose)
    .limit(1)
    .single();

  if (data?.video_url) return data.video_url as string;

  // Fallback to 'general'
  const { data: fallback } = await sb
    .from("product_videos")
    .select("video_url")
    .eq("product_id", productId)
    .eq("purpose", "general")
    .limit(1)
    .single();

  return (fallback?.video_url as string) ?? null;
}

// ============================================================
// human_queue helpers
// ============================================================
export async function addToHumanQueue(
  conversationId: string,
  reason: string,
  note?: string
): Promise<void> {
  const sb = getSupabaseClient();
  await sb.from("human_queue").insert({
    conversation_id: conversationId,
    reason,
    note: note ?? null,
    priority: reason === "ai_failed" ? 2 : 1,
  });
  await setConversationStatus(conversationId, "human_queue");
}

// ============================================================
// spam helpers
// ============================================================
export async function updateCustomerSpamScore(
  customerId: string,
  score: number,
  isSpam: boolean
): Promise<void> {
  const sb = getSupabaseClient();
  await sb.from("customers").update({ spam_score: score, is_spam: isSpam }).eq(
    "id",
    customerId
  );
  if (isSpam) {
    await sb.from("spam_entries").insert({
      customer_id: customerId,
      reason: "auto_detected",
      spam_score: score,
    });
  }
}

// ============================================================
// follow_up_jobs helpers
// ============================================================
export async function hasFollowUpSentToday(
  conversationId: string
): Promise<boolean> {
  const sb = getSupabaseClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data } = await sb
    .from("follow_up_jobs")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("status", "sent")
    .gte("sent_at", today.toISOString())
    .limit(1);

  return (data?.length ?? 0) > 0;
}

export async function createFollowUpJob(
  conversationId: string,
  scheduledFor: Date,
  qstashMessageId?: string
): Promise<string> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("follow_up_jobs")
    .insert({
      conversation_id: conversationId,
      qstash_message_id: qstashMessageId ?? null,
      scheduled_for: scheduledFor.toISOString(),
      status: "scheduled",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`createFollowUpJob failed: ${error?.message}`);
  return data.id as string;
}

export async function markFollowUpSent(jobId: string): Promise<void> {
  const sb = getSupabaseClient();
  await sb
    .from("follow_up_jobs")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", jobId);
}

// ============================================================
// order helpers
// ============================================================
export async function createOrder(params: {
  customerId: string;
  conversationId: string;
  items: unknown[];
  totalAmount: number;
  deliveryAddress?: string;
}): Promise<string> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("orders")
    .insert({
      customer_id: params.customerId,
      conversation_id: params.conversationId,
      items: params.items,
      total_amount: params.totalAmount,
      delivery_address: params.deliveryAddress ?? null,
      payment_method: "cod",
      status: "new",
      woo_sync_status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`createOrder failed: ${error?.message}`);
  return data.id as string;
}

export async function updateOrderWooSync(
  orderId: string,
  wooOrderId: number | null,
  status: "synced" | "failed",
  attempts?: number
): Promise<void> {
  const sb = getSupabaseClient();
  await sb
    .from("orders")
    .update({
      woo_order_id: wooOrderId,
      woo_sync_status: status,
      ...(attempts !== undefined ? { woo_sync_attempts: attempts } : {}),
    })
    .eq("id", orderId);
}
