# [Client Name] — AI Sales Agent PRD

> **Version:** 1.0
> **Date:** July 2026
> **Base Architecture:** Growthomic v1.4 (single-tenant deployment)
> **Backend:** Dedicated Supabase project (isolated from Growthomic SaaS DB)
> **Status:** Draft — Internal Build Document

---

## 0. Relationship to Growthomic

This is **not** a new system built from scratch. It reuses the proven Growthomic v1.4 backend architecture (webhook pipeline, AI Failed Queue, SpamGuard, Return/Human Queue, Follow-up Engine, CRM, storage strategy) but deploys it for **one client only**, in a **separate Supabase project**, with the multi-tenant SaaS machinery removed and several client-specific features added.

### 0.1 Reused As-Is from Growthomic
- Webhook pipeline order (HMAC verify → BullMQ queue → 200 response → worker processing)
- Idempotency locking (`@upstash/redis` REST, key = `webhook:{platformMessageId}`)
- Distributed conversation lock (`lock:conversation:{conversationId}`, 30s TTL)
- `isLockedForAI` priority-check pattern
- AI Failed Queue pattern (catch → lock conversation → human_queue → notify → no retry without human review)
- SpamGuard scoring pattern (score-based, threshold-driven)
- Hybrid RAG (pgvector HNSW cosine + `pg_trgm` ILIKE)
- R2 storage strategy: Sharp → WebP compression, `temp-inbound/` lifecycle-based auto-delete (1 day) — **no manual instant-delete code**, this is intentionally handled by the R2 lifecycle rule to avoid race conditions and extra API calls
- Resend for email, Winston + Sentry for logging/monitoring
- Sessions table for auth (instead of `refreshTokenHashes[]`)

### 0.2 Stripped (multi-tenant SaaS machinery — not needed for one client)
- `clients` table as a multi-tenant registry → replaced with a single `business_settings` row
- Tenant isolation middleware (`req.user.clientId` on every query) → not required; single business context
- Message quota / billing tiers / `quotaResetDate` / plan upgrade flow
- Super Admin Panel (Section 9 of Growthomic PRD) — entire section removed
- Admin Broadcast feature (`broadcasts` table)
- Support ticket system (`support_tickets`, `support_ticket_replies`)
- Team plan / billing section in dashboard Settings (Growth/Pro plan gating)

### 0.3 New / Client-Specific Additions
- Manual-only product catalog (no live website product sync — cost control decision)
- One-way WooCommerce **order push** integration (order creation only, not product sync)
- Per-product video mapping by purpose (return video vs usage video vs unboxing video)
- Per-product required pre-order questions (block order until answered)
- AI can **send** product images back to customer, not just receive/understand them
- Client-configurable spam on/off toggle **per customer**, with delete option
- Client-configurable follow-up delay + "once per day" rule
- Explicit compliance design for Meta's Jan 15, 2026 WhatsApp general-purpose-AI-chatbot ban

---

## 1. Product Vision

An AI sales executive — on Messenger, Instagram DM, and WhatsApp — for one Bangladeshi e-commerce business. It answers product questions, takes COD orders, pushes them to WooCommerce automatically, detects and manages spam, hands off returns and failures to a human gracefully, and follows up on customers who went quiet — all from a single dashboard.

---

## 2. Tech Stack

Identical to Growthomic v1.4, with one change: **dedicated Supabase project**, not shared with the Growthomic SaaS database.

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind, shadcn/ui |
| Backend | Node.js, Express 5, TypeScript |
| Database | PostgreSQL via **dedicated Supabase project** |
| ORM | Drizzle ORM |
| Vector Search | pgvector (HNSW) + `pg_trgm` |
| AI Engine | Google Gemini 1.5 Flash (text + vision) |
| Voice | OpenAI Whisper (transcription only) |
| Storage | Cloudflare R2 |
| Queue | BullMQ (ioredis) |
| Cache/Locks | Upstash Redis (REST) |
| Email | Resend SDK |
| Order Sync | WooCommerce REST API (order push only, one-way) |

> **Version Safety Rule (unchanged):** web-search each dependency for latest stable + CVE before writing `package.json`. Never copy version numbers from this document.

