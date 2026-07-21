// _shared/types.ts
// Shared TypeScript types for all Edge Functions

export type Platform = "messenger" | "instagram" | "whatsapp";
export type ConversationStatus =
  | "open"
  | "human_queue"
  | "spam_queue"
  | "ai_failed";
export type HumanQueueReason = "return" | "ai_failed" | "complaint" | "order_status";
export type MessageRole = "customer" | "ai" | "human_agent";
export type WooSyncStatus = "pending" | "synced" | "failed";
export type FollowUpJobStatus =
  | "scheduled"
  | "sent"
  | "cancelled"
  | "skipped";
export type VideoPurpose =
  | "usage"
  | "return_process"
  | "unboxing"
  | "general";

// ============================================================
// Incoming webhook payload (normalized across platforms)
// ============================================================
export interface NormalizedMessage {
  platformMessageId: string;
  platform: Platform;
  customerId?: string; // DB UUID (resolved after upsert)
  platformId: string; // page-scoped PSID or phone number
  customerName?: string;
  text?: string;
  mediaType?: "image" | "voice" | "video";
  mediaUrl?: string;
  timestamp: number;
}

// ============================================================
// Queue payload sent to QStash
// ============================================================
export interface QueuePayload {
  platformMessageId: string;
  platform: Platform;
  platformId: string;
  customerName?: string;
  text?: string;
  mediaType?: "image" | "voice" | "video";
  mediaUrl?: string;
  timestamp: number;
  pageId?: string; // FB/IG page ID or WA phone number ID
}

// ============================================================
// Business settings (from DB)
// ============================================================
export interface BusinessSettings {
  id: string;
  businessName: string;
  description?: string;
  businessHours?: string;
  location?: string;
  deliveryArea?: string;
  deliveryChargeInfo?: string;
  contactInfo?: string;
  aiReplyMode: "full_auto" | "suggestive" | "hybrid";
  replyLanguage: string;
  replyTone: string;
  followUpEnabled: boolean;
  followUpDelayMinutes: number;
  followUpMaxPerDay: number;
  restrictedTopics: string[];
  customPrompt?: string | null;
  wooApiUrl?: string;
  wooConsumerKey?: string;
  wooConsumerSecret?: string;
  geminiApiKey?: string | null;
  openaiApiKey?: string | null;
  wooSyncEnabled: boolean;
  googleSheetsWebhookUrl?: string | null;
}

export interface LearnedResponse {
  id: string;
  question: string;
  answer: string;
  similarity?: number;
}

// ============================================================
// Product (from DB)
// ============================================================
export interface Product {
  id: string;
  sku?: string;
  name: string;
  images: string[];
  regularPrice: number;
  salePrice?: number;
  stockQuantity: number;
  category?: string;
  description?: string;
  qnaPairs: Array<{ question: string; answer: string }>;
  returnConditions?: string;
  requiredOrderFields: Array<{ fieldName: string; question: string }>;
  relatedProductIds: string[];
  wooProductId?: number;
  variations?: any[];
}

// ============================================================
// Offer (from DB)
// ============================================================
export interface Offer {
  id: string;
  name: string;
  description: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  min_order_amount?: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

// ============================================================
// Customer (from DB)
// ============================================================
export interface Customer {
  id: string;
  name?: string;
  platform: Platform;
  platformId: string;
  spamScore: number;
  isSpam: boolean;
  isBlocked: boolean;
  aiReplyEnabled: boolean;
  isVip: boolean;
  isDeleted: boolean;
}

// ============================================================
// Conversation (from DB)
// ============================================================
export interface Conversation {
  id: string;
  customerId: string;
  platform: Platform;
  status: ConversationStatus;
  isLockedForAI: boolean;
  assignedTo?: string;
  platformWindowExpiresAt?: string;
  customerAnswers: Record<
    string,
    Record<string, string>
  >; // {productId: {fieldName: answer}}
}

// ============================================================
// AI intent classification result
// ============================================================
export type MessageIntent =
  | "product_inquiry"
  | "price_inquiry"
  | "order_intent"
  | "return_intent"
  | "complaint"
  | "greeting"
  | "follow_up_response"
  | "how_to_use"
  | "unboxing"
  | "off_topic"
  | "spam"
  | "unknown";

export interface AIResult {
  reply: string;
  intent: MessageIntent;
  detectedProductId?: string;
  orderData?: {
    items: Array<{
      productId: string;
      name: string;
      qty: number;
      unitPrice: number;
      wooProductId?: number;
    }>;
    deliveryAddress?: string;
    totalAmount: number;
  };
  sendProductImage?: boolean;
  productImageUrl?: string;    // single image (legacy)
  productImageUrls?: string[]; // multiple images support
  sendVideo?: boolean;
  videoUrl?: string;
  imageOnly?: boolean; // if true, skip text reply and ONLY send the image
}

// ============================================================
// Order item
// ============================================================
export interface OrderItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  wooProductId?: number;
}
