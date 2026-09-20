"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputStyle, skeletonStyle, getCustomerAvatar } from "@/lib/styles";
// Icons via Material Symbols className in JSX
import { format } from "date-fns";

type Conv = { id:string; platform:string; status:string; is_locked_for_ai:boolean; updated_at:string; customers:{id:string; name:string|null;platform_id:string;spam_score?:number;is_vip?:boolean;profile_pic?:string|null} };
type Msg  = { id:string; role:string; content:string|null; media_type:string|null; media_url?:string|null; created_at:string };

const pColors: Record<string,[string,string]> = {
  messenger: ["hsla(217,89%,61%,0.12)","hsl(217,89%,65%)"],
  instagram: ["hsla(330,75%,65%,0.12)","hsl(330,75%,65%)"],
  whatsapp:  ["hsla(142,65%,50%,0.12)","hsl(142,65%,55%)"],
};

function getDisplayName(name?: string | null, platform_id?: string, platform?: string) {
  if (name && name !== platform_id && !name.match(/^\d{10,}$/)) {
    return name;
  }
  if (!platform_id) return "Customer";
  if (platform_id === "REAL_MOBILE_USER") return "Customer (Mobile)";
  
  if (platform_id.length > 6) {
    const shortId = platform_id.slice(-5);
    const platformName = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : "Customer";
    return `${platformName} User #${shortId}`;
  }
  return `Customer #${platform_id}`;
}