---

## 3. System Architecture Overview

```
┌───────────────────────────────────────────────────────────────┐
│   Facebook Messenger  │  Instagram DM  │  WhatsApp Cloud API   │
└─────────┬─────────────┬─────────────────┬──────────────────────┘
          ▼             ▼                 ▼
┌───────────────────────────────────────────────────────────────┐
│              BACKEND (Express + TS, single-tenant)             │
│  Webhook + HMAC + BullMQ → AI Engine (Gemini + RAG) → Order    │
│  Engine → WooCommerce Order Push (one-way, order-create only)  │
│  SpamGuard │ AI Failed Queue │ Return Queue │ Follow-up Engine  │
│  Postgres/Supabase (pgvector) │ Upstash Redis │ Cloudflare R2   │
└───────────────────────────────────────────────────────────────┘
```

### 3.1 Webhook Message Flow (adapted from Growthomic Section 5)

Same 8-step pipeline as Growthomic (idempotency → isLockedForAI check → human queue check → conversation lock → window check → SpamGuard → quota-free since single client, skip → AI engine with hybrid RAG), with these client-specific insertions:

**Step 6.5 — Required Pre-Order Field Check** (new)
```
If message intent = "wants to order" AND product.requiredOrderFields is non-empty:
  → check customerAnswers for this product in this conversation
  → if unanswered required fields exist:
      → AI asks the required question(s) BEFORE creating the order
      → do NOT create WooCommerce order yet
  → if all answered:
      → proceed to Order Engine
```

**Step 8.5 — WooCommerce Order Push** (new, replaces "save to local orders table only")
```
On order confirmation:
  1. Save to local `orders` table (source of truth for dashboard)
  2. POST to WooCommerce REST API /wp-json/wc/v3/orders
     - payment_method: 'cod'
     - line_items: mapped from local product IDs → WooCommerce product IDs
     - billing: name, phone, address (single freeform string, same as Growthomic Prompt B)
  3. Store returned WooCommerce order ID on local order row (`wooOrderId`)
  4. If WooCommerce API call fails: keep local order as source of truth,
     flag `wooSyncStatus = 'failed'`, retry via BullMQ (3 attempts, exponential backoff),
     surface failed syncs in dashboard Orders tab for manual push
```

---

## 4. Database Schema (Core Tables — deltas from Growthomic)

### 4.1 `business_settings` (replaces `clients` table — single row)
```
id, businessName, description, businessHours, location,
deliveryArea, deliveryChargeInfo, contactInfo,
aiReplyMode ENUM('full_auto','suggestive','hybrid') DEFAULT 'full_auto',
replyLanguage, replyTone,
followUpEnabled boolean DEFAULT true,
followUpDelayMinutes int DEFAULT 2,        -- client-configurable
followUpMaxPerDay int DEFAULT 1,           -- locked to 1 per requirement
restrictedTopics text[],                   -- competitor names, owner info, custom
wooCommerceApiUrl, wooCommerceConsumerKey, wooCommerceConsumerSecret (encrypted),
createdAt, updatedAt
```

### 4.2 `products` (extends Growthomic's products table)
```
id, sku, name, images text[], regularPrice, salePrice, stockQuantity,
category, description,
qnaPairs jsonb,              -- [{question, answer}, ...] manually entered by client
returnConditions text,       -- what proof customer must give for THIS product
requiredOrderFields jsonb,   -- [{fieldName, question}] — must be answered before order
relatedProductIds uuid[],    -- for "customer might also like"
embedding vector(1536),      -- pgvector, generated from name+description+qnaPairs
createdAt, updatedAt
```

### 4.3 `product_videos` (new table)
```
id, productId (FK), videoUrl, purpose ENUM('usage','return_process','unboxing','general'),
label, createdAt
```
> AI selects video by matching customer intent (e.g. return question → `return_process` video) rather than always sending the first video.

