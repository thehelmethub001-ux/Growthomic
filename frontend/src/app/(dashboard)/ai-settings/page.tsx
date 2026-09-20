"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

type Settings = {
  id: string;
  business_name: string;
  description: string | null;
  ai_reply_mode: string;
  reply_language: string;
  reply_tone: string;
  follow_up_enabled: boolean;
  follow_up_delay_minutes: number;
  restricted_topics: string[];
  custom_prompt?: string | null;
  gemini_api_key?: string | null;
  openai_api_key?: string | null;
  meta_verify_token?: string | null;
  meta_app_secret?: string | null;
  meta_access_token?: string | null;
};

export default function AISettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoConfirmOrders, setAutoConfirmOrders] = useState(true);
  const [sendReceipt, setSendReceipt] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(85);
  const [maxAutoOrderValue, setMaxAutoOrderValue] = useState("5,000");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("business_settings").select("*").limit(1).single();
      if (data && !error) {
        setSettings(data as Settings);
      } else {
        setSettings({
          id: "1",
          business_name: "Helmet Shop BD",
          description: "Premium motorcycle helmets and riding gear store in Dhaka.",
          ai_reply_mode: "full_auto",
          reply_language: "auto",
          reply_tone: "friendly",
          follow_up_enabled: true,
          follow_up_delay_minutes: 60,
          restricted_topics: ["politics", "competitor wholesale"],
          custom_prompt:
            "You are an expert sales assistant for Helmet Shop BD. Assist customers politely, confirm helmet sizes (M, L, XL), offer visor add-ons, and process delivery in Dhaka with Pathao / Steadfast COD. Never promise discounts above 10% without supervisor approval.",
        });
      }
    } catch {
      setSettings({
        id: "1",
        business_name: "Helmet Shop BD",
        description: "Premium motorcycle helmets and riding gear store in Dhaka.",
        ai_reply_mode: "full_auto",
        reply_language: "auto",
        reply_tone: "friendly",
        follow_up_enabled: true,
        follow_up_delay_minutes: 60,
        restricted_topics: ["politics", "competitor wholesale"],
        custom_prompt:
          "You are an expert sales assistant for Helmet Shop BD. Assist customers politely, confirm helmet sizes (M, L, XL), offer visor add-ons, and process delivery in Dhaka with Pathao / Steadfast COD. Never promise discounts above 10% without supervisor approval.",
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase.from("business_settings").update(settings).eq("id", settings.id);
    setSaving(false);
    if (!error) toast.success("AI Configuration saved successfully!");
    else toast.error("Failed to save settings");
  };

  const injectVariable = (variable: string) => {
    if (!settings) return;
    const current = settings.custom_prompt || "";
    setSettings({ ...settings, custom_prompt: `${current} ${variable}` });
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px 64px", display: "flex", flexDirection: "column", gap: 16 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ height: 160, background: "#1c1b1b", borderRadius: 10, border: "1px solid rgba(73,68,84,0.2)" }} />
        ))}
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px 80px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header Section */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", borderBottom: "1px solid rgba(73,68,84,0.3)", paddingBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.025em", fontFamily: "Geist, system-ui", margin: 0 }}>
              AI Settings
            </h1>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#d0bcff", background: "rgba(160,120,255,0.12)", border: "1px solid rgba(160,120,255,0.3)", padding: "2px 8px", borderRadius: 100 }}>
              Agent #04 • v2.4
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#958ea0", marginTop: 4, margin: 0 }}>
            Configure how the autonomous AI sales agent interacts with buyers and handles orders
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#958ea0" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80" }} />
            <span>Agent: Active</span>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 18px",
              background: "#a078ff",
              border: "none",
              borderRadius: 6,
              color: "#1e005d",
              fontSize: 12,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
            <span>{saving ? "Saving..." : "Save Changes"}</span>
          </button>
        </div>
      </div>

      {/* Settings Cards Stack */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Card 1: AI Reply Mode */}
        <section style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#a078ff" }}>smart_toy</span>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e2e1", margin: 0 }}>AI Reply Mode</h2>
                <p style={{ fontSize: 12, color: "#958ea0", marginTop: 2, margin: 0 }}>
                  Control autonomous message dispatching across connected social and chat platforms
                </p>
              </div>
            </div>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#201f1f", color: "#cbc3d7", border: "1px solid rgba(73,68,84,0.3)" }}>
              Omnichannel
            </span>
          </div>

          {/* 3 Mode Selection Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 10 }}>
            {/* Full Auto */}
            <div
              onClick={() => setSettings({ ...settings, ai_reply_mode: "full_auto" })}
              style={{
                padding: 16,
                borderRadius: 8,
                background: "#131313",
                border: settings.ai_reply_mode === "full_auto" ? "2px solid #a078ff" : "1px solid rgba(73,68,84,0.3)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#e5e2e1" }}>Full Auto</span>
                  {settings.ai_reply_mode === "full_auto" && (
                    <span style={{ fontSize: 10, fontWeight: 600, background: "#a078ff", color: "#1e005d", padding: "1px 6px", borderRadius: 4 }}>Active</span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "#958ea0", lineHeight: 1.4, margin: 0 }}>
                  AI replies automatically to all incoming customer queries across channels.
                </p>
              </div>
              <div style={{ borderTop: "1px solid rgba(73,68,84,0.2)", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: settings.ai_reply_mode === "full_auto" ? "#d0bcff" : "#958ea0" }}>
                <span>Instant dispatch</span>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {settings.ai_reply_mode === "full_auto" ? "check_circle" : "radio_button_unchecked"}
                </span>
              </div>
            </div>

            {/* Draft Mode */}
            <div
              onClick={() => setSettings({ ...settings, ai_reply_mode: "suggestive" })}
              style={{
                padding: 16,
                borderRadius: 8,
                background: "#131313",
                border: settings.ai_reply_mode === "suggestive" ? "2px solid #a078ff" : "1px solid rgba(73,68,84,0.3)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#e5e2e1" }}>Draft Mode</span>
                  {settings.ai_reply_mode === "suggestive" && (
                    <span style={{ fontSize: 10, fontWeight: 600, background: "#a078ff", color: "#1e005d", padding: "1px 6px", borderRadius: 4 }}>Active</span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "#958ea0", lineHeight: 1.4, margin: 0 }}>
                  AI drafts suggested responses, human agent approves before sending.
                </p>
              </div>
              <div style={{ borderTop: "1px solid rgba(73,68,84,0.2)", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: settings.ai_reply_mode === "suggestive" ? "#d0bcff" : "#958ea0" }}>
                <span>Human copilot</span>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {settings.ai_reply_mode === "suggestive" ? "check_circle" : "radio_button_unchecked"}
                </span>
              </div>
            </div>

            {/* Off */}
            <div
              onClick={() => setSettings({ ...settings, ai_reply_mode: "off" })}
              style={{
                padding: 16,
                borderRadius: 8,
                background: "#131313",
                border: settings.ai_reply_mode === "off" ? "2px solid #a078ff" : "1px solid rgba(73,68,84,0.3)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#e5e2e1" }}>Off</span>
                  {settings.ai_reply_mode === "off" && (
                    <span style={{ fontSize: 10, fontWeight: 600, background: "#a078ff", color: "#1e005d", padding: "1px 6px", borderRadius: 4 }}>Active</span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "#958ea0", lineHeight: 1.4, margin: 0 }}>
                  AI disabled completely. All chats route directly to Human Queue.
                </p>
              </div>
              <div style={{ borderTop: "1px solid rgba(73,68,84,0.2)", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: settings.ai_reply_mode === "off" ? "#d0bcff" : "#958ea0" }}>
                <span>Bypassed</span>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {settings.ai_reply_mode === "off" ? "check_circle" : "radio_button_unchecked"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Card 2: Response Language */}
        <section style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#a078ff" }}>translate</span>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e2e1", margin: 0 }}>Response Language</h2>
              </div>
              <p style={{ fontSize: 12, color: "#958ea0", marginTop: 2, margin: 0 }}>
                Automatically adapts to buyer vernacular, including phonetic Bangla-English (Banglish)
              </p>
            </div>

            <div style={{ display: "flex", gap: 4, background: "#0e0e0e", padding: 3, borderRadius: 6, border: "1px solid rgba(73,68,84,0.3)" }}>
              {[
                { id: "auto", label: "Auto Detect", rec: true },
                { id: "bn", label: "Bengali (বাংলা)" },
                { id: "en", label: "English" },
                { id: "banglish", label: "Banglish" },
              ].map(l => (
                <button
                  key={l.id}
                  onClick={() => setSettings({ ...settings, reply_language: l.id })}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                    background: settings.reply_language === l.id ? "#201f1f" : "transparent",
                    border: "none",
                    color: settings.reply_language === l.id ? "#e5e2e1" : "#958ea0",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>{l.label}</span>
                  {l.rec && <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: "rgba(160,120,255,0.2)", color: "#d0bcff" }}>Rec</span>}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 14, padding: "10px 14px", background: "#131313", borderRadius: 6, border: "1px solid rgba(73,68,84,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#cbc3d7" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#a078ff" }}>auto_awesome</span>
              <span>Code-switching engine enabled for mixed phrasing (e.g. <i>&ldquo;bhai delivery charge koto?&rdquo;</i>)</span>
            </div>
            <span style={{ fontSize: 11, color: "#d0bcff" }}>LLM Latency: ~140ms</span>
          </div>
        </section>

        {/* Card 3: AI Persona & Tone */}
        <section style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#a078ff" }}>psychology</span>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e2e1", margin: 0 }}>AI Persona &amp; Tone</h2>
              </div>
              <p style={{ fontSize: 12, color: "#958ea0", marginTop: 2, margin: 0 }}>
                Define business boundaries, voice modulation, and prompt engineering parameters
              </p>
            </div>

            <div style={{ display: "flex", gap: 4, background: "#0e0e0e", padding: 3, borderRadius: 6, border: "1px solid rgba(73,68,84,0.3)" }}>
              {["friendly", "professional", "casual", "sales-driven"].map(t => (
                <button
                  key={t}
                  onClick={() => setSettings({ ...settings, reply_tone: t })}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                    background: settings.reply_tone === t ? "#a078ff" : "transparent",
                    color: settings.reply_tone === t ? "#1e005d" : "#958ea0",
                    border: "none",
                    textTransform: "capitalize",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
              <label style={{ color: "#e5e2e1", fontWeight: 500 }}>AI Persona Instructions</label>
              <span style={{ color: "#958ea0", fontSize: 11 }}>{(settings.custom_prompt || "").length} / 2000 chars</span>
            </div>

            <textarea
              value={settings.custom_prompt || ""}
              onChange={e => setSettings({ ...settings, custom_prompt: e.target.value })}
              rows={4}
              style={{
                width: "100%",
                background: "#131313",
                border: "1px solid rgba(73,68,84,0.4)",
                borderRadius: 6,
                padding: "10px 12px",
                color: "#e5e2e1",
                fontSize: 12,
                lineHeight: 1.5,
                outline: "none",
                resize: "vertical",
              }}
            />

            {/* Dynamic Variables */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingTop: 4 }}>
              <span style={{ fontSize: 11, color: "#958ea0" }}>Inject variables:</span>
              {["{customer_name}", "{order_id}", "{store_name}", "{product_sku}"].map(v => (
                <button
                  key={v}
                  onClick={() => injectVariable(v)}
                  style={{
                    padding: "2px 8px",
                    background: "#0e0e0e",
                    border: "1px solid rgba(73,68,84,0.3)",
                    borderRadius: 4,
                    color: "#cbc3d7",
                    fontSize: 11,
                    fontFamily: "monospace",
                    cursor: "pointer",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Card 4: Order Confirmation & Triggers */}
        <section style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#a078ff" }}>shopping_cart_checkout</span>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e2e1", margin: 0 }}>Order Confirmation</h2>
              <p style={{ fontSize: 12, color: "#958ea0", marginTop: 2, margin: 0 }}>
                Configure automated pipeline triggers and digital receipts
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#e5e2e1" }}>Auto-confirm orders without human approval</div>
                <div style={{ fontSize: 11, color: "#958ea0", marginTop: 2 }}>
                  Create and process orders directly in WooCommerce when customer confirms phone & address
                </div>
              </div>
              <button
                onClick={() => setAutoConfirmOrders(!autoConfirmOrders)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: autoConfirmOrders ? "#a078ff" : "#958ea0", display: "flex" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{autoConfirmOrders ? "toggle_on" : "toggle_off"}</span>
              </button>
            </div>

            <div style={{ height: 1, background: "rgba(73,68,84,0.2)" }} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#e5e2e1" }}>Send order summary &amp; receipt to customer</div>
                <div style={{ fontSize: 11, color: "#958ea0", marginTop: 2 }}>
                  Dispatch automated WhatsApp/Messenger invoice receipt with order breakdown
                </div>
              </div>
              <button
                onClick={() => setSendReceipt(!sendReceipt)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: sendReceipt ? "#a078ff" : "#958ea0", display: "flex" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{sendReceipt ? "toggle_on" : "toggle_off"}</span>
              </button>
            </div>
          </div>
        </section>

        {/* Card 5: Thresholds & Escalation */}
        <section style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#a078ff" }}>shield</span>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e2e1", margin: 0 }}>Thresholds &amp; Escalation</h2>
              <p style={{ fontSize: 12, color: "#958ea0", marginTop: 2, margin: 0 }}>
                Safety limits to prevent erroneous automated commitments
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {/* Confidence Slider */}
            <div style={{ background: "#131313", padding: 14, borderRadius: 8, border: "1px solid rgba(73,68,84,0.25)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#e5e2e1", fontWeight: 500 }}>AI Confidence Threshold</span>
                <span style={{ fontSize: 13, color: "#d0bcff", fontWeight: 700 }}>{confidenceThreshold}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="99"
                value={confidenceThreshold}
                onChange={e => setConfidenceThreshold(parseInt(e.target.value))}
                style={{ width: "100%", accentColor: "#a078ff", marginTop: 10 }}
              />
              <span style={{ fontSize: 11, color: "#958ea0", marginTop: 6, display: "block" }}>
                Below this score, conversation immediately escalates to Human Queue
              </span>
            </div>

            {/* Max Order Value */}
            <div style={{ background: "#131313", padding: 14, borderRadius: 8, border: "1px solid rgba(73,68,84,0.25)" }}>
              <label style={{ fontSize: 12, color: "#e5e2e1", fontWeight: 500, display: "block" }}>
                Max order value for auto-confirm
              </label>
              <div style={{ position: "relative", marginTop: 8 }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#958ea0", fontSize: 13 }}>৳</span>
                <input
                  value={maxAutoOrderValue}
                  onChange={e => setMaxAutoOrderValue(e.target.value)}
                  style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "6px 12px 6px 28px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                />
              </div>
              <span style={{ fontSize: 11, color: "#958ea0", marginTop: 6, display: "block" }}>
                Orders above ৳ {maxAutoOrderValue} require manual verification before dispatch
              </span>
            </div>
          </div>
        </section>

        {/* Card 6: Advanced API Keys, Meta Webhook & Credentials (Preserving All Backend Integrations) */}
        <section style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, overflow: "hidden" }}>
          <div
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              background: showAdvanced ? "#131313" : "transparent",
              borderBottom: showAdvanced ? "1px solid rgba(73,68,84,0.2)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#a078ff" }}>vpn_key</span>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#e5e2e1", margin: 0 }}>Advanced API Keys &amp; Webhooks</h3>
                <p style={{ fontSize: 11, color: "#958ea0", marginTop: 2, margin: 0 }}>
                  Gemini API, Meta WhatsApp/Messenger Webhook secrets, and OpenAI fallbacks
                </p>
              </div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#958ea0" }}>
              {showAdvanced ? "expand_less" : "expand_more"}
            </span>
          </div>

          {showAdvanced && (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Meta Webhook URL */}
              <div style={{ background: "#131313", padding: 14, borderRadius: 8, border: "1px solid rgba(73,68,84,0.25)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#e5e2e1" }}>Meta Webhook Callback URL:</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText("https://pfzsursjuchrgawzsluu.supabase.co/functions/v1/webhook-meta?platform=facebook");
                      toast.success("Webhook URL copied to clipboard!");
                    }}
                    style={{ padding: "3px 8px", background: "#201f1f", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 4, color: "#d0bcff", fontSize: 11, cursor: "pointer" }}
                  >
                    Copy URL
                  </button>
                </div>
                <code style={{ background: "#0e0e0e", padding: "6px 10px", borderRadius: 4, display: "block", color: "#d0bcff", fontSize: 11, fontFamily: "monospace", overflowX: "auto" }}>
                  https://pfzsursjuchrgawzsluu.supabase.co/functions/v1/webhook-meta?platform=facebook
                </code>
              </div>

              {/* API Keys Inputs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#958ea0", marginBottom: 4 }}>Gemini API Key (Primary)</label>
                  <input
                    type="password"
                    value={settings.gemini_api_key || ""}
                    onChange={e => setSettings({ ...settings, gemini_api_key: e.target.value })}
                    placeholder="AIzaSy..."
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "7px 10px", color: "#e5e2e1", fontSize: 12, outline: "none", fontFamily: "monospace" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#958ea0", marginBottom: 4 }}>Meta Verify Token</label>
                  <input
                    value={settings.meta_verify_token || ""}
                    onChange={e => setSettings({ ...settings, meta_verify_token: e.target.value })}
                    placeholder="growthomic_secret_token_123"
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "7px 10px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#958ea0", marginBottom: 4 }}>Meta App Secret</label>
                  <input
                    type="password"
                    value={settings.meta_app_secret || ""}
                    onChange={e => setSettings({ ...settings, meta_app_secret: e.target.value })}
                    placeholder="Your Meta App Secret"
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "7px 10px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#958ea0", marginBottom: 4 }}>Meta Page Access Token</label>
                  <input
                    type="password"
                    value={settings.meta_access_token || ""}
                    onChange={e => setSettings({ ...settings, meta_access_token: e.target.value })}
                    placeholder="EAAB..."
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "7px 10px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                  />
                </div>
              </div>

              {/* WooCommerce Sync Action */}
              <div style={{ borderTop: "1px solid rgba(73,68,84,0.2)", paddingTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#e5e2e1" }}>WooCommerce Embeddings Rebuild</div>
                  <div style={{ fontSize: 11, color: "#958ea0" }}>Rebuild vector embeddings for accurate product Q&A</div>
                </div>
                <button
                  onClick={async () => {
                    setSyncing(true);
                    toast.loading("Syncing & vectorizing products...", { id: "sync-ai" });
                    try {
                      const res = await fetch("/api/woo-sync", { method: "POST" });
                      const d = await res.json();
                      if (d.success) toast.success(`Synced ${d.count} products!`, { id: "sync-ai" });
                      else toast.error("Sync failed", { id: "sync-ai" });
                    } catch {
                      toast.error("Network error during sync", { id: "sync-ai" });
                    }
                    setSyncing(false);
                  }}
                  disabled={syncing}
                  style={{
                    padding: "7px 14px",
                    background: "#201f1f",
                    border: "1px solid rgba(73,68,84,0.4)",
                    borderRadius: 6,
                    color: "#e5e2e1",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: syncing ? "not-allowed" : "pointer",
                  }}
                >
                  {syncing ? "Syncing..." : "Sync Knowledge Base"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
