const SUPABASE_URL = "https://pfzsursjuchrgawzsluu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmenN1cnNqdWNocmdhd3pzbHV1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDM3MDg0NSwiZXhwIjoyMDY1OTQ2ODQ1fQ.dYgxo4Q2U7MHEX8_tHZ6mfePiJX7XmEPOxqcBdJoXEM";

async function main() {
  const convId = "c0548afd"; 
  
  // 1. Fetch recent messages
  const res = await fetch(`${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${convId}&order=created_at.desc&limit=30`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`
    }
  });
  
  const msgs = await res.json();
  for (const m of msgs) {
     console.log(`${m.role} [${m.platform_message_id}]: ${m.content || m.media_url}`);
  }
}

main();
