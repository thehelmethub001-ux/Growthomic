-- Add Meta settings to business_settings
ALTER TABLE public.business_settings
ADD COLUMN IF NOT EXISTS meta_verify_token text DEFAULT '',
ADD COLUMN IF NOT EXISTS meta_app_secret text DEFAULT '',
ADD COLUMN IF NOT EXISTS meta_access_token text DEFAULT '';
