"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Cust = { id:string; name:string|null; platform:string; platform_id:string; spam_score:number; is_spam:boolean; ai_reply_enabled:boolean; is_vip:boolean };

const th: React.CSSProperties = { padding: "10px 16px", fontSize: 10, fontWeight: 500, color: "#958ea0", letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid rgba(73,68,84,0.3)", background: "rgba(14,14,14,0.5)", textAlign: "left" as const };
const td: React.CSSProperties = { padding: "10px 16px", fontSize: 13, color: "#cbc3d7", borderBottom: "1px solid rgba(73,68,84,0.15)", verticalAlign: "middle" as const };

export default function SpamPage() {
  const [custs, setCusts] = useState<Cust[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const sb = createClient();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await sb.from("customers").select("*").or("is_spam.eq.true,ai_reply_enabled.eq.false,spam_score.gt.0").order("spam_score", { ascending: false });
    setCusts((data ?? []) as Cust[]);
    setLoading(false);
  };

  const toggleAI = async (id: string, cur: boolean) => {
    await sb.from("customers").update({ ai_reply_enabled: !cur }).eq("id", id);
    setCusts(cs => cs.map(c => c.id === id ? { ...c, ai_reply_enabled: !cur } : c));
  };

  const toggleVIP = async (id: string, cur: boolean) => {
    await sb.from("customers").update({ is_vip: !cur, spam_score: 0, is_spam: false }).eq("id", id);
    setCusts(cs => cs.map(c => c.id === id ? { ...c, is_vip: !cur, spam_score: 0, is_spam: false } : c));
  };

  const reset = async (id: string) => {
    if (!confirm("Reset this customer's spam data?")) return;
    await sb.from("spam_entries").delete().eq("customer_id", id);
    await sb.from("customers").update({ spam_score: 0, is_spam: false, ai_reply_enabled: true }).eq("id", id);
    setCusts(cs => cs.filter(c => c.id !== id));
  };

  const shown = custs.filter(c => !search || (c.name || c.platform_id || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 64px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid rgba(73,68,84,0.3)" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.025em", fontFamily: "Geist, system-ui", display: "flex", alignItems: "center", gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#f87171" }}>shield_lock</span>
            Spam Guard
          </h1>
          <p style={{ fontSize: 13, color: "#958ea0", marginTop: 4 }}>Review flagged users and manage AI access per customer</p>
        </div>
        <div style={{ position: "relative" }}>
          <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "#958ea0", pointerEvents: "none" }}>search</span>
          <input
            style={{ paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, width: 220, background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 4, color: "#e5e2e1", fontSize: 12, outline: "none", fontFamily: "inherit" }}
            placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Customer", "Spam Score", "Flag", "AI Reply", "VIP", "Reset"].map(h =>
              <th key={h} style={{ ...th, textAlign: (h === "Reset" ? "right" : h === "AI Reply" || h === "VIP" ? "center" : "left") as any }}>{h}</th>
            )}</tr>
          </thead>
          <tbody>
            {loading ? [...Array(4)].map((_, i) => (
              <tr key={i}><td colSpan={6} style={{ padding: "10px 16px" }}><div style={{ height: 24, background: "#201f1f", borderRadius: 4 }} /></td></tr>
            )) : shown.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "60px", textAlign: "center", color: "#958ea0" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 44, opacity: 0.1, display: "block", margin: "0 auto 12px" }}>shield_lock</span>
                No flagged customers
              </td></tr>
            ) : shown.map(c => (
              <tr key={c.id}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#201f1f"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                style={{ transition: "background 0.1s" }}
              >
                <td style={td}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: "#e5e2e1" }}>{c.name || "Unknown"}</div>
                  <div style={{ fontSize: 11, color: "#958ea0", textTransform: "capitalize" }}>{c.platform}: {c.platform_id}</div>
                </td>
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 64, height: 5, background: "#201f1f", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(c.spam_score, 100)}%`, background: c.spam_score > 70 ? "#f87171" : c.spam_score > 40 ? "#fbbf24" : "#4ade80", borderRadius: 99 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: c.spam_score > 70 ? "#f87171" : c.spam_score > 40 ? "#fbbf24" : "#cbc3d7" }}>{c.spam_score}</span>
                  </div>
                </td>
                <td style={td}>
                  <span style={{ padding: "2px 10px", borderRadius: 100, fontSize: 11, fontWeight: 500, background: c.is_spam ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)", color: c.is_spam ? "#f87171" : "#fbbf24" }}>
                    {c.is_spam ? "Auto-flagged" : "Warning"}
                  </span>
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  <button onClick={() => toggleAI(c.id, c.ai_reply_enabled)} style={{ border: "none", cursor: "pointer", background: "none", padding: 0 }}>
                    <span style={{ padding: "2px 10px", borderRadius: 100, fontSize: 11, fontWeight: 500, background: c.ai_reply_enabled ? "rgba(34,197,94,0.1)" : "rgba(73,68,84,0.2)", color: c.ai_reply_enabled ? "#4ade80" : "#958ea0" }}>
                      {c.ai_reply_enabled ? "Enabled" : "Disabled"}
                    </span>
                  </button>
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  <button onClick={() => toggleVIP(c.id, c.is_vip)} style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", padding: 4, borderRadius: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: c.is_vip ? "#fbbf24" : "#494454", fontVariationSettings: c.is_vip ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                  </button>
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button onClick={() => reset(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#958ea0", padding: 4, display: "inline-flex", borderRadius: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
