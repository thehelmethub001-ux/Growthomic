"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";

type QItem = { id:string; reason:string; priority:number; status:string; note:string|null; created_at:string; conversations:{ id:string; customers:{ id:string; name:string|null; platform:string; platform_id:string } } };

const REASON_STYLE: Record<string, { color: string; bg: string }> = {
  return:         { color: "#fbbf24", bg: "rgba(245,158,11,0.1)" },
  ai_failed:      { color: "#f87171", bg: "rgba(239,68,68,0.1)" },
  user_requested: { color: "#d0bcff", bg: "rgba(160,120,255,0.1)" },
  complaint:      { color: "#f87171", bg: "rgba(239,68,68,0.1)" },
  order_status:   { color: "#60a5fa", bg: "rgba(59,130,246,0.1)" },
};

const th: React.CSSProperties = { padding: "10px 16px", fontSize: 10, fontWeight: 500, color: "#958ea0", letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid rgba(73,68,84,0.3)", background: "rgba(14,14,14,0.5)", textAlign: "left" as const };
const td: React.CSSProperties = { padding: "12px 16px", fontSize: 13, color: "#cbc3d7", borderBottom: "1px solid rgba(73,68,84,0.15)", verticalAlign: "middle" as const };

export default function HumanQueuePage() {
  const [queue, setQueue] = useState<QItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const sb = createClient();

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    const { data } = await sb.from("human_queue")
      .select("id,reason,priority,status,note,created_at,conversations(id,customers(id,name,platform,platform_id))")
      .eq("status", filter)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true });
    setQueue((data ?? []) as unknown as QItem[]);
    setLoading(false);
  };

  const resolve = async (itemId: string, convId: string, custId: string) => {
    await sb.from("human_queue").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", itemId);
    await sb.from("conversations").update({ is_locked_for_ai: false, status: "open" }).eq("id", convId);
    await sb.from("customers").update({ ai_reply_enabled: true }).eq("id", custId);
    setQueue(q => q.filter(i => i.id !== itemId));
  };

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [autoAssign, setAutoAssign] = useState(true);

  const counts = {
    ai_failed: queue.filter(q => q.reason === "ai_failed").length,
    return: queue.filter(q => q.reason === "return").length,
    complaint: queue.filter(q => q.reason === "complaint").length,
  };

  const filteredQueue = queue.filter(q => {
    if (categoryFilter === "all") return true;
    if (categoryFilter === "ai_failed") return q.reason === "ai_failed";
    if (categoryFilter === "return") return q.reason === "return";
    if (categoryFilter === "complaint") return q.reason === "complaint";
    return true;
  });

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header & Queue Metadata */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, borderBottom: "1px solid rgba(73,68,84,0.3)", paddingBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.025em", fontFamily: "Geist, system-ui", margin: 0 }}>
              Human Queue
            </h1>
            <p style={{ fontSize: 13, color: "#958ea0", marginTop: 4 }}>
              Conversations awaiting human response
            </p>
          </div>
          
          {/* Quick Action / Sync */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setAutoAssign(!autoAssign)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 6,
                background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.35)",
                color: "#e5e2e1", fontSize: 12, fontWeight: 500, cursor: "pointer",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: autoAssign ? "#22c55e" : "#958ea0" }} />
              Auto-assign {autoAssign ? "On" : "Off"}
            </button>
            <button
              onClick={load}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 6,
                background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.35)",
                color: "#e5e2e1", fontSize: 12, fontWeight: 500, cursor: "pointer",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#958ea0" }}>refresh</span>
              Refresh Queue
            </button>
          </div>
        </div>

        {/* Top summary stats inline chips/badges & Filter pills */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, paddingBottom: 16 }}>
          {/* Summary badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 6,
              background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
              color: "#f87171", fontSize: 11, fontWeight: 600,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />
              AI Failed: {counts.ai_failed || 3}
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 6,
              background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)",
              color: "#fbbf24", fontSize: 11, fontWeight: 600,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />
              Returns: {counts.return || 2}
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 6,
              background: "rgba(160,120,255,0.12)", border: "1px solid rgba(160,120,255,0.3)",
              color: "#d0bcff", fontSize: 11, fontWeight: 600,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#a078ff" }} />
              Complaints: {counts.complaint || 1}
            </div>
          </div>

          {/* Filter pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#1c1b1b", padding: 3, borderRadius: 6, border: "1px solid rgba(73,68,84,0.3)" }}>
            {[
              ["all", `All (${queue.length || 6})`],
              ["ai_failed", `AI Failed (${counts.ai_failed || 3})`],
              ["return", `Return Request (${counts.return || 2})`],
              ["complaint", `Complaint (${counts.complaint || 1})`],
            ].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setCategoryFilter(k)}
                style={{
                  padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 500,
                  cursor: "pointer", border: "none", fontFamily: "inherit",
                  background: categoryFilter === k ? "#2a2a2a" : "transparent",
                  color: categoryFilter === k ? "#e5e2e1" : "#958ea0",
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Queue Cards / Table */}
      <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Waiting Elapsed", "Customer & Channel", "Reason", "Conversation Preview / Note", "Actions"].map(h => (
              <th key={h} style={{ ...th, textAlign: h === "Actions" ? "right" : "left" as const }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {loading ? [...Array(4)].map((_, i) => (
              <tr key={i}><td colSpan={5} style={{ padding: "14px 16px" }}><div style={{ height: 26, background: "#201f1f", borderRadius: 4 }} /></td></tr>
            )) : filteredQueue.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: "60px", textAlign: "center", color: "#958ea0" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 44, opacity: 0.15, display: "block", margin: "0 auto 12px" }}>support_agent</span>
                No pending queue items
              </td></tr>
            ) : filteredQueue.map(item => {
              const rs = REASON_STYLE[item.reason] ?? { color: "#958ea0", bg: "rgba(73,68,84,0.2)" };
              const cust = item.conversations?.customers;
              return (
                <tr key={item.id}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#201f1f"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                  style={{ transition: "background 0.1s" }}
                >
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#fbbf24" }}>schedule</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#e5e2e1" }}>
                        Waiting {Math.max(1, Math.round((Date.now() - new Date(item.created_at).getTime()) / 60000))}m
                      </span>
                    </div>
                    <span style={{ fontSize: 10, color: "#958ea0" }}>{format(new Date(item.created_at), "h:mm a")}</span>
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#e5e2e1" }}>{cust?.name || "Customer"}</div>
                    <div style={{ fontSize: 11, color: "#958ea0", textTransform: "capitalize" }}>
                      {cust?.platform || "WhatsApp"}: {cust?.platform_id || "Direct"}
                    </div>
                  </td>
                  <td style={td}>
                    <span style={{
                      padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: rs.bg, color: rs.color, border: `1px solid ${rs.color}40`,
                      textTransform: "capitalize", display: "inline-block",
                    }}>
                      {item.reason.replace("_", " ")}
                    </span>
                  </td>
                  <td style={td}>
                    <div style={{ fontSize: 12, color: "#cbc3d7", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.note || "Customer requested human supervisor assistance."}
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <a
                        href={`/inbox?chat=${item.conversations?.id || ""}`}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "5px 12px", borderRadius: 4, background: "#a078ff",
                          color: "#340080", fontSize: 11, fontWeight: 600, textDecoration: "none",
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chat</span>
                        Take Over
                      </a>
                      <button
                        onClick={() => resolve(item.id, item.conversations?.id || "", cust?.id || "")}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "5px 10px", borderRadius: 4, background: "#201f1f",
                          border: "1px solid rgba(73,68,84,0.35)", color: "#e5e2e1",
                          fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#4ade80" }}>check</span>
                        Resolve
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
  );
}
