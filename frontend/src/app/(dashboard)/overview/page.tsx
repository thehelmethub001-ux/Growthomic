"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

const chartData = [
  { time: "00:00", messages: 45 },
  { time: "02:00", messages: 32 },
  { time: "04:00", messages: 28 },
  { time: "06:00", messages: 55 },
  { time: "08:00", messages: 148 },
  { time: "10:00", messages: 210 },
  { time: "12:00", messages: 290 },
  { time: "14:00", messages: 342 },
  { time: "16:00", messages: 280 },
  { time: "18:00", messages: 195 },
  { time: "20:00", messages: 120 },
  { time: "22:00", messages: 78 },
];

interface Stats {
  messages: number;
  aiRate: number;
  newOrders: number;
  revenue: number;
}

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats>({ messages: 0, aiRate: 94, newOrders: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);
  const sb = createClient();

  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();

  useEffect(() => {
    async function load() {
      const todayStr = new Date().toISOString().split("T")[0];
      const [msgs, orders] = await Promise.all([
        sb.from("messages").select("id", { count: "exact" }).gte("created_at", todayStr),
        sb.from("orders").select("id, total_amount", { count: "exact" }).gte("created_at", todayStr),
      ]);
      const revenue = (orders.data ?? []).reduce((s: number, o: { total_amount?: number }) => s + (o.total_amount ?? 0), 0);
      setStats({
        messages: msgs.count ?? 0,
        aiRate: 94,
        newOrders: orders.count ?? 0,
        revenue,
      });
      setLoading(false);
    }
    load();
  }, []);

  const statCards = [
    { icon: "forum",        label: "Messages Today",   value: loading ? "—" : stats.messages.toLocaleString(), sub: "+12% from yesterday" },
    { icon: "smart_toy",    label: "AI Handle Rate",   value: loading ? "—" : `${stats.aiRate}%`,              sub: "Nominal", subColor: "#d0bcff" },
    { icon: "shopping_bag", label: "New Orders",       value: loading ? "—" : stats.newOrders.toString(),      sub: "+4 pending confirm" },
    { icon: "payments",     label: "Revenue Today",    value: loading ? "—" : `৳ ${stats.revenue.toLocaleString()}`, sub: "+8.4% target" },
  ];

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 48px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
        borderBottom: "1px solid rgba(73,68,84,0.3)", paddingBottom: 20,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <p style={{ fontSize: 10, fontWeight: 500, color: "#958ea0", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            TODAY — {today}
          </p>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.025em", fontFamily: "Geist, system-ui" }}>
            Helmet Shop BD
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.35)",
            padding: "6px 14px", borderRadius: 100,
            fontSize: 12, fontWeight: 500, color: "#e5e2e1",
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#a078ff", display: "inline-block", animation: "pulse 2s infinite" }} />
            AI Automation: Active
          </div>
          <button style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)",
            padding: "6px 12px", borderRadius: 4,
            fontSize: 12, color: "#958ea0", cursor: "pointer",
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#958ea0" }}>calendar_today</span>
            Today
          </button>
          <button style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)",
            padding: "6px 12px", borderRadius: 4,
            fontSize: 12, color: "#958ea0", cursor: "pointer",
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#958ea0" }}>ios_share</span>
            Export
          </button>
        </div>
      </header>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {statCards.map(({ icon, label, value, sub, subColor }) => (
          <div key={label} style={{
            background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)",
            borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#958ea0", flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: subColor ?? "#958ea0", whiteSpace: "nowrap" }}>{sub}</span>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.02em", fontFamily: "Geist, system-ui", whiteSpace: "nowrap" }}>
                {value}
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#958ea0", marginTop: 2, whiteSpace: "nowrap" }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart + Sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>

        {/* Chart */}
        <div style={{
          background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)",
          borderRadius: 12, padding: 20,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 12, fontWeight: 600, color: "#e5e2e1" }}>Message Activity</h2>
              <p style={{ fontSize: 12, color: "#958ea0", marginTop: 2 }}>Real-time incoming chat volume and automated resolution rate</p>
            </div>
            <div style={{
              display: "inline-flex", padding: 2,
              background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 4,
            }}>
              {["Today", "7D", "30D"].map((t, i) => (
                <button key={t} style={{
                  padding: "4px 10px", borderRadius: 2, fontSize: 10, fontWeight: 500,
                  background: i === 0 ? "#201f1f" : "transparent",
                  color: i === 0 ? "#e5e2e1" : "#958ea0",
                  border: "none", cursor: "pointer",
                }}>{t}</button>
              ))}
            </div>
          </div>

          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="chartGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#a078ff" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#a078ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#958ea0" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#958ea0" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#2a2a2a", border: "1px solid rgba(73,68,84,0.5)", borderRadius: 4, fontSize: 12, color: "#e5e2e1" }}
                  labelStyle={{ color: "#e5e2e1", fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="messages" stroke="#a078ff" strokeWidth={2} fill="url(#chartGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ borderTop: "1px solid rgba(73,68,84,0.3)", paddingTop: 12, marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#958ea0" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#a078ff", display: "inline-block" }} />
                Total Volume
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#958ea0" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#494454", display: "inline-block" }} />
                Human Threshold
              </span>
            </div>
            <span style={{ fontSize: 12, color: "#958ea0" }}>Updated 42s ago</span>
          </div>
        </div>

        {/* Right Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Action Required */}
          <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontSize: 12, fontWeight: 600, color: "#e5e2e1" }}>Action Required</h2>
              <span style={{ fontSize: 10, color: "#958ea0" }}>6 Total</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {[
                { icon: "warning", label: "AI Failed", count: 3 },
                { icon: "assignment_return", label: "Returns", count: 2 },
                { icon: "flag", label: "Complaints", count: 1 },
              ].map(({ icon, label, count }) => (
                <a key={label} href="#" style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px", borderRadius: 4,
                  border: "1px solid transparent",
                  transition: "all 0.12s", textDecoration: "none",
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#2a2a2a"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(73,68,84,0.3)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#958ea0" }}>{icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#e5e2e1" }}>{label}</span>
                  </div>
                  <span style={{ fontSize: 11, padding: "1px 8px", background: "#353534", color: "#e5e2e1", borderRadius: 2 }}>{count}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Platforms */}
          <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontSize: 12, fontWeight: 600, color: "#e5e2e1" }}>Platforms</h2>
              <span style={{ fontSize: 10, color: "#958ea0" }}>4 Active</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { icon: "chat",         label: "Facebook Messenger" },
                { icon: "call",         label: "WhatsApp Business" },
                { icon: "photo_camera", label: "Instagram Direct" },
                { icon: "language",     label: "Website Live Chat" },
              ].map(({ icon, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#958ea0" }}>{icon}</span>
                    <span style={{ fontSize: 13, color: "#e5e2e1" }}>{label}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#a078ff", display: "inline-block", animation: "pulse 2s infinite" }} />
                    <span style={{ fontSize: 11, color: "#e5e2e1", fontWeight: 500 }}>Live</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
