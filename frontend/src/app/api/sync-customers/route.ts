import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // 1. Get Meta Page Access Token
    const { data: metaSettings } = await supabase.from("business_settings").select("meta_access_token").limit(1).single();
    if (!metaSettings?.meta_access_token) {
      return NextResponse.json({ error: "No meta_access_token found" }, { status: 400 });
    }
    const token = metaSettings.meta_access_token;

    // 2. Get all customers from messenger/instagram
    const { data: customers } = await supabase
      .from("customers")
      .select("*")
      .in("platform", ["messenger", "instagram"]);

    if (!customers) return NextResponse.json({ success: true, count: 0 });

    // 3. Sync each customer
    const fetchPromises = customers.map(async (c) => {
      try {
        const res = await fetch(`https://graph.facebook.com/v19.0/${c.platform_id}?fields=first_name,last_name,profile_pic,name&access_token=${token}`);
        if (res.ok) {
          const data = await res.json();
          const updates: any = {};
          
          if (data.profile_pic) {
            updates.profile_pic = data.profile_pic;
          }
          
          if (data.first_name || data.last_name || data.name) {
            updates.name = data.name || [data.first_name, data.last_name].filter(Boolean).join(" ");
          }

          if (Object.keys(updates).length > 0) {
            await supabase.from("customers").update(updates).eq("id", c.id);
            return { success: true };
          }
        } else {
            const errText = await res.text();
            return { error: errText, id: c.platform_id };
        }
      } catch (e: any) {
        return { error: e.message, id: c.platform_id };
      }
      return { skipped: true };
    });

    const results = await Promise.all(fetchPromises);
    const updatedCount = results.filter(r => r.success).length;
    const errors = results.filter(r => r.error);

    return NextResponse.json({ success: true, updatedCount, errors });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
