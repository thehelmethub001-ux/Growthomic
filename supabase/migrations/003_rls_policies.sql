-- ============================================================
-- 003_rls_policies.sql
-- Row Level Security — Single-tenant, service-role-only access
-- All Edge Functions use SUPABASE_SERVICE_ROLE_KEY → bypass RLS
-- Dashboard uses anon/user key → RLS enforced
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE business_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE products               ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_videos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages               ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE human_queue            ENABLE ROW LEVEL SECURITY;
ALTER TABLE spam_entries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_log        ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Policy: Only authenticated users (dashboard admin) can access
-- Edge Functions use service_role key which bypasses RLS entirely
-- ============================================================

-- business_settings
CREATE POLICY "auth_users_can_read_business_settings"
  ON business_settings FOR SELECT
  TO authenticated USING (TRUE);

CREATE POLICY "auth_users_can_update_business_settings"
  ON business_settings FOR UPDATE
  TO authenticated USING (TRUE);

-- products
CREATE POLICY "auth_users_can_all_products"
  ON products FOR ALL
  TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- product_videos
CREATE POLICY "auth_users_can_all_product_videos"
  ON product_videos FOR ALL
  TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- customers
CREATE POLICY "auth_users_can_all_customers"
  ON customers FOR ALL
  TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- conversations
CREATE POLICY "auth_users_can_all_conversations"
  ON conversations FOR ALL
  TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- messages
CREATE POLICY "auth_users_can_all_messages"
  ON messages FOR ALL
  TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- orders
CREATE POLICY "auth_users_can_all_orders"
  ON orders FOR ALL
  TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- human_queue
CREATE POLICY "auth_users_can_all_human_queue"
  ON human_queue FOR ALL
  TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- spam_entries
CREATE POLICY "auth_users_can_all_spam_entries"
  ON spam_entries FOR ALL
  TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- follow_up_jobs
CREATE POLICY "auth_users_can_all_follow_up_jobs"
  ON follow_up_jobs FOR ALL
  TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- idempotency_log (Edge Functions only via service_role — no dashboard access needed)
-- No authenticated policy needed; service_role bypasses RLS

-- ============================================================
-- Storage Buckets
-- ============================================================

-- Product images bucket (permanent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  TRUE,
  5242880,  -- 5MB limit per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

-- Inbound media bucket (temp — customer-sent images/voice, 1-day lifecycle)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'temp-inbound',
  'temp-inbound',
  FALSE,
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'audio/ogg', 'audio/mpeg', 'video/mp4']
) ON CONFLICT (id) DO NOTHING;

-- Product videos bucket (permanent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-videos',
  'product-videos',
  TRUE,
  104857600,  -- 100MB
  ARRAY['video/mp4', 'video/quicktime', 'video/webm']
) ON CONFLICT (id) DO NOTHING;

-- Storage Policies
CREATE POLICY "auth_users_can_upload_product_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "public_can_read_product_images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'product-images');

CREATE POLICY "auth_users_can_delete_product_images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images');

CREATE POLICY "auth_users_can_upload_product_videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-videos');

CREATE POLICY "public_can_read_product_videos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'product-videos');

CREATE POLICY "service_can_manage_temp_inbound"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'temp-inbound')
  WITH CHECK (bucket_id = 'temp-inbound');
