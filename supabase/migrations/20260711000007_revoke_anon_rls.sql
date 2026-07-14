-- Remove anon RLS from business_settings for security
DROP POLICY IF EXISTS "anon_users_can_read_business_settings" ON business_settings;
DROP POLICY IF EXISTS "anon_users_can_update_business_settings" ON business_settings;
