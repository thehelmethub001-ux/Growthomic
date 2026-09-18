"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { format, isBefore, isAfter } from "date-fns";

const inp: React.CSSProperties = { width: "100%", background: "#201f1f", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 4, padding: "9px 12px", color: "#e5e2e1", fontSize: 13, fontFamily: "inherit", outline: "none" };

type Offer = { 
  id: string; name: string; description: string; 
  discount_type: "percentage" | "fixed_amount"; discount_value: number; 
  min_order_amount: number | null; start_date: string; end_date: string;
  is_active: boolean; created_at: string;
};

const STATUS_STYLE: Record<string, { color: string; bg: string; icon: string }> = {
  active:    { color: "#4ade80", bg: "rgba(34,197,94,0.1)",   icon: "check_circle" },
  scheduled: { color: "#fbbf24", bg: "rgba(245,158,11,0.1)",  icon: "schedule" },
  ended:     { color: "#958ea0", bg: "rgba(73,68,84,0.2)",    icon: "cancel" },
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
  const [tab, setTab] = useState<"all"|"active"|"scheduled"|"ended">("all");
  const [showModal, setShowModal] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ 
    name: "", 
    description: "", 
    discount_type: "percentage", 
    discount_value: "", 
    min_order_amount: "",
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
    is_active: true
  });
  const sb = createClient();

  useEffect(() => { loadOffers(); }, []);

  const loadOffers = async () => {
    setLoading(true);
    const { data } = await sb.from("offers").select("*").order("created_at", { ascending: false });
    if (data) setOffers(data as Offer[]);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.name || !form.discount_value) { toast.error("Name and Discount Value are required"); return; }
    setSaving(true);
    
    const payload = {
      name: form.name,
      description: form.description,
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value),
      min_order_amount: form.min_order_amount ? parseFloat(form.min_order_amount) : null,
      start_date: new Date(form.start_date).toISOString(),
      end_date: new Date(form.end_date).toISOString(),
      is_active: form.is_active
    };

    const { data, error } = await sb.from("offers").insert([payload]).select().single();
    if (error) {
      toast.error("Failed to create offer: " + error.message);
    } else if (data) {
      toast.success("Offer created!");
      setOffers([data as Offer, ...offers]);
      setShowModal(false);
      setForm({ 
        name: "", 
        description: "", 
        discount_type: "percentage", 
        discount_value: "", 
        min_order_amount: "",
        start_date: format(new Date(), "yyyy-MM-dd"),
        end_date: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
        is_active: true
      });
    }
    setSaving(false);
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    const { error } = await sb.from("offers").update({ is_active: nextStatus }).eq("id", id);
    if (!error) {
      setOffers(offers.map(o => o.id === id ? { ...o, is_active: nextStatus } : o));
    }
  };

  const shown = tab === "all" ? offers : offers.filter(o => getOfferStatus(o) === tab);

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 64px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid rgba(73,68,84,0.3)" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.025em", fontFamily: "Geist, system-ui" }}>Offers & Events</h1>
          <p style={{ fontSize: 13, color: "#958ea0", marginTop: 4 }}>Manage promotional campaigns and special events</p>
        </div>
        <button onClick={() => setShowModal(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 4, background: "#a078ff", color: "#340080", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Create Offer
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Active Campaigns", value: offers.filter(o => getOfferStatus(o) === "active").length,    color: "#4ade80",  icon: "check_circle" },
          { label: "Scheduled",        value: offers.filter(o => getOfferStatus(o) === "scheduled").length,  color: "#fbbf24",  icon: "schedule" },
          { label: "Total Offers",     value: offers.length, color: "#e5e2e1", icon: "local_offer" },
        ].map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12, background: "#1c1b1b", borderRadius: 8, padding: "16px 20px", border: "1px solid rgba(73,68,84,0.3)" }}>
            <div style={{ width: 36, height: 36, borderRadius: 4, background: "#201f1f", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#958ea0" }}>{s.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600, color: s.color, lineHeight: 1, letterSpacing: "-0.02em", fontFamily: "Geist, system-ui" }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#958ea0", marginTop: 4, fontWeight: 500 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(73,68,84,0.3)", marginBottom: 20, gap: 2 }}>
        {(["all","active","scheduled","ended"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", border: "none",
            fontFamily: "inherit", background: "transparent",
            borderBottom: tab === t ? "2px solid #a078ff" : "2px solid transparent",
            color: tab === t ? "#d0bcff" : "#958ea0", marginBottom: -1, textTransform: "capitalize",
          }}>{t}</button>
        ))}
      </div>

      {/* Offer Cards */}
      {loading ? (
        <div style={{ color: "#958ea0", padding: 20 }}>Loading offers...</div>
      ) : shown.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "56px 24px", background: "#1c1b1b", borderRadius: 8, border: "1px dashed rgba(73,68,84,0.4)", textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 8, background: "#201f1f", border: "1px solid rgba(73,68,84,0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#958ea0" }}>local_offer</span>
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#e5e2e1", marginBottom: 6 }}>No offers found</h3>
          <p style={{ fontSize: 13, color: "#958ea0", maxWidth: 380, marginBottom: 20 }}>
            {tab === "all" ? "Create special discount offers or promotional campaigns to boost conversion." : `There are currently no ${tab} offers in your campaigns.`}
          </p>
          <button onClick={() => setShowModal(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 4, background: "#a078ff", color: "#340080", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Create Offer
          </button>
        </div>
      ) : (
        <motion.div layout style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
          <AnimatePresence>
            {shown.map(offer => {
              const statusStr = getOfferStatus(offer);
              const st = STATUS_STYLE[statusStr] || STATUS_STYLE.ended;
              const discountText = offer.discount_type === "percentage" ? `${offer.discount_value}% Off` : `৳${offer.discount_value} Off`;
              const dateRange = `${format(new Date(offer.start_date), "MMM d")} - ${format(new Date(offer.end_date), "MMM d")}`;
              return (
                <motion.div key={offer.id} layout initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }} whileHover={{ y:-2 }}
                  style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 8, padding: 20, position: "relative", overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 4, background: "#201f1f", border: "1px solid rgba(73,68,84,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: st.color }}>local_offer</span>
                    </div>
                    <button onClick={() => toggleStatus(offer.id, offer.is_active)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 100, fontSize: 11, fontWeight: 500, background: st.bg, color: st.color, border: "1px solid rgba(73,68,84,0.3)", cursor: "pointer" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{st.icon}</span>
                      {statusStr.charAt(0).toUpperCase() + statusStr.slice(1)}
                    </button>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.01em", marginBottom: 6 }}>{offer.name}</div>
                  <div style={{ fontSize: 12, color: "#958ea0", marginBottom: 14, lineHeight: 1.5 }}>{offer.description}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                    <span style={{ padding: "3px 10px", borderRadius: 100, fontSize: 11, fontWeight: 500, background: "#201f1f", border: "1px solid rgba(73,68,84,0.3)", color: "#d0bcff" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 10, marginRight: 3, verticalAlign: "middle" }}>bolt</span>{discountText}
                    </span>
                    {offer.min_order_amount && (
                      <span style={{ padding: "3px 10px", borderRadius: 100, fontSize: 11, fontWeight: 500, background: "#201f1f", border: "1px solid rgba(73,68,84,0.3)", color: "#cbc3d7" }}>Min ৳{offer.min_order_amount}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(73,68,84,0.2)", paddingTop: 12 }}>
                    <div style={{ fontSize: 11, color: "#958ea0", fontWeight: 500 }}>{dateRange}</div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}
            onClick={e => e.target === e.currentTarget && setShowModal(false)}>
            <motion.div initial={{ scale:0.95, opacity: 0 }} animate={{ scale:1, opacity: 1 }} exit={{ scale:0.95, opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
              style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 12, padding: 28, width: 460, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#e5e2e1" }}>Create New Offer</div>
                <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#958ea0", padding: 4, display: "flex" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                </button>
              </div>
              
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#cbc3d7", marginBottom: 6 }}>Campaign Name</label>
                <input style={inp} placeholder="Summer Sale" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#cbc3d7", marginBottom: 6 }}>Discount Type</label>
                  <select style={inp} value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed_amount">Fixed Amount (৳)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#cbc3d7", marginBottom: 6 }}>Value</label>
                  <input style={inp} type="number" placeholder="20" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#cbc3d7", marginBottom: 6 }}>Minimum Order Amount (Optional)</label>
                <input style={inp} type="number" placeholder="1000" value={form.min_order_amount} onChange={e => setForm(f => ({ ...f, min_order_amount: e.target.value }))} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#cbc3d7", marginBottom: 6 }}>Start Date</label>
                  <input style={inp} type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#cbc3d7", marginBottom: 6 }}>End Date</label>
                  <input style={inp} type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>

              <div style={{ marginBottom: 22 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#cbc3d7", marginBottom: 6 }}>Description</label>
                <textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} placeholder="Describe the offer rules..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              
              <div style={{ display: "flex", gap: 10, borderTop: "1px solid rgba(73,68,84,0.3)", paddingTop: 16, marginTop: 16 }}>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: "10px", borderRadius: 4, border: "1px solid rgba(73,68,84,0.4)", background: "#201f1f", color: "#e5e2e1", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 500 }}>Cancel</button>
                <button onClick={handleCreate} disabled={saving} style={{ flex: 2, padding: "10px", borderRadius: 4, border: "none", background: "#a078ff", color: "#340080", cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600 }}>
                  {saving ? "Creating..." : "Create Offer"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
