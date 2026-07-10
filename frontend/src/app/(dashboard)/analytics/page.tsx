"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, pageWrap, pageTitle, pageSubtitle, pageHeader, skeletonStyle } from "@/lib/styles";
import { BarChart3, TrendingUp, MessageCircle, Bot, ShoppingCart, Users } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from "recharts";

const PIE_COLORS = ["#8b5cf6","#a78bfa","#6d28d9","#c084fc","#4c1d95","#7c3aed"];
const tt: React.CSSProperties = {
  backgroundColor: "#141330",
  border: "1px solid rgba(139,92,246,0.2)",
  borderRadius: 12,
  fontSize: 12,
  color: "#ededf8",
  boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
  padding: "10px 14px",
};

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [revData, setRevData] = useState<{name:string;revenue:number}[]>([]);
  const [aiData, setAiData] = useState<{name:string;AI:number;Human:number}[]>([]);
  const [platformData, setPlatformData] = useState<{name:string;value:number}[]>([]);
  const [orderStatusData, setOrderStatusData] = useState<{name:string;value:number}[]>([]);
  const [productMsgData, setProductMsgData] = useState<{product:string;messages:number}[]>([]);
  const sb = createClient();

  useEffect(()=>{ load(); },[]);

  const load = async () => {
    setLoading(true);
    const days = Array.from({length:7},(_,i)=>{
      const d = subDays(new Date(),6-i);
      return {name:format(d,"MMM d"),start:startOfDay(d).toISOString(),end:endOfDay(d).toISOString()};
    });

    try {
      const [rv, ai, plat, status, prodMsg] = await Promise.all([
        // Revenue per day
        Promise.all(days.map(async d=>{
          const {data}=await sb.from("orders").select("total_amount").gte("created_at",d.start).lte("created_at",d.end).neq("status","cancelled");
          return {name:d.name,revenue:data?.reduce((s,o)=>s+(o.total_amount||0),0)||0};
        })),

        // AI vs Human per day
        Promise.all(days.map(async d=>{
          const [{count:a},{count:h}]=await Promise.all([
            sb.from("messages").select("*",{count:"exact",head:true}).eq("role","ai").gte("created_at",d.start).lte("created_at",d.end),
            sb.from("messages").select("*",{count:"exact",head:true}).eq("role","human_agent").gte("created_at",d.start).lte("created_at",d.end),
          ]);
          return {name:d.name,AI:a||0,Human:h||0};
        })),

        // Platform breakdown (pie)
        (async()=>{
          const platforms = ["messenger","instagram","whatsapp"];
          return Promise.all(platforms.map(async p=>{
            const {count}=await sb.from("conversations").select("*",{count:"exact",head:true}).eq("platform",p);
            return {name:p.charAt(0).toUpperCase()+p.slice(1),value:count||0};
          }));
        })(),

        // Order status breakdown (pie)
        (async()=>{
          const statuses = ["new","confirmed","shipped","delivered","cancelled","returned"];
          return Promise.all(statuses.map(async s=>{
            const {count}=await sb.from("orders").select("*",{count:"exact",head:true}).eq("status",s);
            return {name:s.charAt(0).toUpperCase()+s.slice(1),value:count||0};
          })).then(r=>r.filter(s=>s.value>0));
        })(),

        // Product-wise message count
        (async()=>{
          const {data:prods}=await sb.from("products").select("id,name").eq("is_active",true).limit(8);
          if(!prods||prods.length===0) return [];
          const counts = await Promise.all(prods.map(async p=>{
            const {count}=await sb.from("messages").select("*",{count:"exact",head:true}).ilike("content",`%${p.name.slice(0,10)}%`);
            return {product:p.name.length>18?p.name.slice(0,18)+"…":p.name,messages:count||0};
          }));
          return counts.filter(c=>c.messages>0).sort((a,b)=>b.messages-a.messages).slice(0,6);
        })(),
      ]);

      setRevData(rv); setAiData(ai);
      setPlatformData(plat.filter(p=>p.value>0));
      setOrderStatusData(status);
      setProductMsgData(prodMsg);
    } catch(e){
      console.error(e);
    }
    setLoading(false);
  };

  const totalRev = revData.reduce((s,r)=>s+r.revenue,0);
  const totalAI  = aiData.reduce((s,r)=>s+r.AI,0);
  const totalH   = aiData.reduce((s,r)=>s+r.Human,0);
  const aiPct    = Math.round((totalAI/(totalAI+totalH||1))*100);
  const totalConv= platformData.reduce((s,p)=>s+p.value,0);
  const totalOrd = orderStatusData.reduce((s,p)=>s+p.value,0);

  const sumCards = [
    {label:"7-Day Revenue",    value:`৳${totalRev.toLocaleString()}`, icon:<TrendingUp size={19} color="#10b981"/>, glow:"rgba(16,185,129,0.1)", border:"rgba(16,185,129,0.2)"},
    {label:"AI Automation",    value:`${aiPct}%`,                      icon:<Bot size={19} color="#a78bfa"/>,       glow:"rgba(139,92,246,0.1)", border:"rgba(139,92,246,0.25)"},
    {label:"Total Messages",   value:(totalAI+totalH).toLocaleString(),icon:<MessageCircle size={19} color="#22d3ee"/>,glow:"rgba(6,182,212,0.1)",border:"rgba(6,182,212,0.2)"},
    {label:"Total Orders",     value:totalOrd.toLocaleString(),        icon:<ShoppingCart size={19} color="#f59e0b"/>,glow:"rgba(245,158,11,0.1)",border:"rgba(245,158,11,0.2)"},
    {label:"Active Platforms", value:platformData.length.toString(),   icon:<Users size={19} color="#ec4899"/>,     glow:"rgba(236,72,153,0.1)", border:"rgba(236,72,153,0.2)"},
  ];

  const RADIAN = Math.PI / 180;
  const renderLabel = ({cx,cy,midAngle,innerRadius,outerRadius,percent}:any) => {
    if(percent<0.05) return null;
    const r = innerRadius+(outerRadius-innerRadius)*0.5;
    const x = cx+r*Math.cos(-midAngle*RADIAN);
    const y = cy+r*Math.sin(-midAngle*RADIAN);
    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>{`${(percent*100).toFixed(0)}%`}</text>;
  };

  return (
    <div style={{ ...pageWrap, maxWidth:1200 }}>
      {/* Header */}
      <div style={pageHeader}>
        <div>
          <h1 style={{ ...pageTitle, display:"flex", alignItems:"center", gap:10 }}>
            <BarChart3 size={22} color={C.brandLight}/> Analytics
          </h1>
          <p style={pageSubtitle}>7-day performance overview across all channels</p>
        </div>
        <div style={{ padding:"6px 14px", borderRadius:20, background:"rgba(139,92,246,0.1)", border:`1px solid ${C.borderBrand}`, fontSize:11, fontWeight:700, color:C.brandLight }}>
          Last 7 days
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:14, marginBottom:24 }}>
        {sumCards.map(c=>(
          <div key={c.label} style={{ background:C.card, border:`1px solid ${c.border}`, borderRadius:18, padding:20 }}>
            <div style={{ width:42,height:42,borderRadius:12,background:c.glow,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14 }}>{c.icon}</div>
            <div style={{ fontSize:26,fontWeight:900,color:C.textPrimary,letterSpacing:"-0.02em",marginBottom:3 }}>{loading?<div style={{...skeletonStyle,height:28,width:70}}/>:c.value}</div>
            <div style={{ fontSize:11,color:C.textMuted,fontWeight:600 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Row 1: Revenue + AI vs Human */}
      <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:16, marginBottom:16 }}>
        {/* Revenue area chart */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:18, padding:24 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
            <div style={{ fontSize:14,fontWeight:800,color:C.textPrimary }}>Revenue Trend</div>
            <div style={{ padding:"3px 10px",borderRadius:20,background:"rgba(16,185,129,0.1)",color:"#34d399",fontSize:11,fontWeight:700 }}>৳{totalRev.toLocaleString()}</div>
          </div>
          <div style={{height:220}}>
            {loading?<div style={{...skeletonStyle,height:"100%",borderRadius:12}}/>:(
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revData} margin={{top:5,right:5,left:-20,bottom:0}}>
                  <defs>
                    <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.08)" vertical={false}/>
                  <XAxis dataKey="name" stroke={C.textMuted} fontSize={11} tickLine={false} axisLine={false}/>
                  <YAxis stroke={C.textMuted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={v=>`৳${v}`}/>
                  <Tooltip contentStyle={tt} formatter={(v)=>[`৳${Number(v).toLocaleString()}`,"Revenue"]}/>
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} fill="url(#rg)" dot={{r:3.5,fill:"#10b981",strokeWidth:0}}/>
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* AI vs Human bar */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:18, padding:24 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
            <div style={{ fontSize:14,fontWeight:800,color:C.textPrimary }}>AI vs Human</div>
            <div style={{ padding:"3px 10px",borderRadius:20,background:"rgba(139,92,246,0.12)",color:C.brandLight,fontSize:11,fontWeight:700 }}>{aiPct}% automated</div>
          </div>
          <div style={{height:220}}>
            {loading?<div style={{...skeletonStyle,height:"100%",borderRadius:12}}/>:(
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aiData} margin={{top:5,right:5,left:-20,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.08)" vertical={false}/>
                  <XAxis dataKey="name" stroke={C.textMuted} fontSize={11} tickLine={false} axisLine={false}/>
                  <YAxis stroke={C.textMuted} fontSize={11} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={tt}/>
                  <Legend wrapperStyle={{fontSize:11,color:C.textMuted,paddingTop:8}}/>
                  <Bar dataKey="AI" fill="#8b5cf6" radius={[6,6,0,0]} maxBarSize={28}/>
                  <Bar dataKey="Human" fill="#f59e0b" radius={[6,6,0,0]} maxBarSize={28}/>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Platform Pie + Order Status Pie + Product Messages */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1.3fr", gap:16, marginBottom:16 }}>
        {/* Platform Pie */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:18, padding:24 }}>
          <div style={{ fontSize:14,fontWeight:800,color:C.textPrimary,marginBottom:20 }}>Conversations by Platform</div>
          <div style={{height:180,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {loading?<div style={{...skeletonStyle,height:"100%",width:"100%",borderRadius:12}}/>:
            platformData.length===0?(
              <div style={{textAlign:"center",color:C.textMuted,fontSize:12}}>No data yet</div>
            ):(
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={platformData} cx="50%" cy="50%" outerRadius={75} innerRadius={40} dataKey="value" labelLine={false} label={renderLabel}>
                    {platformData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                  </Pie>
                  <Tooltip contentStyle={tt}/>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {!loading && platformData.length>0 && (
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:12}}>
              {platformData.map((p,i)=>(
                <div key={p.name} style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:PIE_COLORS[i%PIE_COLORS.length]}}/>
                  <span style={{fontSize:11,color:C.textSecondary}}>{p.name} ({p.value})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Order Status Pie */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:18, padding:24 }}>
          <div style={{ fontSize:14,fontWeight:800,color:C.textPrimary,marginBottom:20 }}>Order Status Breakdown</div>
          <div style={{height:180}}>
            {loading?<div style={{...skeletonStyle,height:"100%",borderRadius:12}}/>:
            orderStatusData.length===0?(
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:C.textMuted,fontSize:12}}>No orders yet</div>
            ):(
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={orderStatusData} cx="50%" cy="50%" outerRadius={75} innerRadius={40} dataKey="value" labelLine={false} label={renderLabel}>
                    {orderStatusData.map((_,i)=><Cell key={i} fill={["#8b5cf6","#10b981","#22d3ee","#34d399","#fb7185","#f59e0b"][i%6]}/>)}
                  </Pie>
                  <Tooltip contentStyle={tt}/>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {!loading && orderStatusData.length>0 && (
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:12}}>
              {orderStatusData.map((s,i)=>(
                <div key={s.name} style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:["#8b5cf6","#10b981","#22d3ee","#34d399","#fb7185","#f59e0b"][i%6]}}/>
                  <span style={{fontSize:11,color:C.textSecondary}}>{s.name} ({s.value})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product Message Count */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:18, padding:24 }}>
          <div style={{ fontSize:14,fontWeight:800,color:C.textPrimary,marginBottom:6 }}>Product Mentions in Chats</div>
          <div style={{ fontSize:11,color:C.textMuted,marginBottom:18 }}>How often each product is discussed</div>
          <div style={{height:210}}>
            {loading?<div style={{...skeletonStyle,height:"100%",borderRadius:12}}/>:
            productMsgData.length===0?(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:10,color:C.textMuted}}>
                <MessageCircle size={40} style={{opacity:0.1}}/>
                <p style={{fontSize:12}}>No product data yet.</p>
                <p style={{fontSize:11,opacity:0.6}}>Add products first.</p>
              </div>
            ):(
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productMsgData} layout="vertical" margin={{top:0,right:10,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.08)" horizontal={false}/>
                  <XAxis type="number" stroke={C.textMuted} fontSize={11} tickLine={false} axisLine={false}/>
                  <YAxis type="category" dataKey="product" width={90} stroke={C.textMuted} fontSize={11} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={tt}/>
                  <Bar dataKey="messages" fill="url(#barGrad)" radius={[0,6,6,0]} maxBarSize={22}/>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6d28d9"/>
                      <stop offset="100%" stopColor="#a78bfa"/>
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
