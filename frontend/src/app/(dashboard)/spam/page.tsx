"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, pageWrap, pageTitle, pageSubtitle, pageHeader, inputStyle, skeletonStyle, thStyle, tdStyle } from "@/lib/styles";
import { ShieldAlert, Search, Star, Trash2 } from "lucide-react";

type Cust = { id:string; name:string|null; platform:string; platform_id:string; spam_score:number; is_spam:boolean; ai_reply_enabled:boolean; is_vip:boolean };

export default function SpamPage() {
  const [custs, setCusts] = useState<Cust[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const sb = createClient();

  useEffect(()=>{ load(); },[]);

  const load = async () => {
    setLoading(true);
    const {data} = await sb.from("customers").select("*").or("is_spam.eq.true,ai_reply_enabled.eq.false,spam_score.gt.0").order("spam_score",{ascending:false});
    setCusts((data??[]) as Cust[]);
    setLoading(false);
  };

  const toggleAI = async (id:string, cur:boolean) => {
    await sb.from("customers").update({ai_reply_enabled:!cur}).eq("id",id);
    setCusts(cs=>cs.map(c=>c.id===id?{...c,ai_reply_enabled:!cur}:c));
  };

  const toggleVIP = async (id:string, cur:boolean) => {
    await sb.from("customers").update({is_vip:!cur,spam_score:0,is_spam:false}).eq("id",id);
    setCusts(cs=>cs.map(c=>c.id===id?{...c,is_vip:!cur,spam_score:0,is_spam:false}:c));
  };

  const reset = async (id:string) => {
    if(!confirm("Reset this customer's spam data?")) return;
    await sb.from("spam_entries").delete().eq("customer_id",id);
    await sb.from("customers").update({spam_score:0,is_spam:false,ai_reply_enabled:true}).eq("id",id);
    setCusts(cs=>cs.filter(c=>c.id!==id));
  };

  const shown = custs.filter(c=>!search||(c.name||c.platform_id||"").toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={pageWrap}>
      <div style={pageHeader}>
        <div>
          <h1 style={{ ...pageTitle, display:"flex", alignItems:"center", gap:10 }}>
            <ShieldAlert size={24} color="#f43f5e"/> Spam Guard
          </h1>
          <p style={pageSubtitle}>Review flagged users and manage AI access per customer</p>
        </div>
        <div style={{ position:"relative" }}>
          <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:C.textMuted, pointerEvents:"none" }}/>
          <input style={{ ...inputStyle, paddingLeft:30, width:220, fontSize:12 }} placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:0 }}>
          <thead>
            <tr>{["Customer","Spam Score","Flag","AI Reply","VIP","Reset"].map(h=><th key={h} style={{...thStyle,textAlign:h==="Reset"?"right":h==="AI Reply"||h==="VIP"?"center":thStyle.textAlign}}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? [...Array(4)].map((_,i)=><tr key={i}><td colSpan={6} style={{padding:"8px 16px"}}><div style={{...skeletonStyle,height:24}}/></td></tr>)
            : shown.length===0 ? (
              <tr><td colSpan={6} style={{padding:"60px",textAlign:"center",color:C.textMuted}}>
                <ShieldAlert size={44} style={{opacity:0.1,display:"block",margin:"0 auto 12px"}}/> No flagged customers
              </td></tr>
            ) : shown.map(c=>(
              <tr key={c.id}>
                <td style={tdStyle}>
                  <div style={{fontWeight:600,fontSize:13,color:C.textPrimary}}>{c.name||"Unknown"}</div>
                  <div style={{fontSize:11,color:C.textMuted,textTransform:"capitalize"}}>{c.platform}: {c.platform_id}</div>
                </td>
                <td style={tdStyle}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:64,height:5,background:C.overlay,borderRadius:99,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${Math.min(c.spam_score,100)}%`,background:`hsl(${120-c.spam_score*1.2},65%,52%)`,borderRadius:99}}/>
                    </div>
                    <span style={{fontSize:12,fontWeight:700,color:c.spam_score>70?"#fb7185":c.spam_score>40?"#fbbf24":C.textSecondary}}>{c.spam_score}</span>
                  </div>
                </td>
                <td style={tdStyle}>
                  {c.is_spam
                    ? <span style={{padding:"2px 9px",borderRadius:100,fontSize:10,fontWeight:700,background:"rgba(244,63,94,0.12)",color:"#fb7185"}}>Auto-flagged</span>
                    : <span style={{padding:"2px 9px",borderRadius:100,fontSize:10,fontWeight:700,background:"rgba(255,255,255,0.05)",color:C.textSecondary}}>Warning</span>
                  }
                </td>
                <td style={{...tdStyle,textAlign:"center"}}>
                  <button onClick={()=>toggleAI(c.id,c.ai_reply_enabled)} style={{
                    padding:"3px 10px", borderRadius:100, fontSize:11, fontWeight:700, cursor:"pointer", border:"none", fontFamily:"inherit",
                    background:c.ai_reply_enabled?"rgba(16,185,129,0.12)":"rgba(244,63,94,0.12)",
                    color:c.ai_reply_enabled?"#34d399":"#fb7185",
                  }}>
                    {c.ai_reply_enabled?"Enabled":"Disabled"}
                  </button>
                </td>
                <td style={{...tdStyle,textAlign:"center"}}>
                  <button onClick={()=>toggleVIP(c.id,c.is_vip)} style={{background:"none",border:"none",cursor:"pointer",display:"inline-flex",alignItems:"center",padding:4,borderRadius:6}}>
                    <Star size={16} style={{fill:c.is_vip?"#f59e0b":"none",color:c.is_vip?"#f59e0b":C.textMuted}}/>
                  </button>
                </td>
                <td style={{...tdStyle,textAlign:"right"}}>
                  <button onClick={()=>reset(c.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.textMuted,padding:4,display:"inline-flex",borderRadius:6}}>
                    <Trash2 size={14}/>
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
