"use client";
import { useState, useEffect } from "react";
import { pageWrap, pageTitle, pageSubtitle, pageHeader, btnPrimary, btnSecondary, inputStyle } from "@/lib/styles";
import { Globe, Smartphone, MessageCircle, ShoppingBag, Save, Copy, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export default function SettingsPage() {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // States for WooCommerce and Webhooks
  const [wooUrl, setWooUrl] = useState("");
  const [wooKey, setWooKey] = useState("");
  const [wooSecret, setWooSecret] = useState("");
  
  const sb = createClient();
  const webhookUrl = "https://your-project-id.supabase.co/functions/v1/webhook-meta";

  useEffect(() => {
    async function load() {
      const { data } = await sb.from("business_settings").select("*").limit(1).single();
      if (data) {
        setWooUrl(data.woo_api_url || "");
        setWooKey(data.woo_consumer_key || "");
        setWooSecret(data.woo_consumer_secret || "");
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { data: existing } = await sb.from("business_settings").select("id").limit(1).single();
    
    if (existing) {
      const { error } = await sb.from("business_settings").update({
        woo_api_url: wooUrl,
        woo_consumer_key: wooKey,
        woo_consumer_secret: wooSecret,
      }).eq("id", existing.id);
      if (error) toast.error("Failed to save settings");
      else toast.success("Settings saved!");
    }
    setSaving(false);
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ ...pageWrap, maxWidth:860 }}>
      {/* Header */}
      <div style={pageHeader}>
        <div>
          <h1 style={pageTitle}>Platform Settings</h1>
          <p style={pageSubtitle}>Configure API keys and webhook connections</p>
        </div>
        <button style={{...btnPrimary, display:"flex", gap:6}} onClick={handleSave} disabled={saving || loading}>
          {saving ? "Saving..." : <><Save size={14}/> Save Config</>}
        </button>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

        {/* WooCommerce */}
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--r-lg)", padding:24, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:0, left:0, bottom:0, width:4, background:"var(--text-primary)" }}/>
          
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24, paddingLeft:4 }}>
            <div style={{ width:38, height:38, borderRadius:"var(--r-md)", background:"var(--bg-elevated)", border:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <ShoppingBag size={18} color="var(--text-primary)"/>
            </div>
            <div>
              <h2 style={{ fontSize:15, fontWeight:600, color:"var(--text-primary)", letterSpacing:"-0.01em" }}>WooCommerce Sync</h2>
              <p style={{ fontSize:12, color:"var(--text-muted)", marginTop:2 }}>Orders pushed automatically after confirmation</p>
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:16, paddingLeft:4 }}>
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:8 }}>Store URL</label>
              <input style={inputStyle} value={wooUrl} onChange={e => setWooUrl(e.target.value)} placeholder="https://your-store.com" type="url"/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:8 }}>Consumer Key</label>
                <input style={inputStyle} value={wooKey} onChange={e => setWooKey(e.target.value)} placeholder="ck_••••••••••••••••" type="password"/>
              </div>
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:8 }}>Consumer Secret</label>
                <input style={inputStyle} value={wooSecret} onChange={e => setWooSecret(e.target.value)} placeholder="cs_••••••••••••••••" type="password"/>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
