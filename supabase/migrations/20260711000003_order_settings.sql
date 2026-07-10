-- Add woo_sync_enabled and google_sheets_webhook_url to business_settings
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS woo_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS google_sheets_webhook_url TEXT;
