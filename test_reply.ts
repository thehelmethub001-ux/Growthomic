import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://pfzsursjuchrgawzsluu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmenN1cnNqdWNocmdhd3pzbHV1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDM3MDg0NSwiZXhwIjoyMDY1OTQ2ODQ1fQ.dYgxo4Q2U7MHEX8_tHZ6mfePiJX7XmEPOxqcBdJoXEM";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const convId = "c0548afd"; // from user's bug report
  
  // 1. Let's find a recent multi-image batch from this conversation.
  const { data: msgs, error } = await supabase.from('messages')
    .select('id, role, content, platform_message_id, media_url, created_at')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: false })
    .limit(30);
    
  if (error) {
    console.error(error);
    return;
  }
  
  // Print them for analysis
  for (const m of msgs) {
     console.log(`${m.role} [${m.platform_message_id}]: ${m.content || m.media_url}`);
  }
}

main();