### 4.4 `customers` (extends Growthomic's customers table)
```
id, name, platform ENUM('messenger','instagram','whatsapp'),
platformId (page-scoped ID or phone number),
spamScore, isSpam, isBlocked, aiReplyEnabled boolean DEFAULT true,
isVip boolean DEFAULT false,     -- whitelist, never auto-flagged as spam
isDeleted, deletedAt,
createdAt, updatedAt
```
> Deleting a customer resets `aiReplyEnabled = true` per requirement #2 (deleted customers return to normal auto-reply if they message again — i.e. delete = full reset, not permanent block).

### 4.5 `conversations` (same pattern as Growthomic)
```
id, customerId, platform, status ENUM('open','human_queue','spam_queue','ai_failed'),
isLockedForAI, assignedTo, platformWindowExpiresAt,
customerAnswers jsonb,   -- tracks answers to per-product required questions
createdAt, updatedAt
```

### 4.6 `orders` (extends Growthomic's orders table)
```
id, customerId, items jsonb, totalAmount, deliveryAddress,
paymentMethod DEFAULT 'cod', status,
wooOrderId, wooSyncStatus ENUM('pending','synced','failed'),
createdAt, updatedAt
```

### 4.7 `human_queue` (same as Growthomic — Return + AI Failed + Complaints)
```
id, conversationId, reason ENUM('return','ai_failed','complaint'),
priority, status ENUM('pending','in_progress','resolved'),
note, resolvedAt, createdAt
```

### 4.8 `spam_entries` (same as Growthomic, minus `autoReplyEnabled` which was already removed in v1.4 audit)
```
id, customerId, reason, spamScore, createdAt
```

### 4.9 `follow_up_jobs` (same as Growthomic)
```
id, conversationId, bullmqJobId, scheduledFor, sentAt, status
```

---

## 5. Feature Specifications

### 5.1 Product Knowledge Base (manual-only, no website sync)
- Client manually adds each product: images, price, stock, category, description
- Client manually writes Q&A pairs anticipating customer questions per product
- Client manually writes return conditions per product (what proof is needed)
- Client manually defines required pre-order questions per product (e.g. "which size?")
- On save, backend generates the embedding (OpenAI `text-embedding-3-small`) from name + description + Q&A, stored in `products.embedding`
- **No live sync with any website** — this was explicitly removed to control embedding-API and webhook-sync cost. WooCommerce is used **only** for pushing confirmed orders out, never for pulling product data in.

### 5.2 WooCommerce Order Push (one-way)
- Covered in Section 3.1, Step 8.5 above.
- This is intentionally **one-way** (Growthomic → WooCommerce), which avoids the recurring embedding-regeneration cost that a live two-way product sync would require.

### 5.3 AI Sales Agent Behavior & Compliance

**Persona & training**
- Trained specifically for Bangladeshi customers writing in Bangla, Banglish, and broken/typo-heavy English
- Never answers anything outside e-commerce/product/order scope
- Never mixes one customer's information with another's (strict per-conversation context)
- On a vague opening message ("hi", "price koto"), asks: *"Sir, kon product ta somporke jante chacchen?"* before proceeding
- Acts like a persistent (not pushy) sales executive: if a customer asks about price and goes quiet, AI follows up once via the Follow-up Engine (see 5.7)

**Restricted topics (`business_settings.restrictedTopics` + hardcoded rules)**
- ❌ Competitor names
- ❌ Business owner's personal information
- ❌ Price confirmation for out-of-stock products
- ❌ Discounts without owner permission
- ❌ Any product not sold by this specific client
- ✅ Always states delivery within 3 days (unless overridden per product)

**Meta WhatsApp compliance (Jan 15, 2026 policy) — important, not optional**
Meta bans "general-purpose AI chatbots" (open-domain, ask-anything assistants) on the WhatsApp Business API, effective for all accounts since Jan 15, 2026. Structured, business-scoped bots (order taking, product Q&A, support) remain explicitly permitted. To stay compliant:
- System prompt hard-locks the AI to e-commerce/product/order/return scope only
- Any out-of-scope question (weather, general knowledge, unrelated chat) gets a fixed redirect reply, never an open answer
- No "general assistant" framing anywhere in the prompt or UI — the bot must always present itself as this business's sales agent, not a general AI
- Recommend periodic conversation-log review (already possible via the Inbox section) to confirm the bot is staying in scope

