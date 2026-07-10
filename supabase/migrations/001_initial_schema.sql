-- ============================================================
-- 001_initial_schema.sql
-- AI Sales Agent — Core Tables
-- Single-tenant deployment (no multi-tenant machinery)
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID generation


-- ============================================================
-- business_settings (single row — replaces clients table)
-- ============================================================
CREATE TABLE business_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name           TEXT NOT NULL DEFAULT '',
  description             TEXT,
  business_hours          TEXT,
  location                TEXT,
  delivery_area           TEXT,
  delivery_charge_info    TEXT,
  contact_info            TEXT,

  ai_reply_mode           TEXT NOT NULL DEFAULT 'full_auto'
                            CHECK (ai_reply_mode IN ('full_auto', 'suggestive', 'hybrid')),
  reply_language          TEXT NOT NULL DEFAULT 'bangla_banglish',
  reply_tone              TEXT NOT NULL DEFAULT 'professional_friendly',

  follow_up_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  follow_up_delay_minutes INT NOT NULL DEFAULT 2,
  follow_up_max_per_day   INT NOT NULL DEFAULT 1,

  restricted_topics       TEXT[] NOT NULL DEFAULT '{}',

  -- WooCommerce credentials (stored encrypted — encrypt at app layer)
  woo_api_url             TEXT,
  woo_consumer_key        TEXT,
  woo_consumer_secret     TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed single row on migration
INSERT INTO business_settings (id, business_name)
VALUES (gen_random_uuid(), 'My Business')
ON CONFLICT DO NOTHING;

-- ============================================================
-- products
-- ============================================================
CREATE TABLE products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                   TEXT UNIQUE,
  name                  TEXT NOT NULL,
  images                TEXT[] NOT NULL DEFAULT '{}',
  regular_price         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sale_price            NUMERIC(12, 2),
  stock_quantity        INT NOT NULL DEFAULT 0,
  category              TEXT,
  description           TEXT,

  -- Manually written Q&A pairs: [{question, answer}, ...]
  qna_pairs             JSONB NOT NULL DEFAULT '[]',

  -- What proof customer must give for returns on this product
  return_conditions     TEXT,

  -- Fields that MUST be answered before creating an order
  -- [{fieldName: string, question: string}, ...]
  required_order_fields JSONB NOT NULL DEFAULT '[]',

  -- Related products for upsell/cross-sell
  related_product_ids   UUID[] NOT NULL DEFAULT '{}',

  -- WooCommerce product ID for order push
  woo_product_id        INT,

  -- pgvector embedding (generated from name + description + qna_pairs)
  -- Populated by backend after product save
  embedding             vector(1536),

  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- product_videos
-- ============================================================
CREATE TABLE product_videos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  video_url   TEXT NOT NULL,
  purpose     TEXT NOT NULL DEFAULT 'general'
                CHECK (purpose IN ('usage', 'return_process', 'unboxing', 'general')),
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- customers
-- ============================================================
CREATE TABLE customers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT,
  platform         TEXT NOT NULL
                     CHECK (platform IN ('messenger', 'instagram', 'whatsapp')),
  -- Page-scoped PSID for FB/IG, phone number for WhatsApp
  platform_id      TEXT NOT NULL,

  spam_score       INT NOT NULL DEFAULT 0,
  is_spam          BOOLEAN NOT NULL DEFAULT FALSE,
  is_blocked       BOOLEAN NOT NULL DEFAULT FALSE,

  -- Per-customer AI auto-reply toggle (independent of spam score)
  ai_reply_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- VIP customers are never auto-flagged as spam
  is_vip           BOOLEAN NOT NULL DEFAULT FALSE,

  -- Soft delete: resets ai_reply_enabled = true on next message
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (platform, platform_id)
);

