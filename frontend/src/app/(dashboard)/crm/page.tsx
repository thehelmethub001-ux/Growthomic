"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCustomerAvatar } from "@/lib/styles";

type Customer = { id:string; name:string|null; platform:string; platform_id:string; spam_score:number; is_vip:boolean; is_spam:boolean; ai_reply_enabled:boolean; created_at:string };

const PLT = { messenger: { bg: "rgba(59,130,246,0.1)", color: "#60a5fa" }, instagram: { bg: "rgba(139,92,246,0.1)", color: "#a78bfa" }, whatsapp: { bg: "rgba(34,197,94,0.1)", color: "#4ade80" } } as Record<string,{bg:string;color:string}>;

const th: React.CSSProperties = { padding: "10px 16px", fontSize: 10, fontWeight: 500, color: "#958ea0", letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid rgba(73,68,84,0.3)", background: "rgba(14,14,14,0.5)", textAlign: "left" as const };
const td: React.CSSProperties = { padding: "10px 16px", fontSize: 13, color: "#cbc3d7", borderBottom: "1px solid rgba(73,68,84,0.15)", verticalAlign: "middle" as const };

export default function CRMPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const sb = createClient();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await sb.from("customers").select("*").order("created_at",{ascending:false});
      if (data) setCustomers(data as Customer[]);
      setLoading(false);
    })();
  }, []);

  const shown = customers.filter(c =>
    (platform === "all" || c.platform === platform) &&
    (!search || (c.name||c.platform_id||"").toLowerCase().includes(search.toLowerCase()))
  );

  const toggleVIP = async (id:string, v:boolean) => {
    await sb.from("customers").update({is_vip:!v}).eq("id",id);
    setCustomers(cs => cs.map(c => c.id===id ? {...c,is_vip:!v} : c));
  };

  const toggleAIReply = async (id:string, current:boolean) => {
    await sb.from("customers").update({ai_reply_enabled:!current}).eq("id",id);
    setCustomers(cs => cs.map(c => c.id===id ? {...c,ai_reply_enabled:!current} : c));
  };

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 64px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid rgba(73,68,84,0.3)" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.025em", fontFamily: "Geist, system-ui" }}>CRM</h1>
          <p style={{ fontSize: 13, color: "#958ea0", marginTop: 4 }}>All customers across connected platforms</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 4, background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", fontSize: 12, fontWeight: 500, color: "#e5e2e1" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#958ea0" }}>people</span>
          {customers.length} Total Customers
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "#958ea0", pointerEvents: "none" }}>search</span>
          <input style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 4, color: "#e5e2e1", fontSize: 12, outline: "none", fontFamily: "inherit" }} placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {([["all","All"],["messenger","Messenger"],["instagram","Instagram"],["whatsapp","WhatsApp"]] as [string,string][]).map(([v,l]) => (
            <button key={v} onClick={() => setPlatform(v)} style={{ padding: "7px 13px", borderRadius: 4, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", background: platform===v ? "#1c1b1b" : "transparent", color: platform===v ? "#e5e2e1" : "#958ea0", border: platform===v ? "1px solid rgba(73,68,84,0.5)" : "1px solid transparent" }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Customers", value: customers.length,                          color: "#e5e2e1",  icon: "people" },
          { label: "VIP Customers",   value: customers.filter(c => c.is_vip).length,   color: "#fbbf24",  icon: "star" },
          { label: "AI Disabled",     value: customers.filter(c => !c.ai_reply_enabled).length, color: "#f87171", icon: "smart_toy" },
          { label: "Flagged Spam",    value: customers.filter(c => c.is_spam).length,  color: "#d0bcff",  icon: "block" },
        ].map(s => (
          <div key={s.label} style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 8, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 600, color: s.color, letterSpacing: "-0.02em", fontFamily: "Geist, system-ui" }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#958ea0", marginTop: 4, fontWeight: 500 }}>{s.label}</div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "rgba(73,68,84,0.6)" }}>{s.icon}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Customer","Platform","Spam Score","Status","AI Reply","VIP"].map(h => (
              <th key={h} style={{ ...th, textAlign: (h==="VIP"||h==="AI Reply") ? "center" : "left" as const }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {loading ? [...Array(5)].map((_,i) => (
              <tr key={i}><td colSpan={6} style={{ padding: "10px 16px" }}><div style={{ height: 24, background: "#201f1f", borderRadius: 4 }} /></td></tr>
            )) : shown.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "60px", textAlign: "center", color: "#958ea0" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: 0.1, display: "block", margin: "0 auto 10px" }}>people</span>
                No customers found in database
              </td></tr>
            ) : shown.map(c => {
              const av = getCustomerAvatar(c.id, c.name);
              const plt = PLT[c.platform] || { bg: "rgba(73,68,84,0.2)", color: "#958ea0" };
              return (
              <tr key={c.id}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#201f1f"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                style={{ transition: "background 0.1s" }}
              >
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 4, background: av.gradient, border: `1px solid ${av.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "#fff", flexShrink: 0 }}>{av.initial}</div>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13, color: "#e5e2e1" }}>{c.name || "Unknown Customer"}</div>
                      <div style={{ fontSize: 11, color: "#958ea0" }}>{c.platform_id}</div>
                    </div>
                  </div>
                </td>
                <td style={td}>
                  <span style={{ padding: "2px 10px", borderRadius: 100, fontSize: 11, fontWeight: 500, background: plt.bg, color: plt.color, textTransform: "capitalize" }}>{c.platform}</span>
                </td>
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 60, height: 4, background: "#201f1f", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(c.spam_score,100)}%`, background: c.spam_score>70?"#f87171":c.spam_score>40?"#fbbf24":"#4ade80", borderRadius: 99 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: c.spam_score>70?"#f87171":c.spam_score>40?"#fbbf24":"#cbc3d7" }}>{c.spam_score}</span>
                  </div>
                </td>
                <td style={td}>
                  <span style={{ padding: "2px 10px", borderRadius: 100, fontSize: 11, fontWeight: 500, background: c.is_spam ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", color: c.is_spam ? "#f87171" : "#4ade80" }}>{c.is_spam ? "Spam" : "Clean"}</span>
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  <button onClick={() => toggleAIReply(c.id, c.ai_reply_enabled)} style={{ border: "none", cursor: "pointer", background: "none", padding: 0 }}>
                    <span style={{ padding: "2px 10px", borderRadius: 100, fontSize: 11, fontWeight: 500, background: c.ai_reply_enabled ? "rgba(34,197,94,0.1)" : "rgba(73,68,84,0.2)", color: c.ai_reply_enabled ? "#4ade80" : "#958ea0", transition: "all 0.2s" }}>{c.ai_reply_enabled ? "On" : "Off"}</span>
                  </button>
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  <button onClick={() => toggleVIP(c.id, c.is_vip)} style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", padding: 4, borderRadius: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: c.is_vip ? "#fbbf24" : "#494454", fontVariationSettings: c.is_vip ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                  </button>
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
