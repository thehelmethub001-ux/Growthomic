"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const S = {
  wrap:    { maxWidth: 860, margin: "0 auto", padding: "24px 24px 64px" } as React.CSSProperties,
  card:    { background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 12, padding: 24, marginBottom: 16 } as React.CSSProperties,
  label:   { display: "block", fontSize: 11, fontWeight: 600, color: "#cbc3d7", marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.04em" },
  input:   { width: "100%", background: "#201f1f", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 4, padding: "9px 12px", color: "#e5e2e1", fontSize: 13, fontFamily: "inherit", outline: "none" } as React.CSSProperties,
};

export default function SettingsPage() {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wooUrl, setWooUrl] = useState("");
  const [wooKey, setWooKey] = useState("");
  const [wooSecret, setWooSecret] = useState("");
  const sb = createClient();
  const webhookUrl = "https://your-project-id.supabase.co/functions/v1/webhook-meta";

  useEffect(() => {
    async function load() {
      const { data } = await sb.from("business_settings").select("*").limit(1).single();
      if (data) { setWooUrl(data.woo_api_url || ""); setWooKey(data.woo_consumer_key || ""); setWooSecret(data.woo_consumer_secret || ""); }
      setLoading(false);
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { data: existing } = await sb.from("business_settings").select("id").limit(1).single();
    if (existing) {
      const { error } = await sb.from("business_settings").update({ woo_api_url: wooUrl, woo_consumer_key: wooKey, woo_consumer_secret: wooSecret }).eq("id", existing.id);
      if (error) toast.error("Failed to save settings"); else toast.success("Settings saved!");
    }
    setSaving(false);
  };

  const copyWebhook = () => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid rgba(73,68,84,0.3)" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.025em", fontFamily: "Geist, system-ui" }}>Platform Settings</h1>
          <p style={{ fontSize: 13, color: "#958ea0", marginTop: 4 }}>Configure API keys and webhook connections</p>
        </div>
        <button
          onClick={handleSave} disabled={saving || loading}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 4, background: "#a078ff", color: "#340080", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
          {saving ? "Saving..." : "Save Config"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* WooCommerce */}
        <div style={{ ...S.card, borderLeft: "3px solid #a078ff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: "#201f1f", border: "1px solid rgba(73,68,84,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#d0bcff" }}>shopping_bag</span>
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e2e1" }}>WooCommerce Sync</h2>
              <p style={{ fontSize: 12, color: "#958ea0", marginTop: 2 }}>Orders pushed automatically after confirmation</p>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={S.label}>Store URL</label>
              <input style={S.input} value={wooUrl} onChange={e => setWooUrl(e.target.value)} placeholder="https://your-store.com" type="url" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={S.label}>Consumer Key</label>
                <input style={S.input} value={wooKey} onChange={e => setWooKey(e.target.value)} placeholder="ck_••••••••••••••••" type="password" />
              </div>
              <div>
                <label style={S.label}>Consumer Secret</label>
                <input style={S.input} value={wooSecret} onChange={e => setWooSecret(e.target.value)} placeholder="cs_••••••••••••••••" type="password" />
              </div>
            </div>
          </div>
        </div>

        {/* Webhook */}
        <div style={{ ...S.card, borderLeft: "3px solid #ffb869" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: "#201f1f", border: "1px solid rgba(73,68,84,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#ffb869" }}>webhook</span>
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e2e1" }}>Meta Webhook URL</h2>
              <p style={{ fontSize: 12, color: "#958ea0", marginTop: 2 }}>Configure this in Facebook App settings to receive messages</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <input readOnly value={webhookUrl} style={{ ...S.input, fontFamily: "monospace", fontSize: 12, color: "#cbc3d7" }} />
            <button onClick={copyWebhook} style={{ padding: "9px 14px", borderRadius: 4, background: "#201f1f", border: "1px solid rgba(73,68,84,0.4)", color: copied ? "#4ade80" : "#cbc3d7", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, whiteSpace: "nowrap" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{copied ? "check_circle" : "content_copy"}</span>
              {copied ? "Copied!" : "Copy URL"}
            </button>
          </div>
        </div>

        {/* Integration Status */}
        <div style={S.card}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e2e1", marginBottom: 16 }}>Integration Status</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { icon: "chat",         label: "WhatsApp Business",    status: "Connected",     ok: true  },
              { icon: "forum",        label: "Facebook Messenger",   status: "Connected",     ok: true  },
              { icon: "photo_camera", label: "Instagram Direct",     status: "Connected",     ok: true  },
              { icon: "shopping_bag", label: "WooCommerce Orders",   status: wooUrl ? "Configured" : "Not configured", ok: !!wooUrl },
            ].map(({ icon, label, status, ok }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#201f1f", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#958ea0" }}>{icon}</span>
                  <span style={{ fontSize: 13, color: "#e5e2e1" }}>{label}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 10px", borderRadius: 100, background: ok ? "rgba(34,197,94,0.1)" : "rgba(73,68,84,0.2)", color: ok ? "#4ade80" : "#958ea0", border: `1px solid ${ok ? "rgba(34,197,94,0.2)" : "rgba(73,68,84,0.3)"}` }}>
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
