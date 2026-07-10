"use client";
import { useState } from "react";
import { C, pageWrap, pageTitle, pageSubtitle, pageHeader, inputStyle } from "@/lib/styles";
import { Plus, Tag, Zap, Clock, CheckCircle2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Offer = { id:number; title:string; description:string; discount:string; status:"active"|"scheduled"|"ended"; platform:string; reach:number; starts:string };

const DUMMY:Offer[] = [
  { id:1, title:"Eid Special 20% Off",     description:"Flat 20% discount on all products for Eid",        discount:"20%",  status:"active",    platform:"All",        reach:1420, starts:"July 10" },
  { id:2, title:"New Arrival Flash Sale",  description:"First 50 buyers get free delivery",                 discount:"Free Delivery", status:"scheduled", platform:"Messenger",  reach:0,    starts:"July 15" },
  { id:3, title:"Ramadan Discount Bundle", description:"Bundle offer for Ramadan — buy 2 get 1 free",       discount:"Buy 2 Get 1",   status:"ended",     platform:"Instagram",  reach:2100, starts:"March 30" },
];

const STATUS_STYLE: Record<string,{color:string;bg:string;icon:React.ReactNode}> = {
  active:    { color:"hsl(152,60%,60%)", bg:"hsla(152,60%,50%,0.1)", icon:<CheckCircle2 size={11}/> },
  scheduled: { color:"hsl(38,90%,65%)", bg:"hsla(38,90%,55%,0.1)",  icon:<Clock size={11}/> },
  ended:     { color:"var(--text-muted)", bg:"var(--bg-elevated)",   icon:<X size={11}/> },
};

export default function OffersPage() {
  const [tab, setTab] = useState<"all"|"active"|"scheduled"|"ended">("all");
  const [showModal, setShowModal] = useState(false);
  const [offers] = useState<Offer[]>(DUMMY);
  const [form, setForm] = useState({ title:"", description:"", discount:"", platform:"All", starts:"" });

  const shown = tab === "all" ? offers : offers.filter(o => o.status === tab);

  return (
    <div style={{ ...pageWrap }}>
      <div style={pageHeader}>
        <div>
          <h1 style={pageTitle}>Offers & Events</h1>
          <p style={pageSubtitle}>Manage promotional campaigns and special events</p>
        </div>
        <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }} onClick={()=>setShowModal(true)} style={{
          display:"flex", alignItems:"center", gap:8, padding:"9px 18px", borderRadius:10, fontSize:13, fontWeight:600,
          background:"linear-gradient(135deg,var(--primary),var(--accent))", color:"#fff", border:"none", cursor:"pointer",
          boxShadow:"0 4px 20px var(--primary-glow)", fontFamily:"inherit",
        }}>
          <Plus size={15}/> Create Offer
        </motion.button>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:24 }}>
        {[
          { label:"Active Campaigns",  value:offers.filter(o=>o.status==="active").length,    color:"hsl(152,60%,60%)", bg:"hsla(152,60%,50%,0.08)" },
          { label:"Scheduled",         value:offers.filter(o=>o.status==="scheduled").length,  color:"hsl(38,90%,65%)",  bg:"hsla(38,90%,55%,0.08)" },
          { label:"Total Reach",       value:`${offers.reduce((a,o)=>a+o.reach,0).toLocaleString()}`, color:"var(--primary-light)", bg:"hsla(262,83%,58%,0.08)" },
        ].map(s => (
          <div key={s.label} style={{ background:s.bg, borderRadius:12, padding:"16px 20px", border:`1px solid ${s.bg.replace("0.08","0.2")}` }}>
            <div style={{ fontSize:24, fontWeight:700, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:`1px solid ${C.borderWhite}`, marginBottom:20, gap:2 }}>
        {(["all","active","scheduled","ended"] as const).map(t => (
          <button key={t} onClick={()=>setTab(t)} style={{
            padding:"8px 14px", fontSize:12, fontWeight:500, cursor:"pointer", border:"none", fontFamily:"inherit", background:"transparent",
            borderBottom: tab===t?"2px solid var(--primary)":"2px solid transparent",
            color: tab===t?"var(--primary-light)":"var(--text-muted)", marginBottom:-1, textTransform:"capitalize",
          }}>{t}</button>
        ))}
      </div>

      {/* Offer Cards */}
      <motion.div layout style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:14 }}>
        <AnimatePresence>
          {shown.map(offer => {
            const st = STATUS_STYLE[offer.status];
            return (
              <motion.div key={offer.id} layout initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }} whileHover={{ y:-2 }}
                style={{ background:"var(--bg-card)", border:`1px solid ${C.border}`, borderRadius:14, padding:20, position:"relative", overflow:"hidden" }}>
                <div style={{ position:"absolute", top:0, left:"20%", right:"20%", height:1, background:`linear-gradient(90deg,transparent,${st.color},transparent)` }}/>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:`${st.color}22`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <Tag size={17} color={st.color}/>
                  </div>
                  <span style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 10px", borderRadius:100, fontSize:11, fontWeight:600, background:st.bg, color:st.color }}>
                    {st.icon} {offer.status.charAt(0).toUpperCase()+offer.status.slice(1)}
                  </span>
                </div>

                <div style={{ fontSize:14, fontWeight:700, color:"var(--text-primary)", letterSpacing:"-0.02em", marginBottom:6 }}>{offer.title}</div>
                <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:14, lineHeight:1.5 }}>{offer.description}</div>

                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
                  <span style={{ padding:"3px 10px", borderRadius:100, fontSize:11, fontWeight:700, background:"hsla(262,83%,58%,0.1)", color:"var(--primary-light)" }}>
                    <Zap size={9} style={{ marginRight:3, display:"inline" }}/>{offer.discount}
                  </span>
                  <span style={{ padding:"3px 10px", borderRadius:100, fontSize:11, fontWeight:600, background:"var(--bg-elevated)", color:"var(--text-secondary)" }}>
                    {offer.platform}
                  </span>
                </div>

                <div style={{ display:"flex", justifyContent:"space-between", borderTop:`1px solid ${C.borderWhite}`, paddingTop:12 }}>
                  <div style={{ fontSize:11, color:"var(--text-muted)" }}>
                    <span style={{ fontWeight:600, color:"var(--text-secondary)" }}>{offer.reach.toLocaleString()}</span> customers reached
                  </div>
                  <div style={{ fontSize:11, color:"var(--text-muted)" }}>Since {offer.starts}</div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {/* Create Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(6px)" }}
            onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
            <motion.div initial={{ scale:0.94, y:16 }} animate={{ scale:1, y:0 }} exit={{ scale:0.94, y:8 }}
              style={{ background:"var(--bg-card)", border:`1px solid ${C.border}`, borderRadius:18, padding:28, width:460, maxWidth:"95vw" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
                <div style={{ fontSize:16, fontWeight:700, color:"var(--text-primary)" }}>Create New Offer</div>
                <button onClick={()=>setShowModal(false)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-muted)", padding:4 }}><X size={16}/></button>
              </div>
              {[["title","Title","Summer Sale 20% Off"],["discount","Discount / Value","20% Off"],["starts","Start Date","July 15"]].map(([k,l,ph]) => (
                <div key={k} style={{ marginBottom:14 }}>
                  <label style={{ display:"block", fontSize:10, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>{l}</label>
                  <input style={inputStyle} placeholder={ph} value={(form as Record<string,string>)[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/>
                </div>
              ))}
              <div style={{ marginBottom:14 }}>
                <label style={{ display:"block", fontSize:10, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Description</label>
                <textarea style={{ ...inputStyle, minHeight:70, resize:"vertical" }} placeholder="Describe the offer..." value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/>
              </div>
              <div style={{ marginBottom:22 }}>
                <label style={{ display:"block", fontSize:10, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Platform</label>
                <select style={inputStyle} value={form.platform} onChange={e=>setForm(f=>({...f,platform:e.target.value}))}>
                  {["All","Messenger","Instagram","WhatsApp"].map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={()=>setShowModal(false)} style={{ flex:1, padding:"10px", borderRadius:10, border:`1px solid ${C.border}`, background:"none", color:"var(--text-muted)", cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Cancel</button>
                <button onClick={()=>setShowModal(false)} style={{ flex:2, padding:"10px", borderRadius:10, border:"none", background:"linear-gradient(135deg,var(--primary),var(--accent))", color:"#fff", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600 }}>Create Offer</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
