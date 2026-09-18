"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { pageWrap, skeletonStyle } from "@/lib/styles";
import { MessageCircle, Brain, ShoppingBag, Banknote, AlertTriangle, HelpCircle, Bot, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { startOfDay, endOfDay, format } from "date-fns";

const stagger: Variants = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
};

// ── Stat Card ────────────────────────────────────────────────
function StatCard({
  label, value, icon: Icon, delta, up, loading,
}: {
  label: string; value: string; icon: React.ElementType;
  delta: string; up: boolean; loading: boolean;
}) {
  return (
    <motion.div
      variants={fadeUp}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: "18px 20px",
      }}
    >
      {/* Top row: icon + delta */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "var(--r-sm)",
          background: "var(--bg-elevated)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={15} color="var(--text-muted)" />
        </div>
        {!loading && (
          <div style={{
            display: "flex", alignItems: "center", gap: 3,
            fontSize: 11, fontWeight: 500,
            color: up ? "var(--green-light)" : "var(--red-light)",
          }}>
            {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {delta}
          </div>
        )}
      </div>

      {/* Value */}
      {loading ? (
        <div style={{ ...skeletonStyle, width: 80, height: 28, marginBottom: 6 }} />
      ) : (
        <div style={{
          fontSize: 26, fontWeight: 600, color: "var(--text-primary)",
          letterSpacing: "-0.03em", lineHeight: 1,
        }}>
          {value}
        </div>
      )}
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 5, fontWeight: 400 }}>
        {label}
      </div>
    </motion.div>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--bg-elevated)", border: "1px solid var(--border)",
      borderRadius: "var(--r-md)", padding: "8px 12px", fontSize: 12,
    }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>
        {payload[0].value} messages
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState({ messages: 0, handleRate: 0, orders: 0, revenue: 0 });
  const [queue, setQueue] = useState({ ai_failed: 0, return: 0, complaint: 0 });
  const [chart, setChart] = useState<{ time: string; messages: number }[]>([]);
  const [businessName, setBusinessName] = useState("");
  const sb = createClient();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const start = startOfDay(new Date()).toISOString();
    const end   = endOfDay(new Date()).toISOString();
    try {
      const [
        { count: msgCount },
        { count: aiCount },
        { count: humanCount },
        { count: ordCount },
        { data: revData },
        { data: qData },
        { data: msgsToday },
        { data: biz },
      ] = await Promise.all([
        sb.from("messages").select("*", { count: "exact", head: true }).gte("created_at", start).lte("created_at", end),
        sb.from("messages").select("*", { count: "exact", head: true }).eq("role", "ai").gte("created_at", start).lte("created_at", end),
        sb.from("messages").select("*", { count: "exact", head: true }).eq("role", "human_agent").gte("created_at", start).lte("created_at", end),
        sb.from("orders").select("*", { count: "exact", head: true }).gte("created_at", start).lte("created_at", end),
        sb.from("orders").select("total_amount").gte("created_at", start).lte("created_at", end).neq("status", "cancelled"),
        sb.from("human_queue").select("reason").eq("status", "pending"),
        sb.from("messages").select("created_at").gte("created_at", start).lte("created_at", end),
        sb.from("business_settings").select("business_name").limit(1).single(),
      ]);

      const totalAgent = (aiCount || 0) + (humanCount || 0);
      const handleRate = totalAgent > 0 ? Math.round(((aiCount || 0) / totalAgent) * 100) : 0;
      const rev = revData?.reduce((a, o) => a + (o.total_amount || 0), 0) || 0;

      const qc = { ai_failed: 0, return: 0, complaint: 0 };
      qData?.forEach(q => { if (q.reason in qc) qc[q.reason as keyof typeof qc]++; });

      const hourly = new Array(12).fill(0);
      msgsToday?.forEach(m => { hourly[Math.floor(new Date(m.created_at).getHours() / 2)]++; });
      const chartData = hourly.map((count, i) => ({
        time: `${String(i * 2).padStart(2, "0")}:00`,
        messages: count,
      }));

      setKpi({ messages: msgCount || 0, handleRate, orders: ordCount || 0, revenue: rev });
      setQueue(qc);
      setChart(chartData);
      if (biz?.business_name) setBusinessName(biz.business_name);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

  const kpis = [
    { label: "Messages Today",  value: kpi.messages.toLocaleString(), delta: "+12%", up: true,  icon: MessageCircle },
    { label: "AI Handle Rate",  value: `${kpi.handleRate}%`,          delta: "+2%",  up: true,  icon: Brain },
    { label: "New Orders",      value: kpi.orders.toLocaleString(),   delta: "-3%",  up: false, icon: ShoppingBag },
    { label: "Revenue Today",   value: `৳${kpi.revenue.toLocaleString()}`, delta: "+8%", up: true, icon: Banknote },
  ];

  const actions = [
    { label: "AI Failed",   sub: "Needs manual reply",  count: queue.ai_failed,  icon: Bot,           color: "var(--red-light)",   href: "/human-queue" },
    { label: "Returns",     sub: "Pending approval",    count: queue.return,      icon: HelpCircle,    color: "var(--amber-light)", href: "/orders" },
    { label: "Complaints",  sub: "Urgent resolution",   count: queue.complaint,   icon: AlertTriangle, color: "var(--blue)",        href: "/inbox" },
  ];

  const platforms = [
    { name: "Facebook Messenger" },
    { name: "Instagram DM" },
    { name: "WhatsApp Business" },
    { name: "WooCommerce" },
  ];

  return (
    <div style={pageWrap}>
      {/* ── Page header ────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{ marginBottom: 28 }}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            All systems operational
          </span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 4 }}>
          {greeting}, {businessName || "there"}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {format(new Date(), "EEEE, MMMM d")} · Here's your AI agent overview for today.
        </p>
      </motion.div>

      {/* ── KPI cards ──────────────────── */}
      <motion.div
        variants={stagger} initial="hidden" animate="show"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {kpis.map(kpi => (
          <StatCard key={kpi.label} {...kpi} loading={loading} />
        ))}
      </motion.div>

      {/* ── Chart + Queue ───────────────── */}
      <motion.div
        variants={stagger} initial="hidden" animate="show"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr minmax(260px, 320px)",
          gap: 12,
        }}
      >
        {/* Activity chart */}
        <motion.div
          variants={fadeUp}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            padding: 20,
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.015em" }}>
              Message Activity
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              Messages processed today by hour
            </div>
          </div>
          <div style={{ height: 240 }}>
            {loading ? (
              <div style={{ ...skeletonStyle, width: "100%", height: "100%", borderRadius: "var(--r-sm)" }} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--brand)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="messages"
                    stroke="var(--brand)"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#areaGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Action required */}
        <motion.div
          variants={fadeUp}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            padding: 20,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
            <AlertTriangle size={13} color="var(--amber-light)" />
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.015em" }}>
              Action Required
            </div>
          </div>

          {/* Queue items */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {actions.map(a => {
              const Icon = a.icon;
              return (
                <a
                  key={a.label}
                  href={a.href}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "11px 14px",
                    background: "var(--bg-elevated)",
                    borderRadius: "var(--r-md)",
                    border: "1px solid transparent",
                    transition: "border-color 0.12s, background 0.12s",
                    textDecoration: "none",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border-mid)";
                    (e.currentTarget as HTMLElement).style.background = "var(--bg-overlay)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = "transparent";
                    (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Icon size={14} color={a.color} style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{a.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{a.sub}</div>
                    </div>
                  </div>
                  <div style={{
                    padding: "2px 8px", borderRadius: 100,
                    fontSize: 11, fontWeight: 600,
                    background: "var(--bg-card)",
                    color: a.count > 0 ? a.color : "var(--text-muted)",
                    border: "1px solid var(--border)",
                    flexShrink: 0,
                  }}>
                    {loading ? "—" : a.count}
                  </div>
                </a>
              );
            })}
          </div>

          {/* Platforms */}
          <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
            }}>
              Platforms
            </div>
            {platforms.map(p => (
              <div key={p.name} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "6px 0", borderBottom: "1px solid var(--border)",
              }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)" }} />
                  <span style={{ fontSize: 11, color: "var(--green-light)", fontWeight: 500 }}>Live</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
