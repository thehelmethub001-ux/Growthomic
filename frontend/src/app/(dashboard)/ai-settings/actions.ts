"use server";

import { createClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret } from "@/lib/encryption";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function saveEncryptedSettings(settings: any) {
  const dataToSave = { ...settings };
  
  // Encrypt only Meta sensitive tokens (not API keys — stored as plain text)
  if (dataToSave.meta_verify_token) dataToSave.meta_verify_token = encryptSecret(dataToSave.meta_verify_token);
  if (dataToSave.meta_app_secret) dataToSave.meta_app_secret = encryptSecret(dataToSave.meta_app_secret);
  if (dataToSave.meta_access_token) dataToSave.meta_access_token = encryptSecret(dataToSave.meta_access_token);
  // gemini_api_key and openai_api_key stored as plain text (Supabase auth protects the DB)

  const { error } = await supabase.from("business_settings").update(dataToSave).eq("id", settings.id);
  
  if (error) {
    console.error("Save settings error:", error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function getDecryptedSettings() {
  const { data, error } = await supabase.from("business_settings").select("*").limit(1).single();
  
  if (error || !data) return { success: false, data: null };
  
  // Decrypt only Meta tokens
  if (data.meta_verify_token) data.meta_verify_token = decryptSecret(data.meta_verify_token);
  if (data.meta_app_secret) data.meta_app_secret = decryptSecret(data.meta_app_secret);
  if (data.meta_access_token) data.meta_access_token = decryptSecret(data.meta_access_token);
  // gemini_api_key and openai_api_key are plain text — no decryption needed
  
  return { success: true, data };
}
