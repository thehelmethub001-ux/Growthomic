-- Add API Key columns to business_settings
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS openai_api_key TEXT;