### 5.4 Spam Detection & Management
Same scoring pattern as Growthomic, with client-facing controls per requirement #2:

**Auto-detection criteria**
- 10+ messages within 5 minutes → spam signal
- Same message repeated → spam signal
- Abusive/profane language → spam signal (also usable standalone, not just as a threshold trigger)

**Client controls (Spam Management dashboard section)**
- List shows: name, platform ID (Messenger/Instagram) or phone number (WhatsApp), reason, spam score, date
- Per-customer on/off toggle for AI auto-reply — independent of spam score (client can manually flag anyone, e.g. a known troll, without waiting for the score to trigger)
- Delete option — deleting resets `aiReplyEnabled = true`, so if that person messages again later they're treated as a fresh customer, not permanently blocked
- VIP whitelist — flagged customers who should never be auto-detected as spam

### 5.5 Return & Human Queue
- When AI detects a return-intent conversation it cannot resolve alone, it replies: *"Sir, apnar shathe khub shigroi jogajog kora hobe"* and:
  - Sets `conversation.status = 'human_queue'`, `isLockedForAI = true`
  - Adds entry to `human_queue` with `reason = 'return'`
- Client sees it in the Return & Human Queue dashboard tab, handles it manually (including the actual return/refund process, which stays outside the AI's scope)
- Client manually flips `aiReplyEnabled` back on for that customer once the return is resolved — **this step is required**, because if AI stays off and the customer messages about a *different* product later, they'd get no reply at all otherwise

### 5.6 AI Failed Queue (identical pattern to Growthomic v1.4)
- On any AI processing error: no message sent to customer, conversation locked, `human_queue` entry with `reason = 'ai_failed'`, dashboard notification to client, no automatic retry
- AI's fallback message to the customer (if applicable per the flow) is the same "shortly contact kora hobe" line as the return flow — consistent tone

### 5.7 Follow-Up Engine
- Client sets: delay in minutes (default 2) and this is a hard "once" rule — only one follow-up per unanswered conversation, same calendar day as the original message
- Trigger: customer asked something (e.g. price) and did not respond within the delay window
- Message pattern: *"Sir, apni [product] somporke ar kisu jante chan, naki order confirm korte chan?"*
- No repeat follow-ups even if the customer later sends a new unrelated message that also goes unanswered — one follow-up per day is the ceiling, not per-thread

### 5.8 Voice & Image Understanding + Image Send-Back
- Voice notes (WhatsApp/Messenger/Instagram) → Whisper transcription → treated as a normal text message from there
- Images sent by customer → Gemini Vision analyzes (e.g. "is this the product you have a question about") → same lifecycle-based R2 delete as Growthomic (no manual instant-delete code)
- **New:** AI can proactively send a stored product image back to the customer when they ask to see a product — pulled from `products.images`, sent via the platform's native media-send endpoint (Messenger Send API attachment, WhatsApp media message, Instagram media message)

### 5.9 CRM & Analytics
Reuses Growthomic's CRM section with these specific queries surfaced in the dashboard:
- Total customer count
- Order frequency per customer (who orders most often)
- Highest lifetime spender
- Dormant customers (no purchase in 90 days) — for re-engagement targeting
- Standard analytics: daily message volume, AI vs human handled %, orders/day, revenue trend, platform breakdown (FB/IG/WA), most-asked questions, most-returned products

### 5.10 Related Product Suggestions
- When a customer orders, AI checks `products.relatedProductIds` and offers relevant add-ons — only if the customer engages with the suggestion (never forced into the order flow)

---

## 6. Dashboard Specification

Same page structure as Growthomic, with Billing/Team-plan gating removed (single client, no plan tiers needed):

| Page | Purpose |
|---|---|
| Overview | Today's messages, AI vs human %, new orders, revenue, pending return/failed/unsynced-order counts |
| Inbox | Unified FB/IG/WA conversations, per-conversation AI on/off toggle, internal notes |
| Orders | New/Confirmed/Shipped/Delivered/Return/Cancelled tabs, WooCommerce sync status per order, manual retry-push button for failed syncs |
| Products | Manual add (image, video-by-purpose, price, stock, Q&A, return conditions, required pre-order questions, related products) |
| AI Settings | Business info, reply mode (Full Auto/Suggestive/Hybrid), follow-up delay config, restricted topics list, test-message sandbox |
| Spam Management | Spam list, per-customer AI on/off, delete (with reset behavior), VIP whitelist, auto-rule thresholds |
| Return & Human Queue | Return / AI Failed / Complaints tabs, resolve + resume-AI action |
| Analytics | Charts + CRM queries (Section 5.9) |
| Settings | Business profile, platform connections (FB/IG/WA/WooCommerce), notification preferences, 2FA |

---

## 7. Storage & Cost Strategy (unchanged from Growthomic)

- Cloudflare R2: $0.015/GB/month, **free egress**
- Sharp compression: incoming images → WebP (~70–93% size reduction before storage)
- `temp-inbound/{businessId}/...` — R2 lifecycle rule auto-deletes after 1 day (not manual code — avoids race conditions and extra delete-API cost)
- Product images (permanent): `products/{productId}/{uuid}.webp`
- Estimated launch-time DB/cache cost: ~৳0 (Supabase free tier, Upstash free tier at this scale)

---

## 8. Meta Platform Compliance Checklist

- [ ] Business Verification completed under the **client's actual business documents** (trade license etc.) — not Kausar's personal/dev account, to avoid display-name/asset-ownership mismatches
- [ ] Client's Facebook Page + Instagram Professional account + WhatsApp number added as assets under a verified Business Portfolio (or client added as an App Role) — this is what allows skipping full App Review for a single-client deployment
- [ ] WhatsApp number verification completed before relying on volumes above 250 conversations/day (this cap is permanent without verification)
- [ ] System prompt hard-scoped to business/e-commerce use only (Jan 2026 WhatsApp policy compliance — see Section 5.3)
- [ ] Privacy Policy + Terms of Service URLs set in the Meta App Basic Settings
- [ ] Contract/IP terms with client clarified upfront — this build shares architecture with the Growthomic SaaS product; worth being explicit with the client about what's exclusive to them vs. what's reused across future builds

---

## 9. Environment Variables (delta from Growthomic — remove multi-tenant-only vars)

```
# Remove (multi-tenant only, not needed):
QUOTA_RESET_CRON
SUPER_ADMIN_EMAIL
BROADCAST_QUEUE_NAME

# Keep (same as Growthomic):
DATABASE_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
REDIS_URL (ioredis, BullMQ)
UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
GEMINI_API_KEY
OPENAI_API_KEY (embeddings + Whisper)
R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY / R2_PUBLIC_URL
RESEND_API_KEY / EMAIL_FROM
META_APP_SECRET / META_VERIFY_TOKEN
JWT_ACCESS_SECRET / JWT_REFRESH_SECRET

# New for this project:
WOOCOMMERCE_API_URL
WOOCOMMERCE_CONSUMER_KEY
WOOCOMMERCE_CONSUMER_SECRET
```

---

## 10. Master Build Prompts (key new/changed modules)

### 10.1 WooCommerce Order Push Service
```
Build: src/services/woocommerce/orderPush.service.ts

pushOrder(localOrder): Promise<{ wooOrderId, success }>
  1. Map local product IDs → WooCommerce product IDs (products table stores wooProductId)
  2. POST /wp-json/wc/v3/orders
     body: {
       payment_method: 'cod', payment_method_title: 'Cash on Delivery',
       set_paid: false,
       billing: { first_name, phone, address_1: deliveryAddress },
       line_items: items.map(i => ({ product_id: i.wooProductId, quantity: i.qty }))
     }
  3. On success: UPDATE orders SET wooOrderId = res.id, wooSyncStatus = 'synced'
  4. On failure: UPDATE orders SET wooSyncStatus = 'failed'
     → enqueue BullMQ retry job (3 attempts, exponential backoff: 1m, 5m, 15m)
     → after 3 failures: dashboard notification "Order #X needs manual push"
```

### 10.2 Required Pre-Order Field Gate
```
Build: src/services/orders/requiredFieldGate.ts

checkRequiredFields(conversationId, productId): Promise<{ complete, nextQuestion }>
  1. Load product.requiredOrderFields
  2. Load conversation.customerAnswers
  3. Find first field in requiredOrderFields not present in customerAnswers
  4. If found → return { complete: false, nextQuestion: field.question }
  5. If none found → return { complete: true }

Wire into webhook.worker.ts BEFORE order creation:
  if (!checkRequiredFields.complete) {
    → AI replies with nextQuestion instead of creating the order
    → do NOT call Order Engine yet
  }
```

### 10.3 Per-Customer Spam Toggle + Delete-Reset
```
Build: src/modules/spam/spam.controller.ts

PATCH /api/v1/spam/:customerId/toggle-ai
  → UPDATE customers SET aiReplyEnabled = !aiReplyEnabled WHERE id = customerId

DELETE /api/v1/spam/:customerId
  1. DELETE FROM spam_entries WHERE customerId = customerId
  2. UPDATE customers SET aiReplyEnabled = true, isSpam = false, spamScore = 0
     WHERE id = customerId
  → Note: this is a RESET, not a permanent block — if this person messages
    again later, they are treated as a normal new inquiry
```

### 10.4 Follow-Up Engine (once-per-day rule)
```
Build: src/services/followup/followup.service.ts

scheduleFollowUp(conversationId):
  1. Check business_settings.followUpEnabled — if false, skip
  2. Check: has a follow_up_jobs row already been sent today for this conversation?
     → if yes, skip (hard "once per day" ceiling)
  3. Enqueue BullMQ delayed job: delay = business_settings.followUpDelayMinutes * 60000
  4. Job handler (on fire):
     a. Re-check conversation — if customer already replied, cancel silently
     b. If still unanswered → send follow-up message → INSERT follow_up_jobs (sentAt = now())
```

### 10.5 Product Video Selection by Intent
```
Build: src/services/ai/videoSelector.ts

selectVideo(productId, detectedIntent): Promise<videoUrl | null>
  1. intent classification already happens in contextualizer.ts (existing Growthomic pattern)
  2. map intent → purpose: 'return_question' → 'return_process', 'how to use' → 'usage', default → 'general'
  3. SELECT videoUrl FROM product_videos WHERE productId = ? AND purpose = ? LIMIT 1
  4. Fallback to 'general' purpose video if the specific one doesn't exist
```

---

## 11. Phased Roadmap

**Phase 1 (MVP)**
- [ ] Manual product catalog (images, Q&A, return conditions, required fields, related products)
- [ ] Webhook pipeline (FB/IG/WA) with HMAC + BullMQ, reused from Growthomic
- [ ] AI engine with hybrid RAG, Bangladesh/Banglish-trained prompt, restricted topics
- [ ] Order collection + WooCommerce order push (one-way)
- [ ] SpamGuard (auto-detect + manual per-customer toggle + delete-reset + VIP whitelist)
- [ ] Return & Human Queue + AI Failed Queue
- [ ] Follow-up Engine (client-configurable delay, once/day)
- [ ] Dashboard: Overview, Inbox, Orders, Products, AI Settings, Spam Management, Return & Human Queue, Settings

**Phase 2**
- [ ] Voice + image understanding, AI image send-back
- [ ] Product video-by-purpose mapping
- [ ] CRM queries + full Analytics dashboard
- [ ] Related product suggestions on order flow

---

## 12. Open Decisions (need client/Kausar input before or during build)

- [ ] Final product/brand name for this deployment (placeholder used above)
- [ ] Confirm client's Meta Business Portfolio + trade license documents are ready for verification
- [ ] Confirm WooCommerce store has API credentials generated (Consumer Key/Secret) and product IDs mapped
- [ ] Decide the exact "shortly contact kora hobe" phrasing set (Bangla/Banglish variants) for consistency across return / AI-failed flows

---

*PRD v1.0 — single-client deployment, built on Growthomic v1.4 architecture.*
*⚠️ Never hardcode package versions. Always web-search before install.*