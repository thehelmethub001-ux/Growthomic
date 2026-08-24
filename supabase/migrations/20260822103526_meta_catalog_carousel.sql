-- Add WhatsApp Commerce Catalog support (for product carousel messages)
ALTER TABLE public.business_settings
ADD COLUMN IF NOT EXISTS meta_catalog_id text;

-- Tracks when a product was last successfully pushed to the Meta Commerce Catalog.
-- NULL means "never synced" -> queue-processor will fall back to sending plain images
-- instead of a WhatsApp product carousel for that product.
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS catalog_synced_at timestamptz;