-- ============================================================
-- conversations
-- ============================================================
CREATE TABLE conversations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id                 UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  platform                    TEXT NOT NULL
                                CHECK (platform IN ('messenger', 'instagram', 'whatsapp')),

  status                      TEXT NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'human_queue', 'spam_queue', 'ai_failed')),

  -- True when conversation is locked and AI should NOT reply
  is_locked_for_ai            BOOLEAN NOT NULL DEFAULT FALSE,

  -- Who the conversation is assigned to (human agent name/email)
  assigned_to                 TEXT,

  -- Meta 24-hour messaging window expiry
  platform_window_expires_at  TIMESTAMPTZ,

  -- Tracks customer answers to per-product required pre-order questions
  -- {productId: {fieldName: answer, ...}, ...}
  customer_answers            JSONB NOT NULL DEFAULT '{}',

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- messages (conversation history for AI context window)
-- ============================================================
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  -- 'customer' | 'ai' | 'human_agent'
  role            TEXT NOT NULL CHECK (role IN ('customer', 'ai', 'human_agent')),
  content         TEXT,

  -- For customer image/voice messages
  media_type      TEXT CHECK (media_type IN ('image', 'voice', 'video', NULL)),
  media_url       TEXT,

  -- Platform-native message ID (for idempotency)
  platform_message_id TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- orders
-- ============================================================
CREATE TABLE orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  conversation_id  UUID REFERENCES conversations(id) ON DELETE SET NULL,

  -- [{productId, name, qty, unitPrice, wooProductId}, ...]
  items            JSONB NOT NULL DEFAULT '[]',

  total_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  delivery_address TEXT,
  payment_method   TEXT NOT NULL DEFAULT 'cod',

  status           TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'confirmed', 'shipped', 'delivered', 'returned', 'cancelled')),

  -- WooCommerce sync
  woo_order_id     INT,
  woo_sync_status  TEXT NOT NULL DEFAULT 'pending'
                     CHECK (woo_sync_status IN ('pending', 'synced', 'failed')),
  woo_sync_attempts INT NOT NULL DEFAULT 0,

  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- human_queue (Return + AI Failed + Complaints)
-- ============================================================
CREATE TABLE human_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  reason          TEXT NOT NULL
                    CHECK (reason IN ('return', 'ai_failed', 'complaint')),
  priority        INT NOT NULL DEFAULT 1,

  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'resolved')),

  note            TEXT,
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- spam_entries
-- ============================================================
CREATE TABLE spam_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  spam_score  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- follow_up_jobs
-- ============================================================
CREATE TABLE follow_up_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  -- QStash message ID (to cancel if customer replies)
  qstash_message_id TEXT,

  scheduled_for   TIMESTAMPTZ NOT NULL,
  sent_at         TIMESTAMPTZ,

  status          TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'sent', 'cancelled', 'skipped')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- idempotency_log (replaces Upstash Redis for webhook dedup)
-- Optional: use Upstash Redis instead for performance
-- ============================================================
CREATE TABLE idempotency_log (
  platform_message_id TEXT PRIMARY KEY,
  processed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-cleanup old idempotency records after 7 days
-- (handled by pg_cron or Supabase Edge Function scheduled run)

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_customers_platform_id ON customers(platform, platform_id);
CREATE INDEX idx_conversations_customer_id ON conversations(customer_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_woo_sync_status ON orders(woo_sync_status);
CREATE INDEX idx_human_queue_status ON human_queue(status);
CREATE INDEX idx_human_queue_reason ON human_queue(reason);
CREATE INDEX idx_follow_up_jobs_conversation_id ON follow_up_jobs(conversation_id);
CREATE INDEX idx_follow_up_jobs_status ON follow_up_jobs(status);
CREATE INDEX idx_product_videos_product_id ON product_videos(product_id);
CREATE INDEX idx_spam_entries_customer_id ON spam_entries(customer_id);

-- ============================================================
-- updated_at auto-trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_business_settings_updated_at
  BEFORE UPDATE ON business_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_human_queue_updated_at
  BEFORE UPDATE ON human_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
