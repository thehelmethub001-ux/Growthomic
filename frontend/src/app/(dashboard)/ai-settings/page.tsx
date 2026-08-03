"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, pageWrap, pageTitle, pageSubtitle, pageHeader, inputStyle, btnPrimary, skeletonStyle } from "@/lib/styles";
import { Bot, Save, CheckCircle2, AlertCircle, Zap, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

type Settings = {
  id:string; business_name:string; description:string|null;
  ai_reply_mode:string; reply_language:string; reply_tone:string;
  follow_up_enabled:boolean; follow_up_delay_minutes:number;
  restricted_topics:string[];
  custom_prompt?:string|null;
  gemini_api_key?:string|null;
  openai_api_key?:string|null;
  meta_verify_token?:string|null;
  meta_app_secret?:string|null;
  meta_access_token?:string|null;
};

const LBL: React.CSSProperties = {
  display:"block", fontSize:10, fontWeight:700, color:C.textMuted,
  textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:7,
};

const CARD: React.CSSProperties = {
  background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:24,
};

export default function AISettingsPage() {
  const [settings, setSettings] = useState<Settings|null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("business_settings").select("*").limit(1).single();
      if (data && !error) {
        setSettings(data as Settings);
      } else {
        setSettings({ id:"1", business_name:"Growthomic", description:"", ai_reply_mode:"full_auto", reply_language:"bn", reply_tone:"friendly", follow_up_enabled:true, follow_up_delay_minutes:60, restricted_topics:[] });
      }
    } catch {
      setSettings({ id:"1", business_name:"Growthomic", description:"", ai_reply_mode:"full_auto", reply_language:"bn", reply_tone:"friendly", follow_up_enabled:true, follow_up_delay_minutes:60, restricted_topics:[] });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase.from("business_settings").update(settings).eq("id", settings.id);
    setSaving(false);
    if (!error) toast.success("Settings saved successfully!");
    else toast.error("Failed to save settings");
  };

  if (loading) return (
    <div style={{ ...pageWrap }}>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        {[...Array(3)].map((_,i) => <div key={i} style={{ ...skeletonStyle, height:140 }}/>)}
      </div>
    </div>
  );

  if (!settings) return <div style={{ padding:32, color:C.textMuted }}>No settings found. Please run migrations first.</div>;

  return (
    <div style={{ ...pageWrap, maxWidth:800 }}>
      <div style={pageHeader}>
        <div>
          <h1 style={pageTitle}>AI Settings</h1>
          <p style={pageSubtitle}>Configure your agent's persona, behavior, and compliance rules</p>
        </div>
        <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} onClick={handleSave} disabled={saving} style={btnPrimary}>
          {saving ? <><RefreshCw size={14} style={{animation:"spin 0.7s linear infinite"}}/> Saving...</>
           : <><Save size={14}/> Save Changes</>}
        </motion.button>
      </div>

      <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{staggerChildren:0.1}} style={{ display:"flex", flexDirection:"column", gap:16 }}>

        {/* Agent Identity */}
        <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} style={CARD}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:22 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:"hsla(262,83%,58%,0.1)", border:"1px solid hsla(262,83%,58%,0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Bot size={19} color="var(--primary-light)"/>
            </div>
            <div>
              <h2 style={{ fontSize:14, fontWeight:700, color:C.textPrimary, letterSpacing:"-0.02em" }}>Agent Identity</h2>
              <p style={{ fontSize:12, color:C.textMuted, marginTop:2 }}>How the AI presents itself to customers</p>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div style={{ gridColumn:"1 / -1" }}>
              <label style={LBL}>Business Name</label>
              <input style={inputStyle} value={settings.business_name} onChange={e=>setSettings({...settings,business_name:e.target.value})} placeholder="Your business name"/>
            </div>
            <div>
              <label style={LBL}>Reply Mode</label>
              <select style={inputStyle} value={settings.ai_reply_mode} onChange={e=>setSettings({...settings,ai_reply_mode:e.target.value})}>
                <option value="full_auto">Full Auto</option>
                <option value="suggestive">Suggestive (Drafts)</option>
                <option value="hybrid">Hybrid</option>
                <option value="off">Off (Manual Only)</option>
              </select>
            </div>
            <div>
              <label style={LBL}>Reply Tone</label>
              <select style={inputStyle} value={settings.reply_tone} onChange={e=>setSettings({...settings,reply_tone:e.target.value})}>
                <option value="friendly">Friendly</option>
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
              </select>
            </div>
            <div style={{ gridColumn:"1 / -1" }}>
              <label style={LBL}>Business Description</label>
              <textarea style={{...inputStyle, minHeight:80, resize:"vertical"}} value={settings.description||""} onChange={e=>setSettings({...settings,description:e.target.value})} placeholder="Briefly describe your business and products..."/>
            </div>

            <div style={{ gridColumn:"1 / -1" }}>
              <label style={LBL}>Custom Agent Persona & Rules (Optional)</label>
              <textarea style={{...inputStyle, minHeight:120, resize:"vertical", fontFamily:"monospace", fontSize:13}} value={settings.custom_prompt||""} onChange={e=>setSettings({...settings,custom_prompt:e.target.value})} placeholder="e.g. Always call the customer 'bhaiya' or 'apu', be very polite, use emojis, and talk like a friendly human..."/>
              <p style={{ fontSize:11, color:C.textMuted, marginTop:6 }}>These instructions will be injected directly into the AI's core engine to shape its personality.</p>
            </div>
          </div>
        </motion.div>

        {/* API Keys & Models */}
        <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.04}} style={CARD}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:22 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:"hsla(150,80%,40%,0.1)", border:"1px solid hsla(150,80%,40%,0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <CheckCircle2 size={19} color="hsl(150,80%,40%)"/>
            </div>
            <div>
              <h2 style={{ fontSize:14, fontWeight:700, color:C.textPrimary, letterSpacing:"-0.02em" }}>API Keys & Models</h2>
              <p style={{ fontSize:12, color:C.textMuted, marginTop:2 }}>Configure Gemini (Primary) and GPT-4o-mini (Fallback)</p>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:16 }}>
            <div>
              <label style={LBL}>Gemini API Key (Primary)</label>
              <input type="password" style={{...inputStyle, fontFamily:"monospace"}} value={settings.gemini_api_key||""} onChange={e=>setSettings({...settings,gemini_api_key:e.target.value})} placeholder="AIzaSy..."/>
              <p style={{ fontSize:11, color:C.textMuted, marginTop:6 }}>Used for standard queries (Gemini 2.5 Flash / 1.5 Flash)</p>
            </div>
            <div>
              <label style={LBL}>OpenAI API Key (Fallback & Embeddings)</label>
              <input type="password" style={{...inputStyle, fontFamily:"monospace"}} value={settings.openai_api_key||""} onChange={e=>setSettings({...settings,openai_api_key:e.target.value})} placeholder="sk-..."/>
              <p style={{ fontSize:11, color:C.textMuted, marginTop:6 }}>Used if Gemini goes down, and for vector embeddings (text-embedding-3-small)</p>
            </div>
          </div>
        </motion.div>

        {/* Follow-up Engine */}
        <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.08}} style={CARD}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:22 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:"hsla(190,85%,50%,0.1)", border:"1px solid hsla(190,85%,50%,0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Zap size={19} color="hsl(190,85%,60%)"/>
            </div>
            <div>
              <h2 style={{ fontSize:14, fontWeight:700, color:C.textPrimary, letterSpacing:"-0.02em" }}>Follow-up Engine</h2>
              <p style={{ fontSize:12, color:C.textMuted, marginTop:2 }}>Automatically re-engage customers who go quiet</p>
            </div>
          </div>

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", background:C.elevated, borderRadius:12, border:`1px solid ${C.borderWhite}`, marginBottom:16 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:C.textPrimary }}>Enable Automatic Follow-ups</div>
              <div style={{ fontSize:11, color:C.textMuted, marginTop:3 }}>1 follow-up per customer per day maximum</div>
            </div>
            <button onClick={()=>setSettings({...settings,follow_up_enabled:!settings.follow_up_enabled})} style={{
              width:44, height:24, borderRadius:12, border:"none", cursor:"pointer",
              background: settings.follow_up_enabled ? "var(--primary)" : C.overlay,
              position:"relative", transition:"background 0.2s", flexShrink:0,
            }}>
              <div style={{
                position:"absolute", top:3, left: settings.follow_up_enabled ? 23 : 3,
                width:18, height:18, borderRadius:"50%", background:"#fff",
                transition:"left 0.2s", boxShadow:"0 1px 4px rgba(0,0,0,0.3)",
              }}/>
            </button>
          </div>

          {settings.follow_up_enabled && (
            <div style={{ maxWidth:180 }}>
              <label style={LBL}>Delay (Minutes)</label>
              <input style={inputStyle} type="number" min={1} value={settings.follow_up_delay_minutes} onChange={e=>setSettings({...settings,follow_up_delay_minutes:parseInt(e.target.value)||60})}/>
            </div>
          )}
        </motion.div>

        {/* Meta Compliance */}
        <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.16}} style={{...CARD, border:"1px solid hsla(38,90%,55%,0.2)"}}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:22 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:"hsla(38,90%,55%,0.1)", border:"1px solid hsla(38,90%,55%,0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <AlertCircle size={19} color="hsl(38,90%,65%)"/>
            </div>
            <div style={{ flex:1 }}>
              <h2 style={{ fontSize:14, fontWeight:700, color:C.textPrimary, letterSpacing:"-0.02em" }}>Meta WhatsApp Compliance</h2>
              <p style={{ fontSize:12, color:C.textMuted, marginTop:2 }}>Required to comply with Meta's January 2026 AI policy</p>
            </div>
            <span className="badge badge-amber">Policy Active</span>
          </div>

          <div style={{ padding:"11px 14px", background:"hsla(38,90%,55%,0.07)", borderRadius:10, border:"1px solid hsla(38,90%,55%,0.15)", marginBottom:16, fontSize:12, color:"hsl(38,90%,65%)", lineHeight:1.65 }}>
            The AI is hard-coded to decline all off-topic questions (politics, general knowledge, personal info) and redirect customers to your products.
          </div>

          <div>
            <label style={LBL}>Additional Blocked Topics</label>
            <input style={inputStyle} value={(settings.restricted_topics||[]).join(", ")} onChange={e=>setSettings({...settings,restricted_topics:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})} placeholder="e.g. Competitor Brand, Discount codes"/>
            <p style={{ fontSize:11, color:C.textMuted, marginTop:7 }}>Comma-separated. The AI will politely decline these topics.</p>
          </div>
        </motion.div>
        {/* Meta App Configuration */}
        <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.4}} style={{...CARD, borderColor: "rgba(245, 158, 11, 0.2)"}}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:22 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:"rgba(245, 158, 11, 0.1)", border:"1px solid rgba(245, 158, 11, 0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Zap size={19} color="#f59e0b"/>
            </div>
            <div>
              <h2 style={{ fontSize:14, fontWeight:700, color:C.textPrimary, letterSpacing:"-0.02em" }}>Meta Developer App (Facebook / Instagram)</h2>
              <p style={{ fontSize:12, color:C.textMuted, marginTop:2 }}>Connect your page to Growthomic to receive messages via Webhook.</p>
            </div>
          </div>
          
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ background: C.surface, padding: 16, borderRadius: 12, border: `1px solid rgba(255,255,255,0.05)`, fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
              <strong>Webhook Callback URL:</strong><br/>
              <code style={{ background: "rgba(0,0,0,0.3)", padding: "4px 8px", borderRadius: 6, display: "inline-block", marginTop: 4, marginBottom: 8, color: "#34d399", userSelect: "all" }}>
                https://pfzsursjuchrgawzsluu.supabase.co/functions/v1/webhook-meta?platform=facebook
              </code><br/>
              Copy this URL and paste it into your Meta App's Webhook settings.
            </div>

            <div>
              <label style={LBL}>Verify Token (For Webhook Setup)</label>
              <input style={inputStyle} value={settings.meta_verify_token||""} onChange={e=>setSettings({...settings,meta_verify_token:e.target.value})} placeholder="e.g. growthomic_secret_token_123"/>
            </div>
            
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div>
                <label style={LBL}>App Secret (For Security Verification)</label>
                <input type="password" style={inputStyle} value={settings.meta_app_secret||""} onChange={e=>setSettings({...settings,meta_app_secret:e.target.value})} placeholder="Your Meta App Secret"/>
              </div>
              <div>
                <label style={LBL}>Page Access Token (For Sending Replies)</label>
                <input type="password" style={inputStyle} value={settings.meta_access_token||""} onChange={e=>setSettings({...settings,meta_access_token:e.target.value})} placeholder="EAA..."/>
              </div>
            </div>
          </div>
        </motion.div>

        {/* WooCommerce Sync */}
        <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.4}} style={CARD}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:22 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:"hsla(280,80%,60%,0.1)", border:"1px solid hsla(280,80%,60%,0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <RefreshCw size={19} color="hsl(280,80%,65%)"/>
            </div>
            <div style={{ flex:1 }}>
              <h2 style={{ fontSize:14, fontWeight:700, color:C.textPrimary, letterSpacing:"-0.02em" }}>WooCommerce Knowledge Base</h2>
              <p style={{ fontSize:12, color:C.textMuted, marginTop:2 }}>Keep the AI updated with your latest products, inventory, and prices.</p>
            </div>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", background:C.elevated, borderRadius:12, border:`1px solid ${C.borderWhite}` }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:C.textPrimary }}>Manual Product Sync</div>
              <div style={{ fontSize:11, color:C.textMuted, marginTop:3 }}>Fetch products and rebuild AI vector embeddings.</div>
            </div>
            <button 
              onClick={async () => {
                const toastId = toast.loading("Syncing products from WooCommerce...");
                try {
                  const res = await fetch("/api/woo-sync", { method: "POST" });
                  const data = await res.json();
                  if (data.success) {
                    toast.success(`Successfully synced ${data.count} products!`, { id: toastId });
                  } else {
                    toast.error(data.error || "Failed to sync products", { id: toastId });
                  }
                } catch (err) {
                  toast.error("Network error during sync", { id: toastId });
                }
              }}
              style={{ padding:"8px 16px", borderRadius:8, background:"var(--primary)", color:"#fff", border:"none", fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}
            >
              Sync Now
            </button>
          </div>
        </motion.div>

      </motion.div>
    </div>
  );
}
