ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS pending_selections JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS active_slot_id TEXT;
