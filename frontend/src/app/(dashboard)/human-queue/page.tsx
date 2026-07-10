"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, pageWrap, pageTitle, pageSubtitle, pageHeader, skeletonStyle, thStyle, tdStyle } from "@/lib/styles";
import { CheckCircle2, MessageSquare, UserRoundX } from "lucide-react";
import { format } from "date-fns";

type QItem = { id:string; reason:string; priority:number; status:string; note:string|null; created_at:string; conversations:{ id:string; customers:{ id:string; name:string|null; platform:string; platform_id:string } } };
const rColors:Record<string,[string,string]> = { return:["hsl(38,90%,65%)","hsla(38,90%,55%,0.12)"], ai_failed:["hsl(350,85%,70%)","hsla(350,85%,60%,0.12)"], user_requested:["var(--primary-light)","hsla(262,83%,58%,0.12)"] };

export default function HumanQueuePage() {
  const [queue, setQueue] = useState<QItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const sb = createClient();

  useEffect(()=>{ load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    const {data} = await sb.from("human_queue").select("id,reason,priority,status,note,created_at,conversations(id,customers(id,name,platform,platform_id))").eq("status",filter).order("priority",{ascending:false}).order("created_at",{ascending:true});
    setQueue((data??[]) as unknown as QItem[]);
    setLoading(false);
  };

  const resolve = async (itemId:string, convId:string, custId:string) => {
    await sb.from("human_queue").update({status:"resolved",resolved_at:new Date().toISOString()}).eq("id",itemId);
    await sb.from("conversations").update({is_locked_for_ai:false,status:"open"}).eq("id",convId);
    await sb.from("customers").update({ai_reply_enabled:true}).eq("id",custId);
    setQueue(q=>q.filter(i=>i.id!==itemId));
  };

  return (
    <div style={pageWrap}>
      <div style={pageHeader}>
        <div>
          <h1 style={{ ...pageTitle, display:"flex", alignItems:"center", gap:10 }}>
            <UserRoundX size={24} color="#f59e0b"/> Human Queue
          </h1>
          <p style={pageSubtitle}>Resolve escalations and resume AI handling</p>
        </div>
        {filter==="pending" && queue.length>0 && (
          <div style={{ padding:"6px 14px", borderRadius:8, background:"hsla(350,85%,60%,0.1)", border:"1px solid hsla(350,85%,60%,0.22)", fontSize:12, fontWeight:600, color:"hsl(350,85%,70%)" }}>
            {queue.length} pending
          </div>
        )}
      </div>

      <div style={{ display:"flex", borderBottom:`1px solid ${C.borderWhite}`, marginBottom:24, gap:2 }}>
        {["pending","resolved"].map(t=>(
          <button key={t} onClick={()=>setFilter(t)} style={{
            padding:"8px 14px", fontSize:12, fontWeight:500, cursor:"pointer", border:"none", fontFamily:"inherit", background:"transparent",
            borderBottom: filter===t?`2px solid var(--primary)`:"2px solid transparent",
            color: filter===t?"var(--primary-light)":C.textMuted, marginBottom:-1,
          }}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:0 }}>
          <thead>
            <tr>{["Time","Customer","Reason","Note","Actions"].map(h=><th key={h} style={{...thStyle,textAlign:h==="Actions"?"right":thStyle.textAlign}}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? [...Array(3)].map((_,i)=><tr key={i}><td colSpan={5} style={{padding:"8px 16px"}}><div style={{...skeletonStyle,height:24}}/></td></tr>)
            : queue.length===0 ? (
              <tr><td colSpan={5} style={{padding:"60px",textAlign:"center",color:C.textMuted}}>
                <UserRoundX size={44} style={{opacity:0.1,display:"block",margin:"0 auto 12px"}}/> No {filter} items
              </td></tr>
            ) : queue.map(item=>{
              const [bc,bbg]=rColors[item.reason]??[C.textMuted,C.elevated];
              return (
                <tr key={item.id}>
                  <td style={tdStyle}>
                    <div style={{fontSize:13,fontWeight:600,color:C.textPrimary}}>{format(new Date(item.created_at),"h:mm a")}</div>
                    <div style={{fontSize:11,color:C.textMuted}}>{format(new Date(item.created_at),"MMM d")}</div>
                    {item.priority===2&&<div style={{fontSize:9,fontWeight:800,color:"#fb7185",letterSpacing:"0.06em",marginTop:2}}>HIGH PRIORITY</div>}
                  </td>
                  <td style={tdStyle}>
                    <div style={{fontWeight:600,fontSize:13,color:C.textPrimary}}>{item.conversations.customers.name||"Unknown"}</div>
                    <div style={{fontSize:11,color:C.textMuted,textTransform:"capitalize"}}>{item.conversations.customers.platform}</div>
                  </td>
                  <td style={tdStyle}><span style={{padding:"3px 10px",borderRadius:100,fontSize:11,fontWeight:700,background:bbg,color:bc}}>{item.reason}</span></td>
                  <td style={tdStyle}><div style={{fontSize:12,color:C.textMuted,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.note||"—"}</div></td>
                  <td style={{...tdStyle,textAlign:"right"}}>
                    <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
                      <a href="/inbox" style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:600,background:C.elevated,color:C.textSecondary,border:`1px solid ${C.border}`}}>
                        <MessageSquare size={12}/> Chat
                      </a>
                      {filter==="pending"&&(
                        <button onClick={()=>resolve(item.id,item.conversations.id,item.conversations.customers.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:600,background:"rgba(16,185,129,0.1)",color:"#34d399",border:"1px solid rgba(16,185,129,0.2)",cursor:"pointer",fontFamily:"inherit"}}>
                          <CheckCircle2 size={12}/> Resolve
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
