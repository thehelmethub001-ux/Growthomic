"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, inputStyle, skeletonStyle } from "@/lib/styles";
import { MessageSquare, Pause, Play, Search, User, Clock, Star } from "lucide-react";
import { format } from "date-fns";

type Conv = { id:string; platform:string; status:string; is_locked_for_ai:boolean; updated_at:string; customers:{id:string; name:string|null;platform_id:string;spam_score?:number;is_vip?:boolean;profile_pic?:string|null} };
type Msg  = { id:string; role:string; content:string|null; media_type:string|null; media_url?:string|null; created_at:string };

const pColors: Record<string,[string,string]> = {
  messenger: ["hsla(217,89%,61%,0.12)","hsl(217,89%,65%)"],
  instagram: ["hsla(330,75%,65%,0.12)","hsl(330,75%,65%)"],
  whatsapp:  ["hsla(142,65%,50%,0.12)","hsl(142,65%,55%)"],
};

export default function InboxPage() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [selId, setSelId] = useState<string|null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [search, setSearch] = useState("");
  const sb = createClient();
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  // Direct and bulletproof auto-scroll to bottom of chat container
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight + 10000;
      }
      if (msgsEndRef.current) {
        msgsEndRef.current.scrollIntoView({ behavior: "instant", block: "end", inline: "nearest" });
      }
    });
  }, []);

  useEffect(() => {
    if (msgs.length > 0) {
      scrollToBottom();
      const t1 = setTimeout(scrollToBottom, 50);
      const t2 = setTimeout(scrollToBottom, 150);
      const t3 = setTimeout(scrollToBottom, 350);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  }, [msgs, selId, scrollToBottom]);

  const loadConvs = useCallback(async () => {
    let q = sb.from("conversations").select("id,platform,status,is_locked_for_ai,updated_at,customers(id,name,platform_id,spam_score,is_vip,profile_pic)").order("updated_at",{ascending:false});
    if (filter !== "all") q = q.eq("status", filter);
    if (platformFilter !== "all") q = q.eq("platform", platformFilter);
    const { data } = await q;
    if (data) setConvs(data as unknown as Conv[]);
    setLoading(false);
  }, [filter, platformFilter]);

  // Load conversations initial & on filter change
  useEffect(() => { loadConvs(); }, [loadConvs]);

  // Read ?chat= parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chatParam = params.get("chat");
    if (chatParam) {
      setSelId(chatParam);
      window.history.replaceState({}, '', '/inbox');
    }
  }, []);

  // ── Real-time: conversations list
  useEffect(() => {
    const convChannel = sb.channel("global-inbox-changes")
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        loadConvs();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        loadConvs();
      })
      .subscribe();

    return () => { sb.removeChannel(convChannel); };
  }, [loadConvs]);

  // ── Real-time: messages in selected conversation
  useEffect(() => { 
    if (selId) {
      loadMsgs(selId);
      
      const channel = sb.channel(`chat-msgs-${selId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selId}` }, payload => {
          const newMsg = payload.new as Msg;
          setMsgs(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          setTimeout(scrollToBottom, 50);
        })
        .subscribe();
        
      return () => { sb.removeChannel(channel); };
    } else {
      setMsgs([]);
    }
  }, [selId]);

  const loadMsgs = async (id:string) => {
    const { data } = await sb.from("messages").select("*").eq("conversation_id",id).order("created_at",{ascending:true});
    if (data) {
      setMsgs(data as Msg[]);
      requestAnimationFrame(() => {
        scrollToBottom();
        setTimeout(scrollToBottom, 50);
        setTimeout(scrollToBottom, 200);
      });
    }
  };

  const toggleAI = async (id:string, locked:boolean) => {
    await sb.from("conversations").update({is_locked_for_ai:!locked}).eq("id",id);
    setConvs(cs => cs.map(c => c.id===id ? {...c,is_locked_for_ai:!locked} : c));
  };
  
  const toggleVIP = async (custId:string, v:boolean) => {
    await sb.from("customers").update({is_vip:!v}).eq("id",custId);
    setConvs(cs => cs.map(c => c.customers.id===custId ? {...c,customers:{...c.customers,is_vip:!v}} : c));
  };

  const shown = convs.filter(c => !search || (c.customers.name||c.customers.platform_id||"").toLowerCase().includes(search.toLowerCase()));
  const sel = convs.find(c => c.id===selId);
  const initials = sel ? (sel.customers.name||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2) : "";

  return (
    <div style={{ display:"flex", height:"calc(100vh - 52px)", overflow:"hidden" }}>

      {/* ── Left: Conversation List ─────── */}
      <div style={{ width:280, minWidth:280, borderRight:`1px solid ${C.borderWhite}`, display:"flex", flexDirection:"column", background:"var(--bg-card)", flexShrink:0 }}>
        <div style={{ padding:"16px 12px 12px", borderBottom:`1px solid ${C.borderWhite}` }}>
          <div style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)", letterSpacing:"-0.02em", marginBottom:10 }}>Conversations</div>
          <div style={{ position:"relative", marginBottom:8 }}>
            <Search size={12} style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)", pointerEvents:"none" }}/>
            <input style={{ ...inputStyle, paddingLeft:28, fontSize:12 }} placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div style={{ display:"flex", gap:3, marginBottom:8, flexWrap:"wrap" }}>
            {[["all","All"],["open","Active"],["human_queue","Human"],["spam_queue","Spam"]].map(([v,l]) => (
              <button key={v} onClick={()=>setFilter(v)} style={{
                padding:"3px 8px", borderRadius:6, fontSize:11, fontWeight:500, cursor:"pointer", border:"none", fontFamily:"inherit",
                background: filter===v?"hsla(262,83%,58%,0.14)":"transparent",
                color: filter===v?"var(--primary-light)":"var(--text-muted)",
              }}>{l}</button>
            ))}
          </div>
          <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
            {[["all","All Platforms"],["messenger","Messenger"],["instagram","Instagram"],["whatsapp","WhatsApp"]].map(([v,l]) => (
              <button key={v} onClick={()=>setPlatformFilter(v)} style={{
                padding:"3px 8px", borderRadius:6, fontSize:10, fontWeight:500, cursor:"pointer", border:"1px solid var(--border-white)", fontFamily:"inherit",
                background: platformFilter===v?"var(--bg-elevated)":"transparent",
                color: platformFilter===v?"var(--text-primary)":"var(--text-muted)",
              }}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:6 }}>
          {loading ? [...Array(4)].map((_,i) => (
            <div key={i} style={{ ...skeletonStyle, height:66, borderRadius:10, marginBottom:4 }}/>
          )) : shown.length === 0 ? (
            <div style={{ padding:32, textAlign:"center", color:"var(--text-muted)", fontSize:13 }}>No conversations</div>
          ) : shown.map(c => {
            const [pbg,pc] = pColors[c.platform] ?? pColors.messenger;
            const active = selId === c.id;
            return (
              <button key={c.id} onClick={()=>setSelId(c.id)} style={{
                width:"100%", textAlign:"left", padding:"10px 11px", borderRadius:10, cursor:"pointer", border:"none",
                background: active?"hsla(262,83%,58%,0.08)":"transparent",
                boxShadow: active?"inset 0 0 0 1px var(--border-strong)":"none",
                display:"block", marginBottom:2, transition:"all 0.12s",
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, alignItems:"center" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, overflow:"hidden", flex:1, minWidth:0 }}>
                    {c.customers.profile_pic ? (
                      <img src={c.customers.profile_pic} alt="" style={{ width:22, height:22, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />
                    ) : (
                      <div style={{ width:22, height:22, borderRadius:"50%", background:"var(--bg-elevated)", border:`1px solid var(--border)`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <User size={12} color="var(--text-muted)" />
                      </div>
                    )}
                    <span style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {c.customers.name||c.customers.platform_id}
                    </span>
                  </div>
                  <span style={{ fontSize:10, color:"var(--text-muted)", flexShrink:0, marginLeft:5 }}>{format(new Date(c.updated_at),"h:mm a")}</span>
                </div>
                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                  <span style={{ padding:"2px 7px", borderRadius:100, fontSize:10, fontWeight:600, background:pbg, color:pc }}>{c.platform}</span>
                  {c.status==="human_queue" && <span style={{ padding:"2px 7px", borderRadius:100, fontSize:10, fontWeight:600, background:"hsla(38,90%,55%,0.12)", color:"hsl(38,90%,65%)" }}>Human</span>}
                  {c.is_locked_for_ai && <span style={{ padding:"2px 7px", borderRadius:100, fontSize:10, fontWeight:600, background:"hsla(350,85%,60%,0.1)", color:"hsl(350,85%,70%)" }}>AI Off</span>}
                  {c.customers.is_vip && <span style={{ padding:"2px 7px", borderRadius:100, fontSize:10, fontWeight:700, background:"hsla(38,90%,55%,0.12)", color:"hsl(38,90%,65%)" }}>⭐ VIP</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Center: Chat ─────────────────── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, background:"var(--bg-base)" }}>
        {sel ? (<>
          <div style={{ padding:"12px 18px", borderBottom:`1px solid ${C.borderWhite}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:"var(--bg-card)", flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              {sel.customers.profile_pic ? (
                <img src={sel.customers.profile_pic} alt="" style={{ width:36, height:36, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />
              ) : (
                <div style={{ width:36, height:36, borderRadius:"50%", background:"var(--bg-elevated)", border:`1px solid var(--border)`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <User size={18} color="var(--text-muted)" />
                </div>
              )}
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:"var(--text-primary)" }}>{sel.customers.name||sel.customers.platform_id}</div>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2, textTransform:"capitalize" }}>{sel.platform} · {sel.status.replace("_"," ")}</div>
              </div>
            </div>
            <button onClick={()=>toggleAI(sel.id,sel.is_locked_for_ai)} style={{
              display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:9, fontSize:12, fontWeight:600,
              background: sel.is_locked_for_ai?"var(--bg-elevated)":"hsla(262,83%,58%,0.15)",
              color: sel.is_locked_for_ai?"var(--text-secondary)":"var(--primary-light)",
              border:`1px solid ${sel.is_locked_for_ai?C.border:"var(--border-strong)"}`,
              cursor:"pointer", fontFamily:"inherit",
            }}>
              {sel.is_locked_for_ai ? <><Play size={12}/> Resume AI</> : <><Pause size={12}/> Pause AI</>}
            </button>
          </div>

          <div ref={chatContainerRef} style={{ flex:1, overflowY:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:10 }}>
            {msgs.length === 0 && <div style={{ textAlign:"center", color:C.textMuted, marginTop:20 }}>No messages yet.</div>}
            {msgs.map(m => (
              <div key={m.id} style={{ display:"flex", justifyContent:m.role==="customer"?"flex-start":"flex-end" }}>
                <div style={{
                  maxWidth:"66%", padding:"10px 14px",
                  borderRadius: m.role==="customer"?"4px 14px 14px 14px":"14px 4px 14px 14px",
                  fontSize:13, lineHeight:1.6,
                  background: m.role==="customer"?"var(--bg-elevated)":m.role==="ai"?"hsla(262,83%,58%,0.15)":"hsla(152,60%,50%,0.1)",
                  border: m.role==="customer"?`1px solid ${C.borderWhite}`:m.role==="ai"?"1px solid hsla(262,83%,58%,0.25)":"1px solid hsla(152,60%,50%,0.2)",
                  color: m.role==="customer"?"var(--text-primary)":m.role==="ai"?"var(--primary-light)":"hsl(152,60%,60%)",
                }}>
                  <div style={{ fontSize:10, opacity:0.5, marginBottom:4, display:"flex", justifyContent:"space-between", gap:10 }}>
                    <b>{m.role==="ai"?"🤖 AI":m.role==="human_agent"?"👨‍💻 Agent":"Customer"}</b>
                    <span>{format(new Date(m.created_at),"h:mm a")}</span>
                  </div>
                  {m.media_url && m.media_type === "image" && (
                    <img src={m.media_url} alt="attachment" onLoad={scrollToBottom} style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 8, border: `1px solid ${C.borderWhite}` }} />
                  )}
                  <p style={{ margin:0, whiteSpace:"pre-wrap" }}>{m.content}</p>
                </div>
              </div>
            ))}
            <div ref={msgsEndRef} />
          </div>

          <div style={{ padding:"10px 18px", borderTop:`1px solid ${C.borderWhite}`, background:"var(--bg-card)", flexShrink:0 }}>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const input = form.elements.namedItem("message") as HTMLInputElement;
              const text = input.value.trim();
              if (!text || !sel) return;
              
              // Optimistically add to UI
              const tempId = "temp-" + Date.now();
              setMsgs(prev => [...prev, { id: tempId, role: "human_agent", content: text, media_type: null, created_at: new Date().toISOString() }]);
              input.value = "";
              setTimeout(() => { if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight; }, 100);
              
              try {
                // We directly insert into the messages table for human agent
                const { error } = await sb.from("messages").insert({
                  conversation_id: sel.id,
                  role: "human_agent",
                  content: text
                });
                
                if (error) throw error;
                
                // Update conversation to show AI is paused and status is open
                await sb.from("conversations").update({
                  is_locked_for_ai: true,
                  status: "open", // Make sure it's active
                  updated_at: new Date().toISOString()
                }).eq("id", sel.id);
                
                if (!sel.is_locked_for_ai) {
                  setConvs(cs => cs.map(c => c.id === sel.id ? { ...c, is_locked_for_ai: true, status: "open", updated_at: new Date().toISOString() } : c));
                }
              } catch (err) {
                console.error("Failed to send manual reply:", err);
              }
            }} style={{ display: "flex", gap: 10 }}>
              <input 
                name="message"
                style={{ ...inputStyle, flex: 1 }} 
                placeholder="Type a message to reply as a Human Agent..." 
                autoComplete="off"
              />
              <button type="submit" style={{ padding: "0 20px", borderRadius: 8, background: "var(--primary)", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Send
              </button>
            </form>
          </div>
        </>) : (
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", color:"var(--text-muted)", gap:10 }}>
            <MessageSquare size={56} style={{ opacity:0.08 }}/>
            <p style={{ fontSize:14 }}>Select a conversation to view messages</p>
          </div>
        )}
      </div>

      {/* ── Right: Customer CRM Panel ─────── */}
      {sel && (
        <div style={{ width:260, minWidth:260, borderLeft:`1px solid ${C.borderWhite}`, background:"var(--bg-card)", display:"flex", flexDirection:"column", gap:0, overflowY:"auto", flexShrink:0 }}>
          {/* Avatar */}
          <div style={{ padding:"22px 20px 16px", borderBottom:`1px solid ${C.borderWhite}`, textAlign:"center" }}>
            <div style={{
              width:60, height:60, borderRadius:"50%", margin:"0 auto 12px",
              background:"linear-gradient(135deg,var(--primary),var(--accent))",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:20, fontWeight:700, color:"#fff",
              boxShadow:"0 0 20px var(--primary-glow)",
            }}>{initials}</div>
            <div style={{ fontSize:14, fontWeight:700, color:"var(--text-primary)", marginBottom:6 }}>{sel.customers.name||sel.customers.platform_id}</div>
            <div style={{ display:"flex", justifyContent:"center", gap:6 }}>
              {sel.customers.is_vip && (
                <span style={{ padding:"2px 10px", borderRadius:100, fontSize:11, fontWeight:700, background:"hsla(38,90%,55%,0.12)", color:"hsl(38,90%,65%)", border:"1px solid hsla(38,90%,55%,0.2)" }}>
                  ⭐ VIP
                </span>
              )}
              <span style={{ padding:"2px 10px", borderRadius:100, fontSize:11, fontWeight:600, background:"hsla(262,83%,58%,0.1)", color:"var(--primary-light)", border:"1px solid hsla(262,83%,58%,0.2)", textTransform:"capitalize" }}>
                {sel.platform}
              </span>
            </div>
          </div>

          {/* CRM Details */}
          <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.borderWhite}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12 }}>
              <User size={12} color="var(--text-muted)"/>
              <span style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.07em" }}>CRM Details</span>
            </div>
            {[["Platform ID",sel.customers.platform_id],["Spam Score",String(sel.customers.spam_score??0)]].map(([k,v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${C.borderWhite}` }}>
                <span style={{ fontSize:12, color:"var(--text-muted)" }}>{k}</span>
                <span style={{ fontSize:12, fontWeight:600, color:"var(--text-primary)" }}>{v}</span>
              </div>
            ))}
          </div>

          {/* AI Status */}
          <div style={{ padding:"16px 20px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12 }}>
              <Clock size={12} color="var(--text-muted)"/>
              <span style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.07em" }}>AI Status</span>
            </div>
            <div style={{ padding:"12px 14px", background:sel.is_locked_for_ai?"hsla(350,85%,60%,0.07)":"hsla(152,60%,50%,0.07)", borderRadius:10, border:`1px solid ${sel.is_locked_for_ai?"hsla(350,85%,60%,0.2)":"hsla(152,60%,50%,0.2)"}` }}>
              <div style={{ fontSize:12, fontWeight:600, color:sel.is_locked_for_ai?"hsl(350,85%,70%)":"hsl(152,60%,60%)", marginBottom:4 }}>
                {sel.is_locked_for_ai ? "AI Paused" : "AI Enabled"}
              </div>
              <div style={{ fontSize:11, color:"var(--text-muted)" }}>
                {sel.is_locked_for_ai ? "Manual reply mode is active" : "Platform window is active"}
              </div>
            </div>

            {/* VIP Toggle */}
            <button onClick={() => toggleVIP(sel.customers.id, sel.customers.is_vip||false)} style={{
              display:"flex", alignItems:"center", gap:8, width:"100%", marginTop:12,
              padding:"9px 12px", borderRadius:10, border:`1px solid ${C.borderWhite}`,
              background:"var(--bg-elevated)", cursor:"pointer", fontFamily:"inherit",
            }}>
              <Star size={13} color="hsl(38,90%,65%)" style={{ fill:sel.customers.is_vip?"hsl(38,90%,65%)":"none" }}/>
              <span style={{ fontSize:12, color:"var(--text-secondary)" }}>{sel.customers.is_vip?"Remove VIP":"Mark as VIP"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
