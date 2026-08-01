import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/encryption";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // 1. Get Meta Page Access Token
    const { data: metaSettings } = await supabase.from("business_settings").select("meta_access_token").limit(1).single();
    let token = metaSettings?.meta_access_token || process.env.META_PAGE_ACCESS_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "No meta_access_token found" }, { status: 400 });
    }
    if (token.includes(":")) {
      try {
        token = decryptSecret(token);
      } catch (err) {
        console.error("Failed to decrypt meta_access_token:", err);
      }
    }

    // 2. Get all customers from messenger/instagram
    const { data: customers } = await supabase
      .from("customers")
      .select("*")
      .in("platform", ["messenger", "instagram"]);

    if (!customers) return NextResponse.json({ success: true, count: 0 });

    // 3. Sync each customer
    const fetchPromises = customers.map(async (c) => {
      try {
        // Skip dummy / non-numeric IDs
        if (!c.platform_id || isNaN(Number(c.platform_id))) {
          return { skipped: true, id: c.platform_id };
        }

        const fields = c.platform === "messenger" ? "first_name,last_name,profile_pic" : "name,username,profile_picture_url";
        let res = await fetch(`https://graph.facebook.com/v19.0/${c.platform_id}?fields=${fields}&access_token=${token}`);
        
        if (!res.ok && c.platform === "messenger") {
          res = await fetch(`https://graph.facebook.com/v19.0/${c.platform_id}?fields=first_name,last_name&access_token=${token}`);
        }

        if (res.ok) {
          const data = await res.json();
          const updates: any = {};
          
          const profilePic = data.profile_pic || data.profile_picture_url;
          if (profilePic) {
            updates.profile_pic = profilePic;
          }
          
          const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ") || data.name || data.username;
          if (fullName) {
            updates.name = fullName;
          }

          if (Object.keys(updates).length > 0) {
            await supabase.from("customers").update(updates).eq("id", c.id);
            return { success: true, id: c.platform_id, name: fullName };
          }
        } else {
          const errText = await res.text();
          console.error(`Meta Graph API error for customer ${c.platform_id}:`, errText);
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
