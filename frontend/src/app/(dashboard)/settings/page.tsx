"use client";
import { useState, useEffect } from "react";
import { C, pageWrap, pageTitle, pageSubtitle, pageHeader, btnPrimary, btnSecondary, inputStyle } from "@/lib/styles";
import { Globe, Smartphone, MessageCircle, ShoppingBag, Key, Save, Copy, CheckCheck } from "lucide-react";
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
  const [sheetUrl, setSheetUrl] = useState("");
  
  const sb = createClient();
  const webhookUrl = "https://your-project-id.supabase.co/functions/v1/webhook-meta";

  useEffect(() => {
    async function load() {
      const { data } = await sb.from("business_settings").select("*").limit(1).single();
      if (data) {
        setWooUrl(data.woo_api_url || "");
        setWooKey(data.woo_consumer_key || "");
        setWooSecret(data.woo_consumer_secret || "");
        setSheetUrl(data.google_sheets_webhook_url || "");
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
        google_sheets_webhook_url: sheetUrl,
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
        <button style={btnPrimary} onClick={handleSave} disabled={saving || loading}>
          {saving ? "Saving..." : <><Save size={15}/> Save Config</>}
        </button>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
        
        {/* Google Sheets */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:20, padding:28, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:0, left:0, bottom:0, width:4, background:"#34a853" }}/>
          
          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:24, paddingLeft:8 }}>
            <div style={{ width:38, height:38, borderRadius:12, background:"rgba(52,168,83,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Globe size={20} color="#34a853"/>
            </div>
            <div>
              <h2 style={{ fontSize:16, fontWeight:800, color:C.textPrimary }}>Google Sheets Backup</h2>
              <p style={{ fontSize:12, color:C.textMuted, marginTop:2, fontWeight:500 }}>Log all confirmed orders to a Google Sheet via Webhook</p>
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:16, paddingLeft:8 }}>
            <div>
              <label style={{ display:"block", fontSize:10, fontWeight:800, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Google Sheets Webhook URL (Make.com, Zapier, Apps Script)</label>
              <input style={inputStyle} value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" type="url"/>
            </div>
          </div>
        </div>

        {/* WooCommerce */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:20, padding:28, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:0, left:0, bottom:0, width:4, background:C.brand }}/>
          
          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:24, paddingLeft:8 }}>
            <div style={{ width:38, height:38, borderRadius:12, background:"rgba(139,92,246,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <ShoppingBag size={20} color={C.brandLight}/>
            </div>
            <div>
              <h2 style={{ fontSize:16, fontWeight:800, color:C.textPrimary }}>WooCommerce Sync</h2>
              <p style={{ fontSize:12, color:C.textMuted, marginTop:2, fontWeight:500 }}>Orders pushed automatically after confirmation</p>
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:16, paddingLeft:8 }}>
            <div>
              <label style={{ display:"block", fontSize:10, fontWeight:800, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Store URL</label>
              <input style={inputStyle} value={wooUrl} onChange={e => setWooUrl(e.target.value)} placeholder="https://your-store.com" type="url"/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div>
                <label style={{ display:"block", fontSize:10, fontWeight:800, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Consumer Key</label>
                <input style={inputStyle} value={wooKey} onChange={e => setWooKey(e.target.value)} placeholder="ck_••••••••••••••••" type="password"/>
              </div>
              <div>
                <label style={{ display:"block", fontSize:10, fontWeight:800, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Consumer Secret</label>
                <input style={inputStyle} value={wooSecret} onChange={e => setWooSecret(e.target.value)} placeholder="cs_••••••••••••••••" type="password"/>
              </div>
            </div>
          </div>
        </div>

        {/* Edge Function Secrets */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:20, padding:28, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:0, left:0, bottom:0, width:4, background:"#f59e0b" }}/>
          
          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20, paddingLeft:8 }}>
            <div style={{ width:38, height:38, borderRadius:12, background:"rgba(245,158,11,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Key size={20} color="#fbbf24"/>
            </div>
            <div>
              <h2 style={{ fontSize:16, fontWeight:800, color:C.textPrimary }}>Edge Function Secrets</h2>
              <p style={{ fontSize:12, color:C.textMuted, marginTop:2, fontWeight:500 }}>Set via Supabase CLI — not stored in this dashboard</p>
            </div>
          </div>

          <div style={{ marginLeft:8, background:C.elevated, borderRadius:12, padding:"18px 22px", border:`1px solid ${C.borderWhite}`, fontFamily:"monospace", fontSize:13, color:C.textSecondary, lineHeight:1.8 }}>
            <div><span style={{opacity:0.5}}>supabase secrets set </span><span style={{color:C.brandLight,fontWeight:700}}>GEMINI_API_KEY</span>=xxx</div>
            <div><span style={{opacity:0.5}}>supabase secrets set </span><span style={{color:C.brandLight,fontWeight:700}}>OPENAI_API_KEY</span>=xxx</div>
            <div><span style={{opacity:0.5}}>supabase secrets set </span><span style={{color:C.brandLight,fontWeight:700}}>UPSTASH_REDIS_REST_URL</span>=xxx</div>
            <div><span style={{opacity:0.5}}>supabase secrets set </span><span style={{color:C.brandLight,fontWeight:700}}>QSTASH_TOKEN</span>=xxx</div>
            <div><span style={{opacity:0.5}}>supabase secrets set </span><span style={{color:C.brandLight,fontWeight:700}}>META_APP_SECRET</span>=xxx</div>
          </div>
        </div>

      </div>
    </div>
  );
}
