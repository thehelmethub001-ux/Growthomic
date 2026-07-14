-- Add social media links to business_settings table
ALTER TABLE public.business_settings
ADD COLUMN IF NOT EXISTS whatsapp_number text DEFAULT '',
ADD COLUMN IF NOT EXISTS instagram_url text DEFAULT '',
ADD COLUMN IF NOT EXISTS facebook_url text DEFAULT '';
