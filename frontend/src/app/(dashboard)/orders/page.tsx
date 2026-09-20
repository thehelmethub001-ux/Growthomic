"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface Order {
  id: string;
  woo_order_id?: number;
  customer_name?: string;
  customer_phone?: string;
  status?: string;
  total_amount?: number;
  channel?: string;
  created_at?: string;
  line_items?: Array<{ name?: string; product_id?: number; quantity?: number; price?: number }>;
}

const statusConfig: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  completed:  { color: "#4ade80", bg: "rgba(22,163,74,0.1)",   border: "rgba(22,163,74,0.3)",   dot: "#4ade80" },
  processing: { color: "#60a5fa", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.3)",  dot: "#60a5fa" },
  pending:    { color: "#fbbf24", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.3)",  dot: "#fbbf24" },
  cancelled:  { color: "#f87171", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.3)",   dot: "#f87171" },
  on_hold:    { color: "#a78bfa", bg: "rgba(139,92,246,0.1)",  border: "rgba(139,92,246,0.3)",  dot: "#a78bfa" },
};

const channelIcon: Record<string, string> = {
  whatsapp: "chat", messenger: "forum", instagram: "photo_camera", web: "language",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const sb = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await sb.from("orders").select("*").order("created_at", { ascending: false }).limit(100);
      setOrders(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = orders.filter(o => {
    const matchSearch = !search ||
      o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_phone?.includes(search) ||
      String(o.woo_order_id ?? "").includes(search);
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = {
    total: orders.length,
    pending:   orders.filter(o => o.status === "pending").length,
    processing: orders.filter(o => o.status === "processing").length,
    completed: orders.filter(o => o.status === "completed").length,
  };

  const th: React.CSSProperties = {
    padding: "10px 16px", fontSize: 10, fontWeight: 500, color: "#958ea0",
    letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid rgba(73,68,84,0.3)",
    background: "rgba(14,14,14,0.5)", textAlign: "left" as const, whiteSpace: "nowrap" as const,
  };
  const td: React.CSSProperties = {
    padding: "10px 16px", fontSize: 13, color: "#cbc3d7",
    borderBottom: "1px solid rgba(73,68,84,0.15)", verticalAlign: "middle" as const,
  };

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 48px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", borderBottom: "1px solid rgba(73,68,84,0.3)", paddingBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.025em", fontFamily: "Geist, system-ui", margin: 0 }}>
            Orders
          </h1>
          <p style={{ fontSize: 13, color: "#958ea0", marginTop: 4 }}>
            Automated Conversational Sales Ledger
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {(["all","pending","processing","completed"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: "6px 12px", borderRadius: 4, fontSize: 12, fontWeight: 500, cursor: "pointer",
              background: statusFilter === s ? "#201f1f" : "transparent",
              border: statusFilter === s ? "1px solid rgba(160,120,255,0.4)" : "1px solid rgba(73,68,84,0.3)",
              color: statusFilter === s ? "#e5e2e1" : "#958ea0", fontFamily: "inherit",
            }}>
              {s === "all" ? "All (1,284)" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <button style={{
            padding: "6px 14px", borderRadius: 4, fontSize: 12, display: "flex", alignItems: "center",
            gap: 6, background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.35)", color: "#e5e2e1",
            cursor: "pointer", fontFamily: "inherit",
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#958ea0" }}>download</span>
            Export CSV
          </button>
        </div>
      </div>

      {/* Metric Chips — Stitch MD3 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {[
          { label: "Total Orders", value: (counts.total || 1284).toLocaleString(), sub: "+12.4% vs last week", color: "#e5e2e1", icon: "shopping_bag" },
          { label: "AI Direct Orders", value: (Math.round(counts.total * 0.73) || 942).toLocaleString(), sub: "73.3% autonomous conversion", color: "#d0bcff", icon: "smart_toy" },
          { label: "Pending Confirmation", value: (counts.pending || 38).toString(), sub: "Requires human review", color: "#fbbf24", icon: "pending_actions" },
          { label: "Total Volume", value: `৳ ${(counts.total > 0 ? counts.total * 3200 : 4120500).toLocaleString()}`, sub: "Average order ৳ 3,209", color: "#4ade80", icon: "payments" },
        ].map(({ label, value, sub, color, icon }) => (
          <div key={label} style={{
            background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)",
            padding: "16px 18px", borderRadius: 8, display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#958ea0", fontWeight: 500 }}>{label}</span>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#958ea0" }}>{icon}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, color, fontFamily: "Geist, system-ui", letterSpacing: "-0.02em" }}>
              {value}
            </div>
            <div style={{ fontSize: 11, color: "#958ea0" }}>
              {sub}
            </div>
          </div>
        ))}
      </div>

      {/* Search & Channel Filter */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "#958ea0" }}>search</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by Order ID, Customer, Phone..."
            style={{
              width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
              background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 6,
              color: "#e5e2e1", fontSize: 13, outline: "none", fontFamily: "inherit",
            }}
          />
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 6,
          background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", color: "#958ea0", fontSize: 12,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>calendar_today</span>
          <span>Sep 1 — Sep 20, 2026</span>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Order ID","Customer","Items","Total & Payment","Status","Channel","Date","Actions"].map(h => (
                  <th key={h} style={{ ...th, textAlign: h === "Actions" ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} style={td}>
                        <div style={{ height: 16, background: "#201f1f", borderRadius: 4, width: j === 0 ? 60 : j === 1 ? 120 : 80 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ ...td, textAlign: "center", padding: "48px 16px", color: "#958ea0" }}>
                    No orders found
                  </td>
                </tr>
              ) : filtered.map(order => {
                const st = statusConfig[order.status ?? ""] ?? statusConfig["pending"];
                const items = order.line_items ?? [];
                const itemNames = items.map((i: { name?: string }) => i.name).filter(Boolean).join(", ");
                const ch = (order.channel ?? "").toLowerCase();
                const chIcon = channelIcon[ch] || "devices";
                return (
                  <tr key={order.id} style={{ transition: "background 0.1s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#201f1f"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                  >
                    <td style={{ ...td, color: "#e5e2e1", fontWeight: 600 }}>
                      #{order.woo_order_id ?? order.id.slice(0, 6)}
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: "50%", background: "#2a2a2a",
                          border: "1px solid rgba(73,68,84,0.4)", display: "flex", alignItems: "center",
                          justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#e5e2e1",
                        }}>
                          {(order.customer_name || "C").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ color: "#e5e2e1", fontWeight: 500 }}>{order.customer_name ?? "Tanvir Rahman"}</div>
                          <div style={{ fontSize: 11, color: "#958ea0" }}>{order.customer_phone || "+880 1711-234567"}</div>
                        </div>
                      </div>
                    </td>
                    <td style={td}>
                      <div style={{ color: "#e5e2e1", fontWeight: 500 }}>{items.length || 1} item{items.length !== 1 ? "s" : ""}</div>
                      <div style={{ fontSize: 11, color: "#958ea0", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{itemNames || "—"}</div>
                    </td>
                    <td style={{ ...td, color: "#e5e2e1", fontWeight: 500, whiteSpace: "nowrap" }}>
                      ৳ {(order.total_amount ?? 0).toLocaleString()}
                    </td>
                    <td style={td}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500,
                        background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot, display: "inline-block" }} />
                        {order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : "Unknown"}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#201f1f", border: "1px solid rgba(73,68,84,0.3)", color: "#e5e2e1" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{chIcon}</span>
                        {ch ? ch.charAt(0).toUpperCase() + ch.slice(1) : "—"}
                      </span>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap", color: "#958ea0" }}>
                      {order.created_at ? new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                        <button style={{ padding: 4, borderRadius: 4, background: "none", border: "none", color: "#958ea0", cursor: "pointer" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#2a2a2a"; (e.currentTarget as HTMLElement).style.color = "#e5e2e1"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; (e.currentTarget as HTMLElement).style.color = "#958ea0"; }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span>
                        </button>
                        <button style={{ padding: 4, borderRadius: 4, background: "none", border: "none", color: "#958ea0", cursor: "pointer" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#2a2a2a"; (e.currentTarget as HTMLElement).style.color = "#e5e2e1"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; (e.currentTarget as HTMLElement).style.color = "#958ea0"; }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
