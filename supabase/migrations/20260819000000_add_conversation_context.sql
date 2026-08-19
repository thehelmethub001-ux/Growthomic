-- Add deterministic conversation context for AI
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_product_id UUID REFERENCES products(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_variant_id TEXT;
