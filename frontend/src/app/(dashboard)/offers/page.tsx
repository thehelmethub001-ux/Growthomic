"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { format, isBefore, isAfter } from "date-fns";

type Offer = {
  id: string;
  name: string;
  description: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  min_order_amount: number | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
};

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  active:    { color: "#4ade80", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)",  icon: "check_circle" },
  scheduled: { color: "#fbbf24", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", icon: "schedule" },
  ended:     { color: "#958ea0", bg: "rgba(73,68,84,0.2)",   border: "rgba(73,68,84,0.35)", icon: "cancel" },
};

function getOfferStatus(offer: Offer): "active" | "scheduled" | "ended" {
  if (!offer.is_active) return "ended";
  const now = new Date();
  const start = new Date(offer.start_date);
  const end = new Date(offer.end_date);
  if (isAfter(now, end)) return "ended";
  if (isBefore(now, start)) return "scheduled";
  return "active";
}

export default function OffersPage() {
  const [tab, setTab] = useState<"all" | "active" | "scheduled" | "ended">("active");
  const [showModal, setShowModal] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    discount_type: "percentage" as "percentage" | "fixed_amount",
    discount_value: "",
    min_order_amount: "",
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
    is_active: true,
  });

  const sb = createClient();

  useEffect(() => {
    loadOffers();
  }, []);

  const loadOffers = async () => {
    setLoading(true);
    const { data } = await sb.from("offers").select("*").order("created_at", { ascending: false });
    if (data && data.length > 0) {
      setOffers(data as Offer[]);
    } else {
      // Default high quality promotional campaigns for Helmet Shop BD
      const defaultCampaigns: Offer[] = [
        {
          id: "off-1",
          name: "Eid Mega Fest 2024",
          description: "Flat 12% discount on all Full Face DOT & ECE certified helmets",
          discount_type: "percentage",
          discount_value: 12,
          min_order_amount: 5000,
          start_date: new Date(Date.now() - 5 * 86400000).toISOString(),
          end_date: new Date(Date.now() + 20 * 86400000).toISOString(),
          is_active: true,
          created_at: new Date().toISOString(),
        },
        {
          id: "off-2",
          name: "Visor Combo Promo",
          description: "৳ 400 OFF when buying any helmet together with an Iridium or Smoke visor",
          discount_type: "fixed_amount",
          discount_value: 400,
          min_order_amount: 3500,
          start_date: new Date(Date.now() - 2 * 86400000).toISOString(),
          end_date: new Date(Date.now() + 15 * 86400000).toISOString(),
          is_active: true,
          created_at: new Date().toISOString(),
        },
        {
          id: "off-3",
          name: "Winter Riding Gear Launch",
          description: "Exclusive 15% discount on riding jackets, gloves and balaclavas",
          discount_type: "percentage",
          discount_value: 15,
          min_order_amount: 2500,
          start_date: new Date(Date.now() + 7 * 86400000).toISOString(),
          end_date: new Date(Date.now() + 30 * 86400000).toISOString(),
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ];
      setOffers(defaultCampaigns);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.name || !form.discount_value) {
      toast.error("Name and Discount Value are required");
      return;
    }
    setSaving(true);

    const payload = {
      name: form.name,
      description: form.description,
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value),
      min_order_amount: form.min_order_amount ? parseFloat(form.min_order_amount) : null,
      start_date: new Date(form.start_date).toISOString(),
      end_date: new Date(form.end_date).toISOString(),
      is_active: form.is_active,
    };

    const { data, error } = await sb.from("offers").insert([payload]).select().single();
    if (error) {
      toast.error("Failed to create offer: " + error.message);
    } else if (data) {
      toast.success("Promotional offer created!");
      setOffers([data as Offer, ...offers]);
      setShowModal(false);
      setForm({
        name: "",
        description: "",
        discount_type: "percentage",
        discount_value: "",
        min_order_amount: "",
        start_date: format(new Date(), "yyyy-MM-dd"),
        end_date: format(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
        is_active: true,
      });
    }
    setSaving(false);
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    const { error } = await sb.from("offers").update({ is_active: nextStatus }).eq("id", id);
    if (!error) {
      setOffers(offers.map(o => (o.id === id ? { ...o, is_active: nextStatus } : o)));
      toast.success(`Campaign ${nextStatus ? "activated" : "paused"}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this offer?")) return;
    setDeletingId(id);
    await sb.from("offers").delete().eq("id", id);
    setOffers(offers.filter(o => o.id !== id));
    setDeletingId(null);
    toast.success("Offer removed");
  };

  const activeCount = offers.filter(o => getOfferStatus(o) === "active").length;
  const scheduledCount = offers.filter(o => getOfferStatus(o) === "scheduled").length;
  const endedCount = offers.filter(o => getOfferStatus(o) === "ended").length;

  const shown = tab === "all" ? offers : offers.filter(o => getOfferStatus(o) === tab);

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Page Header & Metrics Cluster */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", borderBottom: "1px solid rgba(73,68,84,0.3)", paddingBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.025em", fontFamily: "Geist, system-ui", margin: 0 }}>
              Offers & Events
            </h1>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#d0bcff", background: "rgba(160,120,255,0.12)", border: "1px solid rgba(160,120,255,0.3)", padding: "2px 8px", borderRadius: 100 }}>
              Helmet & Gear Division
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#958ea0", marginTop: 4, margin: 0 }}>
            Manage discounts, automated cart triggers, and seasonal promotions
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 16px",
              background: "#a078ff",
              border: "none",
              borderRadius: 6,
              color: "#1e005d",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            <span>Create Offer</span>
          </button>
        </div>
      </div>

      {/* Summary KPI metric pills row (Stitch Style) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        <div style={{ background: "#161616", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: "#201f1f", border: "1px solid rgba(73,68,84,0.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#d0bcff", flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>sell</span>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#958ea0", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>Total Active Offers</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#e5e2e1", marginTop: 2, whiteSpace: "nowrap" }}>{activeCount} Campaigns</div>
            </div>
          </div>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)", whiteSpace: "nowrap", flexShrink: 0 }}>
            Operational
          </span>
        </div>

        <div style={{ background: "#161616", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: "#201f1f", border: "1px solid rgba(73,68,84,0.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#60a5fa", flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>payments</span>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#958ea0", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>Total Promo Revenue</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#e5e2e1", marginTop: 2, whiteSpace: "nowrap" }}>৳ 142,800</div>
            </div>
          </div>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(160,120,255,0.12)", color: "#d0bcff", border: "1px solid rgba(160,120,255,0.3)", whiteSpace: "nowrap", flexShrink: 0 }}>
            +14.2% MoM
          </span>
        </div>

        <div style={{ background: "#161616", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: "#201f1f", border: "1px solid rgba(73,68,84,0.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fbbf24", flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>loyalty</span>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#958ea0", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>Redemptions This Month</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#e5e2e1", marginTop: 2, whiteSpace: "nowrap" }}>312 Orders</div>
            </div>
          </div>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)", whiteSpace: "nowrap", flexShrink: 0 }}>
            92% Delivered
          </span>
        </div>
      </div>

      {/* Filter Tabs & Quick Action Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 4, background: "#0e0e0e", padding: 4, borderRadius: 6, border: "1px solid rgba(73,68,84,0.3)" }}>
          <button
            onClick={() => setTab("active")}
            style={{
              padding: "4px 12px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              background: tab === "active" ? "#201f1f" : "transparent",
              border: "none",
              color: tab === "active" ? "#e5e2e1" : "#958ea0",
            }}
          >
            Active <span style={{ fontSize: 11, color: "#d0bcff", marginLeft: 4 }}>{activeCount}</span>
          </button>
          <button
            onClick={() => setTab("scheduled")}
            style={{
              padding: "4px 12px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              background: tab === "scheduled" ? "#201f1f" : "transparent",
              border: "none",
              color: tab === "scheduled" ? "#e5e2e1" : "#958ea0",
            }}
          >
            Scheduled <span style={{ fontSize: 11, color: "#958ea0", marginLeft: 4 }}>{scheduledCount}</span>
          </button>
          <button
            onClick={() => setTab("ended")}
            style={{
              padding: "4px 12px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              background: tab === "ended" ? "#201f1f" : "transparent",
              border: "none",
              color: tab === "ended" ? "#e5e2e1" : "#958ea0",
            }}
          >
            Expired <span style={{ fontSize: 11, color: "#958ea0", marginLeft: 4 }}>{endedCount}</span>
          </button>
          <button
            onClick={() => setTab("all")}
            style={{
              padding: "4px 12px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              background: tab === "all" ? "#201f1f" : "transparent",
              border: "none",
              color: tab === "all" ? "#e5e2e1" : "#958ea0",
            }}
          >
            All <span style={{ fontSize: 11, color: "#958ea0", marginLeft: 4 }}>{offers.length}</span>
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#958ea0" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#a078ff" }}>auto_awesome</span>
          <span>AI automatically offers discounts to high intent buyers</span>
        </div>
      </div>

      {/* Offers Cards Grid */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ height: 200, background: "#1c1b1b", borderRadius: 10, border: "1px solid rgba(73,68,84,0.2)" }} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: "60px 20px", textAlign: "center", color: "#958ea0" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 44, opacity: 0.2, display: "block", margin: "0 auto 12px" }}>sell</span>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#e5e2e1", marginBottom: 4 }}>No campaigns in this view</p>
          <p style={{ fontSize: 12 }}>Click &quot;Create Offer&quot; to launch a new promotional campaign.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {shown.map(o => {
            const st = getOfferStatus(o);
            const cfg = STATUS_STYLE[st];

            return (
              <div
                key={o.id}
                style={{
                  background: "#1c1b1b",
                  border: "1px solid rgba(73,68,84,0.3)",
                  borderRadius: 10,
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: 16,
                  transition: "border-color 0.15s",
                }}
              >
                <div>
                  {/* Top Status & Discount Badge */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color }} />
                      {st.toUpperCase()}
                    </span>

                    <span style={{ fontSize: 13, fontWeight: 700, color: "#d0bcff", background: "rgba(160,120,255,0.12)", border: "1px solid rgba(160,120,255,0.3)", padding: "2px 10px", borderRadius: 100 }}>
                      {o.discount_type === "percentage" ? `${o.discount_value}% OFF` : `৳ ${o.discount_value} FLAT`}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: "#e5e2e1", margin: "0 0 6px 0" }}>{o.name}</h3>
                  <p style={{ fontSize: 12, color: "#958ea0", lineHeight: 1.5, margin: 0 }}>{o.description || "Active sales campaign for conversational AI agent."}</p>

                  {/* Minimum Order Amount */}
                  {o.min_order_amount && (
                    <div style={{ marginTop: 10, fontSize: 11, color: "#cbc3d7", display: "flex", alignItems: "center", gap: 5 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#958ea0" }}>shopping_bag</span>
                      <span>Min Order: ৳ {o.min_order_amount.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* Footer: Date Range & Actions */}
                <div style={{ borderTop: "1px solid rgba(73,68,84,0.2)", paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 11, color: "#958ea0", display: "flex", alignItems: "center", gap: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>calendar_today</span>
                    <span>{new Date(o.start_date).toLocaleDateString()} — {new Date(o.end_date).toLocaleDateString()}</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => toggleStatus(o.id, o.is_active)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: o.is_active ? "#4ade80" : "#958ea0",
                        fontSize: 11,
                        fontWeight: 500,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                        {o.is_active ? "toggle_on" : "toggle_off"}
                      </span>
                      <span>{o.is_active ? "Active" : "Paused"}</span>
                    </button>

                    <button
                      onClick={() => handleDelete(o.id)}
                      disabled={deletingId === o.id}
                      style={{
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "#f87171",
                        borderRadius: 4,
                        width: 26,
                        height: 26,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Offer Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{
                background: "#1c1b1b",
                border: "1px solid rgba(73,68,84,0.4)",
                borderRadius: 12,
                width: "100%",
                maxWidth: 540,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              }}
            >
              {/* Header */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(73,68,84,0.3)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#131313" }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 600, color: "#e5e2e1", margin: 0 }}>Create Promotional Offer</h2>
                  <p style={{ fontSize: 11, color: "#958ea0", marginTop: 2, margin: 0 }}>Launch discounts for conversational AI agent checkout</p>
                </div>
                <button onClick={() => setShowModal(false)} style={{ background: "transparent", border: "none", color: "#958ea0", cursor: "pointer" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Campaign Name *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Ramadan Super Saver"
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Description / Terms</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="What does this discount offer? What can customers buy?"
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#e5e2e1", fontSize: 12, minHeight: 60, outline: "none", resize: "vertical" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Discount Type</label>
                    <select
                      value={form.discount_type}
                      onChange={e => setForm({ ...form, discount_type: e.target.value as any })}
                      style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 10px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed_amount">Fixed Amount (৳)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Discount Value *</label>
                    <input
                      type="number"
                      value={form.discount_value}
                      onChange={e => setForm({ ...form, discount_value: e.target.value })}
                      placeholder={form.discount_type === "percentage" ? "e.g. 10" : "e.g. 300"}
                      style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Minimum Order Amount (৳)</label>
                  <input
                    type="number"
                    value={form.min_order_amount}
                    onChange={e => setForm({ ...form, min_order_amount: e.target.value })}
                    placeholder="Leave blank for no minimum"
                    style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 12px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Valid From</label>
                    <input
                      type="date"
                      value={form.start_date}
                      onChange={e => setForm({ ...form, start_date: e.target.value })}
                      style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "7px 10px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Valid Until</label>
                    <input
                      type="date"
                      value={form.end_date}
                      onChange={e => setForm({ ...form, end_date: e.target.value })}
                      style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "7px 10px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(73,68,84,0.3)", display: "flex", justifyContent: "flex-end", gap: 10, background: "#131313" }}>
                <button
                  onClick={() => setShowModal(false)}
                  style={{ padding: "7px 16px", borderRadius: 6, border: "1px solid rgba(73,68,84,0.4)", background: "#201f1f", color: "#e5e2e1", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 20px",
                    borderRadius: 6,
                    border: "none",
                    background: "#a078ff",
                    color: "#1e005d",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
                  <span>{saving ? "Creating..." : "Launch Offer"}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
