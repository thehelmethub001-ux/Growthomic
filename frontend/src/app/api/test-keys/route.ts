import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data } = await supabase.from("business_settings").select("gemini_api_key, openai_api_key").limit(1).single();
  
  return NextResponse.json({ 
    hasGemini: !!data?.gemini_api_key, 
    hasOpenAI: !!data?.openai_api_key 
  });
}
