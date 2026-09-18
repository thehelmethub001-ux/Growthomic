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

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 64px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid rgba(73,68,84,0.3)" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.025em", fontFamily: "Geist, system-ui", display: "flex", alignItems: "center", gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#fbbf24" }}>support_agent</span>
            Human Queue
          </h1>
          <p style={{ fontSize: 13, color: "#958ea0", marginTop: 4 }}>Resolve escalations and resume AI handling</p>
        </div>
        {filter === "pending" && queue.length > 0 && (
          <div style={{ padding: "6px 14px", borderRadius: 4, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 12, fontWeight: 600, color: "#f87171" }}>
            {queue.length} pending
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(73,68,84,0.3)", marginBottom: 24, gap: 2 }}>
        {["pending", "resolved"].map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            padding: "8px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", border: "none",
            fontFamily: "inherit", background: "transparent",
            borderBottom: filter === t ? "2px solid #a078ff" : "2px solid transparent",
            color: filter === t ? "#d0bcff" : "#958ea0", marginBottom: -1,
          }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Time", "Customer", "Reason", "Note", "Actions"].map(h => (
              <th key={h} style={{ ...th, textAlign: h === "Actions" ? "right" : "left" as const }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {loading ? [...Array(3)].map((_, i) => (
              <tr key={i}><td colSpan={5} style={{ padding: "10px 16px" }}><div style={{ height: 24, background: "#201f1f", borderRadius: 4 }} /></td></tr>
            )) : queue.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: "60px", textAlign: "center", color: "#958ea0" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 44, opacity: 0.1, display: "block", margin: "0 auto 12px" }}>support_agent</span>
                No {filter} items
              </td></tr>
            ) : queue.map(item => {
              const rs = REASON_STYLE[item.reason] ?? { color: "#958ea0", bg: "rgba(73,68,84,0.2)" };
              return (
                <tr key={item.id}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#201f1f"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                  style={{ transition: "background 0.1s" }}
                >
                  <td style={td}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e2e1" }}>{format(new Date(item.created_at), "h:mm a")}</div>
                    <div style={{ fontSize: 11, color: "#958ea0" }}>{format(new Date(item.created_at), "MMM d")}</div>
                    {item.priority === 2 && (
                      <span style={{ padding: "1px 7px", borderRadius: 100, fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", background: "rgba(239,68,68,0.1)", color: "#f87171" }}>HIGH PRIORITY</span>
                    )}
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: "#e5e2e1" }}>{item.conversations.customers.name || "Unknown"}</div>
                    <div style={{ fontSize: 11, color: "#958ea0", textTransform: "capitalize" }}>{item.conversations.customers.platform}</div>
                  </td>
                  <td style={td}>
                    <span style={{ padding: "2px 10px", borderRadius: 100, fontSize: 11, fontWeight: 500, background: rs.bg, color: rs.color, textTransform: "capitalize" }}>
                      {item.reason.replace("_", " ")}
                    </span>
                  </td>
                  <td style={td}><div style={{ fontSize: 12, color: "#958ea0", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.note || "—"}</div></td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <a href={`/inbox?chat=${item.conversations.id}`} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 4, fontSize: 12, fontWeight: 500, background: "#201f1f", color: "#cbc3d7", border: "1px solid rgba(73,68,84,0.4)", textDecoration: "none" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chat</span> Chat
                      </a>
                      {filter === "pending" && (
                        <button onClick={() => resolve(item.id, item.conversations.id, item.conversations.customers.id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 4, fontSize: 12, fontWeight: 600, background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)", cursor: "pointer", fontFamily: "inherit" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span> Resolve
                        </button>
                      )}
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
