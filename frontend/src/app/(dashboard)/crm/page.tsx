"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, pageWrap, pageTitle, pageSubtitle, pageHeader, inputStyle, skeletonStyle, thStyle, tdStyle } from "@/lib/styles";
import { Search, Star, Users } from "lucide-react";

type Customer = { id:string; name:string|null; platform:string; platform_id:string; spam_score:number; is_vip:boolean; is_spam:boolean; ai_reply_enabled:boolean; created_at:string };

const PLT_COLOR:Record<string,string> = { messenger:"hsl(217,89%,65%)", instagram:"hsl(330,75%,65%)", whatsapp:"hsl(142,65%,55%)" };

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
    <div style={{ ...pageWrap }}>
      <div style={pageHeader}>
        <div>
          <h1 style={pageTitle}>CRM</h1>
          <p style={pageSubtitle}>All customers across connected platforms</p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <div style={{ padding:"6px 14px", borderRadius:8, background:"hsla(262,83%,58%,0.1)", border:"1px solid hsla(262,83%,58%,0.2)", fontSize:12, fontWeight:600, color:"var(--primary-light)", display:"flex", alignItems:"center", gap:6 }}>
            <Users size={13}/> {customers.length} Total Customers
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:10, marginBottom:20, alignItems:"center" }}>
        <div style={{ position:"relative", flex:1, maxWidth:320 }}>
          <Search size={12} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)", pointerEvents:"none" }}/>
          <input style={{ ...inputStyle, paddingLeft:30, fontSize:12 }} placeholder="Search customers..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {[["all","All"],["messenger","Messenger"],["instagram","Instagram"],["whatsapp","WhatsApp"]].map(([v,l]) => (
            <button key={v} onClick={()=>setPlatform(v)} style={{
              padding:"7px 13px", borderRadius:8, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"inherit",
              background: platform===v?"hsla(262,83%,58%,0.14)":"var(--bg-elevated)",
              color: platform===v?"var(--primary-light)":"var(--text-muted)",
              border: platform===v?"1px solid hsla(262,83%,58%,0.3)":"1px solid var(--border-white)",
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        {[
          { label:"Total Customers", value:customers.length, color:"var(--primary-light)", bg:"hsla(262,83%,58%,0.08)" },
          { label:"VIP Customers",   value:customers.filter(c=>c.is_vip).length,   color:"hsl(38,90%,65%)", bg:"hsla(38,90%,55%,0.08)" },
          { label:"AI Disabled",     value:customers.filter(c=>!c.ai_reply_enabled).length, color:"hsl(350,85%,70%)", bg:"hsla(350,85%,60%,0.08)" },
          { label:"Flagged Spam",    value:customers.filter(c=>c.is_spam).length,  color:"hsl(217,89%,65%)", bg:"hsla(217,89%,61%,0.08)" },
        ].map(s => (
          <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.bg.replace("0.08","0.2")}`, borderRadius:12, padding:"14px 18px" }}>
            <div style={{ fontSize:22, fontWeight:700, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background:"var(--bg-card)", border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:0 }}>
          <thead>
            <tr>{["Customer","Platform","Spam Score","Status","AI Reply","VIP"].map(h=>(
              <th key={h} style={{ ...thStyle, textAlign:h==="VIP"?"center":h==="AI Reply"?"center":thStyle.textAlign }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {loading ? [...Array(5)].map((_,i) => (
              <tr key={i}><td colSpan={6} style={{ padding:"8px 16px" }}><div style={{ ...skeletonStyle, height:24 }}/></td></tr>
            )) : shown.length === 0 ? (
              <tr><td colSpan={6} style={{ padding:"60px", textAlign:"center", color:"var(--text-muted)" }}>
                <Users size={40} style={{ opacity:0.1, display:"block", margin:"0 auto 10px" }}/>
                No customers found in database
              </td></tr>
            ) : shown.map(c => (
              <tr key={c.id}>
                <td style={tdStyle}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:"hsla(262,83%,58%,0.1)", border:"1px solid hsla(262,83%,58%,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"var(--primary-light)", flexShrink:0 }}>
                      {(c.name||"?")[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight:600, fontSize:13, color:"var(--text-primary)" }}>{c.name||"Unknown"}</div>
                      <div style={{ fontSize:11, color:"var(--text-muted)" }}>{c.platform_id}</div>
                    </div>
                  </div>
                </td>
                <td style={tdStyle}>
                  <span style={{ padding:"2px 10px", borderRadius:100, fontSize:11, fontWeight:600, background:`${PLT_COLOR[c.platform]||"var(--primary-light)"}22`, color:PLT_COLOR[c.platform]||"var(--primary-light)", textTransform:"capitalize" }}>
                    {c.platform}
                  </span>
                </td>
                <td style={tdStyle}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:60, height:4, background:"var(--bg-overlay)", borderRadius:99, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${Math.min(c.spam_score,100)}%`, background:`hsl(${120-c.spam_score*1.2},65%,52%)`, borderRadius:99 }}/>
                    </div>
                    <span style={{ fontSize:12, fontWeight:600, color:c.spam_score>70?"hsl(350,85%,70%)":c.spam_score>40?"hsl(38,90%,65%)":"var(--text-secondary)" }}>{c.spam_score}</span>
                  </div>
                </td>
                <td style={tdStyle}>
                  {c.is_spam
                    ? <span style={{ padding:"2px 9px", borderRadius:100, fontSize:10, fontWeight:700, background:"hsla(350,85%,60%,0.12)", color:"hsl(350,85%,70%)" }}>Spam</span>
                    : <span style={{ padding:"2px 9px", borderRadius:100, fontSize:10, fontWeight:700, background:"hsla(152,60%,50%,0.1)", color:"hsl(152,60%,60%)" }}>Clean</span>
                  }
                </td>
                <td style={{ ...tdStyle, textAlign:"center" }}>
                  <button onClick={() => toggleAIReply(c.id, c.ai_reply_enabled)} style={{ border:"none", cursor:"pointer", background:"none", padding:0 }}>
                    <span style={{ padding:"4px 12px", borderRadius:100, fontSize:11, fontWeight:700, background:c.ai_reply_enabled?"hsla(152,60%,50%,0.1)":"hsla(350,85%,60%,0.1)", color:c.ai_reply_enabled?"hsl(152,60%,60%)":"hsl(350,85%,70%)", transition:"all 0.2s" }}>
                      {c.ai_reply_enabled ? "On" : "Off"}
                    </span>
                  </button>
                </td>
                <td style={{ ...tdStyle, textAlign:"center" }}>
                  <button onClick={()=>toggleVIP(c.id,c.is_vip)} style={{ background:"none", border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", padding:4, borderRadius:6 }}>
                    <Star size={15} style={{ fill:c.is_vip?"hsl(38,90%,65%)":"none", color:c.is_vip?"hsl(38,90%,65%)":"var(--text-muted)" }}/>
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
