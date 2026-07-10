-- Add custom_prompt column to business_settings
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS custom_prompt TEXT;
