"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"profile" | "woo" | "platforms" | "delivery">("profile");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [businessName, setBusinessName] = useState("Helmet Shop BD");
  const [phone, setPhone] = useState("+880 1711-234567");
  const [email, setEmail] = useState("support@helmetshopbd.com");
  const [address, setAddress] = useState("Mirpur 10, Dhaka 1216, Bangladesh");
  const [currency, setCurrency] = useState("BDT (৳)");

  // WooCommerce
  const [wooUrl, setWooUrl] = useState("");
  const [wooKey, setWooKey] = useState("");
  const [wooSecret, setWooSecret] = useState("");

  // Delivery settings
  const [deliveryDhaka, setDeliveryDhaka] = useState("80");
  const [deliveryOutside, setDeliveryOutside] = useState("150");
  const [preferredCourier, setPreferredCourier] = useState("pathao");

  const sb = createClient();
  const webhookUrl = "https://pfzsursjuchrgawzsluu.supabase.co/functions/v1/webhook-meta";

  useEffect(() => {
    async function load() {
      const { data } = await sb.from("business_settings").select("*").limit(1).single();
      if (data) {
        if (data.business_name) setBusinessName(data.business_name);
        if (data.woo_api_url) setWooUrl(data.woo_api_url);
        if (data.woo_consumer_key) setWooKey(data.woo_consumer_key);
        if (data.woo_consumer_secret) setWooSecret(data.woo_consumer_secret);
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { data: existing } = await sb.from("business_settings").select("id").limit(1).single();
    if (existing) {
      const { error } = await sb
        .from("business_settings")
        .update({
          business_name: businessName,
          woo_api_url: wooUrl,
          woo_consumer_key: wooKey,
          woo_consumer_secret: wooSecret,
        })
        .eq("id", existing.id);

      if (error) {
        toast.error("Failed to save settings");
      } else {
        toast.success("Settings saved successfully!");
      }
    }
    setSaving(false);
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("Webhook URL copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 80px", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Page Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", borderBottom: "1px solid rgba(73,68,84,0.3)", paddingBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.025em", fontFamily: "Geist, system-ui", margin: 0 }}>
            Settings
          </h1>
          <p style={{ fontSize: 13, color: "#958ea0", marginTop: 4, margin: 0 }}>
            Manage your business configuration, WooCommerce API keys, and logistics
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 18px",
            borderRadius: 6,
            background: "#a078ff",
            color: "#1e005d",
            border: "none",
            fontSize: 12,
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
          <span>{saving ? "Saving..." : "Save Config"}</span>
        </button>
      </div>

      {/* Two-Column Settings Layout (Stitch Architecture) */}
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24, alignItems: "flex-start" }}>
        {/* Left Sub-Navigation Rail */}
        <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          <button
            onClick={() => setActiveTab("profile")}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "9px 12px",
              borderRadius: 6,
              background: activeTab === "profile" ? "#201f1f" : "transparent",
              border: "none",
              borderLeft: activeTab === "profile" ? "3px solid #a078ff" : "3px solid transparent",
              color: activeTab === "profile" ? "#e5e2e1" : "#958ea0",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: activeTab === "profile" ? "#a078ff" : "#958ea0" }}>storefront</span>
              <span>Business Profile</span>
            </span>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#958ea0" }}>chevron_right</span>
          </button>

          <button
            onClick={() => setActiveTab("woo")}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "9px 12px",
              borderRadius: 6,
              background: activeTab === "woo" ? "#201f1f" : "transparent",
              border: "none",
              borderLeft: activeTab === "woo" ? "3px solid #a078ff" : "3px solid transparent",
              color: activeTab === "woo" ? "#e5e2e1" : "#958ea0",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: activeTab === "woo" ? "#a078ff" : "#958ea0" }}>shopping_bag</span>
              <span>WooCommerce</span>
            </span>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#958ea0" }}>chevron_right</span>
          </button>

          <button
            onClick={() => setActiveTab("platforms")}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "9px 12px",
              borderRadius: 6,
              background: activeTab === "platforms" ? "#201f1f" : "transparent",
              border: "none",
              borderLeft: activeTab === "platforms" ? "3px solid #a078ff" : "3px solid transparent",
              color: activeTab === "platforms" ? "#e5e2e1" : "#958ea0",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: activeTab === "platforms" ? "#a078ff" : "#958ea0" }}>hub</span>
              <span>Platforms &amp; Webhooks</span>
            </span>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#958ea0" }}>chevron_right</span>
          </button>

          <button
            onClick={() => setActiveTab("delivery")}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "9px 12px",
              borderRadius: 6,
              background: activeTab === "delivery" ? "#201f1f" : "transparent",
              border: "none",
              borderLeft: activeTab === "delivery" ? "3px solid #a078ff" : "3px solid transparent",
              color: activeTab === "delivery" ? "#e5e2e1" : "#958ea0",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: activeTab === "delivery" ? "#a078ff" : "#958ea0" }}>local_shipping</span>
              <span>Delivery &amp; Courier</span>
            </span>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#958ea0" }}>chevron_right</span>
          </button>
        </div>

        {/* Right Content Area */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* TAB 1: Business Profile */}
          {activeTab === "profile" && (
            <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(73,68,84,0.25)", paddingBottom: 14, marginBottom: 18 }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 600, color: "#e5e2e1", margin: 0 }}>Business Information</h2>
                  <p style={{ fontSize: 12, color: "#958ea0", marginTop: 2, margin: 0 }}>Primary credentials used across conversational agents and receipts</p>
                </div>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#201f1f", color: "#cbc3d7", border: "1px solid rgba(73,68,84,0.3)" }}>
                  Store ID: HSBD-8491
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Business Name</label>
                  <input
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Phone Number</label>
                  <input
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Support Email</label>
                  <input
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Store Currency</label>
                  <input
                    value={currency}
                    onChange={e => setCurrency(e.target.value)}
                    disabled
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#958ea0", fontSize: 12, outline: "none" }}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Store Address</label>
                  <input
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WooCommerce */}
          {activeTab === "woo" && (
            <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(73,68,84,0.25)", paddingBottom: 14, marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "#201f1f", border: "1px solid rgba(73,68,84,0.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#d0bcff" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>shopping_bag</span>
                  </div>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 600, color: "#e5e2e1", margin: 0 }}>WooCommerce Integration</h2>
                    <p style={{ fontSize: 12, color: "#958ea0", marginTop: 2, margin: 0 }}>Real-time inventory and conversational order sync</p>
                  </div>
                </div>

                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: wooUrl ? "rgba(34,197,94,0.12)" : "rgba(73,68,84,0.2)", color: wooUrl ? "#4ade80" : "#958ea0", border: "1px solid rgba(73,68,84,0.3)" }}>
                  {wooUrl ? "Connected" : "Not Configured"}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Store URL</label>
                  <input
                    value={wooUrl}
                    onChange={e => setWooUrl(e.target.value)}
                    placeholder="https://helmetshopbd.com"
                    type="url"
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Consumer Key</label>
                    <input
                      type="password"
                      value={wooKey}
                      onChange={e => setWooKey(e.target.value)}
                      placeholder="ck_••••••••••••••••"
                      style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#e5e2e1", fontSize: 12, outline: "none", fontFamily: "monospace" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Consumer Secret</label>
                    <input
                      type="password"
                      value={wooSecret}
                      onChange={e => setWooSecret(e.target.value)}
                      placeholder="cs_••••••••••••••••"
                      style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#e5e2e1", fontSize: 12, outline: "none", fontFamily: "monospace" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Platforms & Webhook */}
          {activeTab === "platforms" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Webhook Card */}
              <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 22, borderLeft: "3px solid #ffb869" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "#201f1f", border: "1px solid rgba(73,68,84,0.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffb869" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>webhook</span>
                  </div>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 600, color: "#e5e2e1", margin: 0 }}>Meta Webhook Callback URL</h2>
                    <p style={{ fontSize: 12, color: "#958ea0", marginTop: 2, margin: 0 }}>Paste into Meta App settings to stream WhatsApp, Messenger, and IG chats</p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    readOnly
                    value={webhookUrl}
                    style={{ flex: 1, background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#d0bcff", fontSize: 11, fontFamily: "monospace", outline: "none" }}
                  />
                  <button
                    onClick={copyWebhook}
                    style={{ padding: "8px 16px", background: "#201f1f", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, color: copied ? "#4ade80" : "#e5e2e1", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{copied ? "check" : "content_copy"}</span>
                    <span>{copied ? "Copied!" : "Copy"}</span>
                  </button>
                </div>
              </div>

              {/* Connected Status Table */}
              <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#e5e2e1", marginBottom: 14 }}>Channel Connection Health</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { icon: "chat", label: "WhatsApp Cloud API", status: "Connected", color: "#4ade80" },
                    { icon: "forum", label: "Facebook Messenger", status: "Connected", color: "#60a5fa" },
                    { icon: "photo_camera", label: "Instagram Direct", status: "Connected", color: "#c084fc" },
                    { icon: "shopping_bag", label: "WooCommerce Store", status: wooUrl ? "Active Sync" : "Pending API Keys", color: wooUrl ? "#4ade80" : "#fbbf24" },
                  ].map(ch => (
                    <div key={ch.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#131313", borderRadius: 6, border: "1px solid rgba(73,68,84,0.2)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: ch.color }}>{ch.icon}</span>
                        <span style={{ fontSize: 13, color: "#e5e2e1", fontWeight: 500 }}>{ch.label}</span>
                      </div>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(34,197,94,0.12)", color: ch.color }}>
                        {ch.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Delivery & Courier */}
          {activeTab === "delivery" && (
            <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 22 }}>
              <div style={{ borderBottom: "1px solid rgba(73,68,84,0.25)", paddingBottom: 14, marginBottom: 18 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: "#e5e2e1", margin: 0 }}>Delivery &amp; Courier Configuration</h2>
                <p style={{ fontSize: 12, color: "#958ea0", marginTop: 2, margin: 0 }}>Automated delivery calculations injected into conversational checkout</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Inside Dhaka Charge (৳)</label>
                  <input
                    value={deliveryDhaka}
                    onChange={e => setDeliveryDhaka(e.target.value)}
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Outside Dhaka Charge (৳)</label>
                  <input
                    value={deliveryOutside}
                    onChange={e => setDeliveryOutside(e.target.value)}
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Preferred Courier Partner</label>
                  <select
                    value={preferredCourier}
                    onChange={e => setPreferredCourier(e.target.value)}
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                  >
                    <option value="pathao">Pathao Courier (Direct API)</option>
                    <option value="steadfast">Steadfast Courier</option>
                    <option value="paperfly">Paperfly</option>
                    <option value="redx">RedX</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