export default function InboxPage() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [selId, setSelId] = useState<string|null>(null);
  const [pendingPid, setPendingPid] = useState<{pid:string;platform:string}|null>(null);
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

  // Load conversations initial & on filter change + auto-sync customer Meta profile info
  useEffect(() => {
    loadConvs();
    fetch('/api/sync-customers')
      .then(res => res.json())
      .then(data => {
        if (data.updatedCount && data.updatedCount > 0) {
          console.log(`Auto-synced ${data.updatedCount} customer profiles`);
          loadConvs();
        }
      })
      .catch(err => console.error("Customer sync error:", err));
  }, [loadConvs]);

  // Resolve pendingPid: once convs are loaded, find the conversation for this customer
  useEffect(() => {
    if (!pendingPid || convs.length === 0) return;
    const target = pendingPid.pid.trim().toLowerCase();
    const cleanTargetDigits = pendingPid.pid.replace(/[^0-9]/g, "");

    const match = convs.find(c => {
      const cPid = (c.customers?.platform_id || "").trim();
      const cDigits = cPid.replace(/[^0-9]/g, "");
      const cName = (c.customers?.name || "").toLowerCase();
      const cId = c.customers?.id || "";

      // Match platform_id exact
      if (cPid.toLowerCase() === target) return true;
      // Match phone digits if >= 7 digits
      if (cleanTargetDigits.length >= 7 && cDigits.length >= 7) {
        if (cDigits.includes(cleanTargetDigits) || cleanTargetDigits.includes(cDigits)) return true;
      }
      // Match customer UUID or name
      if (cId === pendingPid.pid) return true;
      if (cName && (cName.includes(target) || target.includes(cName))) return true;

      return false;
    });

    if (match) {
      setSelId(match.id);
      setPendingPid(null);
    }
  }, [convs, pendingPid]);

  // Read ?chat= or ?pid= parameter on mount — auto-select the matching conversation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chatParam = params.get("chat");
    const pidParam = params.get("pid");
    const platformParam = params.get("platform");

    if (chatParam) {
      // Direct conversation ID — set immediately
      setSelId(chatParam);
      window.history.replaceState({}, '', '/inbox');
    } else if (pidParam) {
      // platform_id given — need to find the conversation after convs load
      // We'll store it in a ref-like state and resolve after convs are fetched
      setPendingPid({ pid: pidParam, platform: platformParam || "" });
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
    <div style={{ display: "flex", height: "calc(100vh - 56px)", overflow: "hidden", background: "#131313" }}>

      {/* ── Left Panel: Conversation List (320px) ─────── */}
      <section style={{
        width: 320, minWidth: 320, borderRight: "1px solid rgba(73,68,84,0.3)",
        display: "flex", flexDirection: "column", background: "#0e0e0e", flexShrink: 0,
      }}>
        {/* Panel Header & Filter Tabs */}
        <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid rgba(73,68,84,0.2)", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ fontSize: 16, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.02em", fontFamily: "Geist, system-ui", margin: 0 }}>
                Inbox
              </h1>
              <span style={{
                padding: "2px 7px", borderRadius: 4, background: "#201f1f",
                border: "1px solid rgba(160,120,255,0.3)", color: "#d0bcff",
                fontSize: 11, fontWeight: 500,
              }}>
                {convs.filter(c => c.status === "open").length || 24} unread
              </span>
            </div>
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/sync-customers');
                  const data = await res.json();
                  if (data.updatedCount) await loadConvs();
                } catch (e) {
                  console.error(e);
                }
              }}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                fontSize: 11, padding: "3px 8px", borderRadius: 4,
                background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.35)",
                color: "#958ea0", cursor: "pointer", fontFamily: "inherit",
              }}
              title="Sync Facebook/Instagram profile names"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>sync</span>
              Sync
            </button>
          </div>

          {/* Search box inside inbox */}
          <div style={{ position: "relative" }}>
            <span className="material-symbols-outlined" style={{
              position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
              color: "#958ea0", pointerEvents: "none", fontSize: 14,
            }}>search</span>
            <input
              style={{
                width: "100%", background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)",
                borderRadius: 4, padding: "5px 10px 5px 28px", color: "#e5e2e1",
                fontSize: 12, outline: "none", fontFamily: "inherit",
              }}
              placeholder="Filter conversations..."
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Pill Tabs */}
          <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
            {[["all","All"],["open","AI Handled"],["human_queue","Human"],["unread","Unread"]].map(([v,l]) => {
              const active = filter === v;
              return (
                <button
                  key={v}
                  onClick={() => setFilter(v)}
                  style={{
                    padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 500,
                    cursor: "pointer", border: active ? "1px solid rgba(160,120,255,0.4)" : "1px solid transparent",
                    background: active ? "#201f1f" : "transparent",
                    color: active ? "#e5e2e1" : "#958ea0",
                    transition: "all 0.1s", fontFamily: "inherit", whiteSpace: "nowrap",
                  }}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Conversation List */}
        <div style={{ flex: 1, overflowY: "auto", divideY: "1px solid rgba(73,68,84,0.15)" }}>
          {loading ? [...Array(5)].map((_, i) => (
            <div key={i} style={{ padding: 12, borderBottom: "1px solid rgba(73,68,84,0.15)" }}>
              <div style={{ height: 16, width: "60%", background: "#201f1f", borderRadius: 4, marginBottom: 6 }} />
              <div style={{ height: 12, width: "85%", background: "#1c1b1b", borderRadius: 4 }} />
            </div>
          )) : shown.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#958ea0", fontSize: 13 }}>No conversations found</div>
          ) : shown.map(c => {
            const active = selId === c.id;
            const channelIcon = c.platform === "whatsapp" ? "chat" : c.platform === "instagram" ? "photo_camera" : "forum";
            const channelColor = c.platform === "whatsapp" ? "#4ade80" : c.platform === "instagram" ? "#f472b6" : "#60a5fa";
            return (
              <div
                key={c.id}
                onClick={() => setSelId(c.id)}
                style={{
                  padding: "12px 14px", cursor: "pointer",
                  borderLeft: active ? "2px solid #a078ff" : "2px solid transparent",
                  background: active ? "#1c1b1b" : "transparent",
                  borderBottom: "1px solid rgba(73,68,84,0.15)",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(28,27,27,0.5)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {c.customers.profile_pic ? (
                      <img src={c.customers.profile_pic} alt="" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%", background: "#2a2a2a",
                        border: "1px solid rgba(73,68,84,0.4)", display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 10, fontWeight: 600, color: "#e5e2e1",
                      }}>
                        {(c.customers.name || "C").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: "#e5e2e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {getDisplayName(c.customers.name, c.customers.platform_id, c.platform)}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: "#958ea0", flexShrink: 0 }}>
                    {format(new Date(c.updated_at), "h:mm a")}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 13, color: channelColor }}>{channelIcon}</span>
                    <span style={{ fontSize: 10, color: "#958ea0", textTransform: "capitalize" }}>{c.platform}</span>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 4,
                    background: c.is_locked_for_ai ? "rgba(239,68,68,0.15)" : "rgba(160,120,255,0.15)",
                    color: c.is_locked_for_ai ? "#f87171" : "#d0bcff",
                    border: `1px solid ${c.is_locked_for_ai ? "rgba(239,68,68,0.3)" : "rgba(160,120,255,0.3)"}`,
                  }}>
                    {c.is_locked_for_ai ? "Human Needed" : "AI Handled"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Center: Thread & Composer ─────────────────── */}
      <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#131313" }}>
        {sel ? (<>
          {/* Thread Header Bar */}
          <div style={{
            minHeight: 56, height: "auto", borderBottom: "1px solid rgba(73,68,84,0.3)",
            padding: "8px 20px", display: "flex", justifyContent: "space-between",
            alignItems: "center", background: "#0e0e0e", flexShrink: 0, gap: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%", background: "#201f1f",
                border: "1px solid rgba(160,120,255,0.3)", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#d0bcff",
                flexShrink: 0,
              }}>
                {(sel.customers.name || "C").charAt(0).toUpperCase()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#e5e2e1", fontFamily: "Geist, system-ui", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {getDisplayName(sel.customers.name, sel.customers.platform_id, sel.platform)}
                  </span>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "2px 7px", borderRadius: 100,
                    background: sel.is_locked_for_ai ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
                    border: `1px solid ${sel.is_locked_for_ai ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
                    fontSize: 10, fontWeight: 500, color: sel.is_locked_for_ai ? "#f87171" : "#4ade80",
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: sel.is_locked_for_ai ? "#ef4444" : "#22c55e" }} />
                    {sel.is_locked_for_ai ? "Human Mode" : "AI Active"}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "#958ea0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  via {sel.platform.charAt(0).toUpperCase() + sel.platform.slice(1)} • {sel.customers.platform_id}
                </span>
              </div>
            </div>

            {/* Thread Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => toggleAI(sel.id, sel.is_locked_for_ai)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                  borderRadius: 4, fontSize: 12, fontWeight: 500, cursor: "pointer",
                  background: sel.is_locked_for_ai ? "#201f1f" : "#1c1b1b",
                  border: "1px solid rgba(73,68,84,0.35)", color: "#e5e2e1", fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#d0bcff" }}>
                  {sel.is_locked_for_ai ? "smart_toy" : "person_add"}
                </span>
                <span>{sel.is_locked_for_ai ? "Handover to AI" : "Assign to Human"}</span>
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div ref={chatContainerRef} style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Day Divider */}
            <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
              <span style={{ fontSize: 10, color: "#958ea0", padding: "2px 10px", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.2)", borderRadius: 4 }}>
                Today • Live Transcript
              </span>
            </div>

            {msgs.length === 0 && <div style={{ textAlign: "center", color: "#958ea0", marginTop: 20 }}>No messages yet.</div>}

            {msgs.filter(m => {
              const clean = m.content ? m.content.replace(/\[SYSTEM_INSTRUCTION:[\s\S]*?\]/g, "").replace(/\[PRODUCT_CONTEXT:[\s\S]*?\]/g, "").trim() : "";
              return clean.length > 0 || !!m.media_url;
            }).map(m => {
              const cleanText = m.content ? m.content.replace(/\[SYSTEM_INSTRUCTION:[\s\S]*?\]/g, "").replace(/\[PRODUCT_CONTEXT:[\s\S]*?\]/g, "").trim() : "";
              const isAi = m.role === "ai";
              const isAgent = m.role === "human_agent";
              return (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isAi || isAgent ? "flex-end" : "flex-start", marginBottom: 6 }}>
                  <div style={{
                    maxWidth: "75%", padding: "10px 14px", borderRadius: 12,
                    background: isAi ? "#1c1b1b" : isAgent ? "rgba(34,197,94,0.1)" : "#201f1f",
                    border: isAi ? "1px solid rgba(160,120,255,0.25)" : isAgent ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(73,68,84,0.3)",
                    color: "#e5e2e1", fontSize: 13, lineHeight: "1.5",
                  }}>
                    {(isAi || isAgent) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, color: isAi ? "#d0bcff" : "#4ade80", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{isAi ? "smart_toy" : "support_agent"}</span>
                        <span>{isAi ? "Growthomic AI • Helmet BD Agent" : "Human Agent (You)"}</span>
                      </div>
                    )}
                    {m.media_url && m.media_type === "image" && (
                      <img src={m.media_url} alt="attachment" onLoad={scrollToBottom} style={{ maxWidth: "100%", borderRadius: 6, marginBottom: 8, border: "1px solid rgba(73,68,84,0.3)" }} />
                    )}
                    {cleanText && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{cleanText}</p>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, padding: "0 4px" }}>
                    <span style={{ fontSize: 10, color: "#958ea0" }}>{format(new Date(m.created_at), "h:mm a")}</span>
                    {(isAi || isAgent) && (
                      <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#a078ff" }}>done_all</span>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={msgsEndRef} />
          </div>

          {/* Composer */}
          <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(73,68,84,0.3)", background: "#0e0e0e", flexShrink: 0 }}>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const input = form.elements.namedItem("message") as HTMLInputElement;
              const text = input.value.trim();
              if (!text || !sel) return;
              
              const tempId = "temp-" + Date.now();
              setMsgs(prev => [...prev, { id: tempId, role: "human_agent", content: text, media_type: null, created_at: new Date().toISOString() }]);
              input.value = "";
              setTimeout(() => { if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight; }, 100);
              
              try {
                const { error } = await sb.functions.invoke('manual-reply', {
                  body: { conversationId: sel.id, text }
                });
                if (error) throw error;
                if (!sel.is_locked_for_ai) {
                  setConvs(cs => cs.map(c => c.id === sel.id ? { ...c, is_locked_for_ai: true, status: "open", updated_at: new Date().toISOString() } : c));
                }
              } catch (err) {
                console.error("Failed to send manual reply:", err);
              }
            }} style={{ display: "flex", gap: 10 }}>
              <input 
                name="message"
                style={{
                  flex: 1, background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.35)",
                  borderRadius: 6, padding: "8px 14px", color: "#e5e2e1", fontSize: 13,
                  outline: "none", fontFamily: "inherit",
                }} 
                placeholder="Type a message to reply as a Human Agent..." 
                autoComplete="off"
              />
              <button type="submit" style={{
                padding: "0 18px", borderRadius: 6, background: "#a078ff", color: "#340080",
                border: "none", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
              }}>
                Send
              </button>
            </form>
          </div>
        </>) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#958ea0", gap: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, opacity: 0.15 }}>forum</span>
            <p style={{ fontSize: 14 }}>Select a conversation to view customer messages</p>
          </div>
        )}
      </section>

      {/* ── Right Panel: Customer 360° Drawer (260px) ─────── */}
      {sel && (
        <section style={{
          width: 280, minWidth: 280, borderLeft: "1px solid rgba(73,68,84,0.3)",
          background: "#0e0e0e", display: "flex", flexDirection: "column",
          overflowY: "auto", flexShrink: 0,
        }}>
          {/* Header & Avatar */}
          <div style={{ padding: "20px 18px", borderBottom: "1px solid rgba(73,68,84,0.2)", textAlign: "center" }}>
            <div style={{
              width: 50, height: 50, borderRadius: "50%", margin: "0 auto 10px",
              background: "#201f1f", border: "2px solid #a078ff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 700, color: "#d0bcff",
            }}>
              {(sel.customers.name || "C").charAt(0).toUpperCase()}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#e5e2e1", marginBottom: 4 }}>
              {sel.customers.name || sel.customers.platform_id}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
              {sel.customers.is_vip && (
                <span style={{ padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" }}>
                  ⭐ VIP
                </span>
              )}
              <span style={{ padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 500, background: "#1c1b1b", color: "#cbc3d7", border: "1px solid rgba(73,68,84,0.3)", textTransform: "capitalize" }}>
                {sel.platform}
              </span>
            </div>
          </div>

          {/* Customer 360 Metrics */}
          <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(73,68,84,0.2)" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#958ea0", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 12 }}>
              Customer 360° Data
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#958ea0" }}>Platform ID</span>
                <span style={{ color: "#e5e2e1", fontWeight: 500 }}>{sel.customers.platform_id}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#958ea0" }}>Spam Risk</span>
                <span style={{ color: (sel.customers.spam_score ?? 0) > 50 ? "#f87171" : "#4ade80", fontWeight: 600 }}>
                  {sel.customers.spam_score ?? 0}%
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#958ea0" }}>Est. Lifetime Value</span>
                <span style={{ color: "#d0bcff", fontWeight: 600 }}>৳ 12,500</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ padding: "16px 18px" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#958ea0", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 10 }}>
              Quick Controls
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => toggleVIP(sel.customers.id, sel.customers.is_vip || false)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                  borderRadius: 4, background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)",
                  color: "#e5e2e1", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#fbbf24" }}>
                  {sel.customers.is_vip ? "star_border" : "star"}
                </span>
                <span>{sel.customers.is_vip ? "Remove VIP Status" : "Mark as VIP Customer"}</span>
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
