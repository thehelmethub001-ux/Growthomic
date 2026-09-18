"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { pageWrap, pageTitle, pageSubtitle, pageHeader, inputStyle, skeletonStyle, thStyle, tdStyle, getCustomerAvatar } from "@/lib/styles";
import { Search, Star, Users } from "lucide-react";

type Customer = { id:string; name:string|null; platform:string; platform_id:string; spam_score:number; is_vip:boolean; is_spam:boolean; ai_reply_enabled:boolean; created_at:string };

const PLT_COLOR:Record<string,string> = { messenger:"cyan", instagram:"purple", whatsapp:"green" };

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
          <div style={{ padding:"6px 14px", borderRadius:"var(--r-md)", background:"var(--bg-elevated)", border:"1px solid var(--border)", fontSize:12, fontWeight:500, color:"var(--text-primary)", display:"flex", alignItems:"center", gap:6 }}>
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
              padding:"7px 13px", borderRadius:"var(--r-md)", fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"inherit",
              background: platform===v?"var(--bg-elevated)":"transparent",
              color: platform===v?"var(--text-primary)":"var(--text-muted)",
              border: platform===v?"1px solid var(--border)":"1px solid transparent",
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        {[
          { label:"Total Customers", value:customers.length, color:"var(--text-primary)" },
          { label:"VIP Customers",   value:customers.filter(c=>c.is_vip).length,   color:"var(--amber-light)" },
          { label:"AI Disabled",     value:customers.filter(c=>!c.ai_reply_enabled).length, color:"var(--red-light)" },
          { label:"Flagged Spam",    value:customers.filter(c=>c.is_spam).length,  color:"var(--brand-light)" },
        ].map(s => (
          <div key={s.label} style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--r-lg)", padding:"16px 20px" }}>
            <div style={{ fontSize:22, fontWeight:600, color:s.color, letterSpacing:"-0.02em" }}>{s.value}</div>
            <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:4, fontWeight:500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--r-lg)", overflow:"hidden" }}>
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
            ) : shown.map(c => {
              const av = getCustomerAvatar(c.id, c.name);
              return (
              <tr key={c.id}>
                <td style={tdStyle}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{
                      width:32, height:32, borderRadius:"var(--r-md)",
                      background: av.gradient, border: `1px solid ${av.border}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:12, fontWeight:600, color:"#fff", flexShrink:0
                    }}>
                      {av.initial}
                    </div>
                    <div>
                      <div style={{ fontWeight:600, fontSize:13, color:"var(--text-primary)" }}>{c.name||"Unknown Customer"}</div>
                      <div style={{ fontSize:11, color:"var(--text-muted)" }}>{c.platform_id}</div>
                    </div>
                  </div>
                </td>
                <td style={tdStyle}>
                  <span className={`badge badge-${PLT_COLOR[c.platform] || "muted"}`} style={{textTransform:"capitalize"}}>
                    {c.platform}
                  </span>
                </td>
                <td style={tdStyle}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:60, height:4, background:"var(--bg-elevated)", borderRadius:99, overflow:"hidden", border:"1px solid var(--border)" }}>
                      <div style={{ height:"100%", width:`${Math.min(c.spam_score,100)}%`, background:`var(${c.spam_score>70?"--red-light":c.spam_score>40?"--amber-light":"--green-light"})`, borderRadius:99 }}/>
                    </div>
                    <span style={{ fontSize:12, fontWeight:600, color:c.spam_score>70?"var(--red-light)":c.spam_score>40?"var(--amber-light)":"var(--text-secondary)" }}>{c.spam_score}</span>
                  </div>
                </td>
                <td style={tdStyle}>
                  {c.is_spam
                    ? <span className="badge badge-red">Spam</span>
                    : <span className="badge badge-green">Clean</span>
                  }
                </td>
                <td style={{ ...tdStyle, textAlign:"center" }}>
                  <button onClick={() => toggleAIReply(c.id, c.ai_reply_enabled)} style={{ border:"none", cursor:"pointer", background:"none", padding:0 }}>
                    <span className={c.ai_reply_enabled ? "badge badge-green" : "badge badge-muted"} style={{transition:"all 0.2s"}}>
                      {c.ai_reply_enabled ? "On" : "Off"}
                    </span>
                  </button>
                </td>
                <td style={{ ...tdStyle, textAlign:"center" }}>
                  <button onClick={()=>toggleVIP(c.id,c.is_vip)} style={{ background:"none", border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", padding:4, borderRadius:6 }}>
                    <Star size={15} style={{ fill:c.is_vip?"var(--amber-light)":"none", color:c.is_vip?"var(--amber-light)":"var(--text-muted)" }}/>
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
