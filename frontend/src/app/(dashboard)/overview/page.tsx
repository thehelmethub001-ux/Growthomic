"use client";
import { useEffect, useState } from "react";
import { C, pageWrap } from "@/lib/styles";
import { MessageCircle, Brain, ShoppingBag, Banknote, ArrowUpRight, ArrowDownRight, AlertTriangle, HelpCircle, Bot } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const chartData = [
  { time:"08:00", messages:120 }, { time:"10:00", messages:210 },
  { time:"12:00", messages:180 }, { time:"14:00", messages:350 },
  { time:"16:00", messages:290 }, { time:"18:00", messages:450 },
  { time:"20:00", messages:380 },
];

const stagger: Variants = { hidden:{opacity:0}, show:{opacity:1,transition:{staggerChildren:0.08}} };
const fadeUp: Variants = { hidden:{opacity:0,y:16}, show:{opacity:1,y:0,transition:{type:"spring",stiffness:280,damping:22}} };

export default function OverviewPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => setLoading(false), 600);
  }, []);

  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

  const kpis = [
    { label:"Today's Messages",  value:"1,240",   delta:"+12%",    up:true,  icon:MessageCircle, color:"hsl(262,83%,68%)", bg:"hsla(262,83%,58%,0.1)", border:"hsla(262,83%,58%,0.25)" },
    { label:"AI Handle Rate",    value:"98%",      delta:"+2.4%",   up:true,  icon:Brain,         color:"hsl(271,85%,72%)", bg:"hsla(271,85%,65%,0.1)", border:"hsla(271,85%,65%,0.25)" },
    { label:"New Orders",        value:"45",       delta:"-4%",     up:false, icon:ShoppingBag,   color:"hsl(217,89%,65%)", bg:"hsla(217,89%,61%,0.1)", border:"hsla(217,89%,61%,0.25)" },
    { label:"Revenue Today",     value:"৳84,500", delta:"+18%",    up:true,  icon:Banknote,      color:"hsl(152,60%,55%)", bg:"hsla(152,60%,55%,0.1)", border:"hsla(152,60%,55%,0.25)" },
  ];

  const actions = [
    { label:"AI Failed",      sub:"Needs manual reply",  count:2, icon:Bot,          color:"hsl(350,85%,70%)",  bg:"hsla(350,85%,60%,0.1)",  href:"/human-queue" },
    { label:"Returns",        sub:"Pending approval",    count:3, icon:HelpCircle,    color:"hsl(38,90%,65%)",   bg:"hsla(38,90%,55%,0.1)",   href:"/orders" },
    { label:"Complaints",     sub:"Urgent resolution",   count:1, icon:AlertTriangle, color:"hsl(217,89%,65%)",  bg:"hsla(217,89%,61%,0.1)",  href:"/inbox" },
  ];

  return (
    <div style={{ ...pageWrap }}>
      {/* Header */}
      <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} style={{ marginBottom:28 }}>
        <p style={{ fontSize:10, fontWeight:700, color:"var(--green-light)", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:"var(--green)", display:"inline-block", animation:"pulse 2s infinite" }}/>
          All Systems Live
        </p>
        <h1 style={{ fontSize:30, fontWeight:700, color:"var(--text-primary)", letterSpacing:"-0.03em", lineHeight:1.15 }}>
          {greeting}, <span className="gradient-text">Admin!</span> 👋
        </h1>
        <p style={{ fontSize:13, color:"var(--text-muted)", marginTop:6 }}>
          Here&apos;s what&apos;s happening with your AI agent today.
        </p>
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={stagger} initial="hidden" animate="show" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:20 }}>
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <motion.div key={kpi.label} variants={fadeUp} whileHover={{ y:-3, transition:{ duration:0.15 } }} style={{
              background:"var(--bg-card)", border:`1px solid ${kpi.border}`, borderRadius:14, padding:"18px 20px",
              position:"relative", overflow:"hidden",
            }}>
              <div style={{ position:"absolute", top:0, left:"15%", right:"15%", height:1, background:`linear-gradient(90deg,transparent,${kpi.color},transparent)` }}/>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:kpi.bg, border:`1px solid ${kpi.border}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <Icon size={17} color={kpi.color}/>
                </div>
                {!loading && (
                  <div style={{ display:"flex", alignItems:"center", gap:3, fontSize:11, fontWeight:600, color: kpi.up?"var(--green-light)":"hsl(350,85%,70%)" }}>
                    {kpi.up ? <ArrowUpRight size={11}/> : <ArrowDownRight size={11}/>}
                    {kpi.delta}
                  </div>
                )}
              </div>
              {loading
                ? <div style={{ width:70, height:28, background:"var(--bg-elevated)", borderRadius:6, animation:"shimmer 1.5s infinite" }}/>
                : <div style={{ fontSize:26, fontWeight:700, color:"var(--text-primary)", letterSpacing:"-0.03em", lineHeight:1 }}>{kpi.value}</div>
              }
              <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:5 }}>{kpi.label}</div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Chart + Action Required */}
      <motion.div variants={stagger} initial="hidden" animate="show" style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:14 }}>

        {/* Activity Chart */}
        <motion.div variants={fadeUp} style={{ background:"var(--bg-card)", border:`1px solid ${C.border}`, borderRadius:14, padding:22 }}>
          <div style={{ marginBottom:18 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"var(--text-primary)", letterSpacing:"-0.02em" }}>Activity Overview</div>
            <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:3 }}>Messages processed today by hour</div>
          </div>
          <div style={{ height:260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top:10, right:10, left:-20, bottom:0 }}>
                <defs>
                  <linearGradient id="colorMsgs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(262,83%,58%)" stopOpacity={0.7}/>
                    <stop offset="95%" stopColor="hsl(262,83%,58%)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false}/>
                <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false}/>
                <Tooltip
                  contentStyle={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:10, fontSize:12 }}
                  itemStyle={{ color:"var(--text-primary)" }}
                  labelStyle={{ color:"var(--text-muted)", marginBottom:4 }}
                />
                <Area type="monotone" dataKey="messages" stroke="hsl(262,83%,58%)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorMsgs)"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Action Required */}
        <motion.div variants={fadeUp} style={{ background:"var(--bg-card)", border:`1px solid ${C.border}`, borderRadius:14, padding:22, display:"flex", flexDirection:"column" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
            <AlertTriangle size={15} color="hsl(38,90%,65%)"/>
            <div style={{ fontSize:14, fontWeight:700, color:"var(--text-primary)", letterSpacing:"-0.02em" }}>Action Required</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <a key={a.label} href={a.href} style={{
                  display:"flex", justifyContent:"space-between", alignItems:"center",
                  padding:"14px 16px", background:"var(--bg-elevated)", borderRadius:12,
                  border:"1px solid transparent", transition:"all 0.15s", cursor:"pointer",
                  textDecoration:"none",
                }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor="var(--border-mid)"; (e.currentTarget as HTMLElement).style.background="var(--bg-overlay)"}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor="transparent"; (e.currentTarget as HTMLElement).style.background="var(--bg-elevated)"}}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:38, height:38, borderRadius:10, background:a.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <Icon size={17} color={a.color}/>
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)" }}>{a.label}</div>
                      <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>{a.sub}</div>
                    </div>
                  </div>
                  <div style={{ padding:"3px 9px", borderRadius:100, fontSize:12, fontWeight:700, background:a.bg, color:a.color, flexShrink:0 }}>
                    {a.count}
                  </div>
                </a>
              );
            })}
          </div>

          {/* Platform status */}
          <div style={{ marginTop:"auto", paddingTop:18, borderTop:"1px solid var(--border-white)" }}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>Platforms</div>
            {[
              { name:"Facebook Messenger", color:"hsl(217,89%,65%)" },
              { name:"Instagram DM",       color:"hsl(330,75%,65%)" },
              { name:"WhatsApp Business",  color:"hsl(142,65%,50%)" },
              { name:"WooCommerce",        color:"var(--primary-light)" },
            ].map(p => (
              <div key={p.name} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid var(--border-white)" }}>
                <span style={{ fontSize:12, color:"var(--text-muted)" }}>{p.name}</span>
                <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, fontWeight:600, color:p.color }}>
                  <div style={{ width:5, height:5, borderRadius:"50%", background:p.color }}/>
                  Live
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
