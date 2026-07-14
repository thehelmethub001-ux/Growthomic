-- ============================================================
-- offers
-- ============================================================
CREATE TABLE IF NOT EXISTS offers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  discount    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'scheduled', 'ended')),
  platform    TEXT NOT NULL DEFAULT 'All',
  reach       INT NOT NULL DEFAULT 0,
  starts      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Turn on RLS
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

-- Allow anon read/write (since backend uses anon or service_role and frontend currently relies on RLS policies we've disabled or bypassed)
CREATE POLICY "Enable all actions for offers" ON offers FOR ALL USING (true) WITH CHECK (true);
