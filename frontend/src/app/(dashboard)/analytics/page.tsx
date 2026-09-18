"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { pageWrap, pageTitle, pageSubtitle, pageHeader, skeletonStyle } from "@/lib/styles";
import { BarChart3, TrendingUp, MessageCircle, Bot, ShoppingCart, Users } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell
} from "recharts";

const PIE_COLORS = ["#8b5cf6","#a78bfa","#6d28d9","#c084fc","#4c1d95","#7c3aed"];
const STATUS_COLORS = ["#8b5cf6","#10b981","#22d3ee","#34d399","#fb7185","#f59e0b"];

const tt: React.CSSProperties = {
  backgroundColor: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text-primary)",
  boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
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
    {label:"7-Day Revenue",    value:`৳${totalRev.toLocaleString()}`, icon:<TrendingUp size={16} color="var(--text-muted)"/>},
    {label:"AI Automation",    value:`${aiPct}%`,                      icon:<Bot size={16} color="var(--text-muted)"/>},
    {label:"Total Messages",   value:(totalAI+totalH).toLocaleString(),icon:<MessageCircle size={16} color="var(--text-muted)"/>},
    {label:"Total Orders",     value:totalOrd.toLocaleString(),        icon:<ShoppingCart size={16} color="var(--text-muted)"/>},
    {label:"Active Platforms", value:platformData.length.toString(),   icon:<Users size={16} color="var(--text-muted)"/>},
  ];

  const RADIAN = Math.PI / 180;
  const renderLabel = ({cx,cy,midAngle,innerRadius,outerRadius,percent}:any) => {
    if(percent<0.05) return null;
    const r = innerRadius+(outerRadius-innerRadius)*0.5;
    const x = cx+r*Math.cos(-midAngle*RADIAN);
    const y = cy+r*Math.sin(-midAngle*RADIAN);
    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>{`${(percent*100).toFixed(0)}%`}</text>;
  };

  return (
    <div style={{ ...pageWrap }}>
      {/* Header */}
      <div style={pageHeader}>
        <div>
          <h1 style={{ ...pageTitle, display:"flex", alignItems:"center", gap:10 }}>
            <BarChart3 size={20} color="var(--text-primary)"/> Analytics
          </h1>
          <p style={pageSubtitle}>7-day performance overview across all channels</p>
        </div>
        <div style={{ padding:"6px 14px", borderRadius:100, background:"var(--bg-elevated)", border:"1px solid var(--border)", fontSize:11, fontWeight:600, color:"var(--text-secondary)" }}>
          Last 7 days
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:14, marginBottom:24 }}>
        {sumCards.map(c=>(
          <div key={c.label} style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--r-lg)", padding:20, display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:36,height:36,borderRadius:"var(--r-md)",background:"var(--bg-elevated)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{c.icon}</div>
            <div>
              <div style={{ fontSize:22,fontWeight:600,color:"var(--text-primary)",letterSpacing:"-0.02em",lineHeight:1 }}>{loading?<div style={{...skeletonStyle,height:22,width:70,marginTop:2}}/>:c.value}</div>
              <div style={{ fontSize:11,color:"var(--text-muted)",fontWeight:500,marginTop:4 }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Row 1: Revenue + AI vs Human */}
      <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:16, marginBottom:16 }}>
        {/* Revenue area chart */}
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--r-lg)", padding:24 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
            <div style={{ fontSize:14,fontWeight:600,color:"var(--text-primary)" }}>Revenue Trend</div>
            <div style={{ padding:"3px 10px",borderRadius:100,background:"var(--bg-elevated)",border:"1px solid var(--border)",color:"var(--text-secondary)",fontSize:11,fontWeight:500 }}>৳{totalRev.toLocaleString()}</div>
          </div>
          <div style={{height:220}}>
            {loading?<div style={{...skeletonStyle,height:"100%",borderRadius:"var(--r-md)"}}/>:(
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revData} margin={{top:5,right:5,left:-20,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false}/>
                  <XAxis dataKey="name" stroke="#888" fontSize={11} tickLine={false} axisLine={false}/>
                  <YAxis stroke="#888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v=>`৳${v}`}/>
                  <Tooltip contentStyle={tt} formatter={(v:any)=>[`৳${Number(v).toLocaleString()}`,"Revenue"]}/>
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="#10b981" fillOpacity={0.15} dot={{r:3,fill:"var(--bg-card)",stroke:"#10b981",strokeWidth:2}} activeDot={{r:5,fill:"#10b981"}}/>
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* AI vs Human bar */}
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--r-lg)", padding:24 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
            <div style={{ fontSize:14,fontWeight:600,color:"var(--text-primary)" }}>AI vs Human Messages</div>
            <div style={{ padding:"3px 10px",borderRadius:100,background:"var(--bg-elevated)",border:"1px solid var(--border)",color:"var(--brand-light)",fontSize:11,fontWeight:500 }}>{aiPct}% automated</div>
          </div>
          <div style={{height:220}}>
            {loading?<div style={{...skeletonStyle,height:"100%",borderRadius:"var(--r-md)"}}/>:(
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aiData} margin={{top:5,right:5,left:-20,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false}/>
                  <XAxis dataKey="name" stroke="#888" fontSize={11} tickLine={false} axisLine={false}/>
                  <YAxis stroke="#888" fontSize={11} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={tt}/>
                  <Legend wrapperStyle={{fontSize:11,color:"#888",paddingTop:8}}/>
                  <Bar dataKey="AI" fill="#8b5cf6" radius={[4,4,0,0]} maxBarSize={28}/>
                  <Bar dataKey="Human" fill="#f59e0b" radius={[4,4,0,0]} maxBarSize={28}/>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Platform Pie + Order Status Pie + Product Messages */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1.3fr", gap:16, marginBottom:16 }}>
        {/* Platform Pie */}
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--r-lg)", padding:24 }}>
          <div style={{ fontSize:14,fontWeight:600,color:"var(--text-primary)",marginBottom:20 }}>Conversations by Platform</div>
          <div style={{height:180,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {loading?<div style={{...skeletonStyle,height:"100%",width:"100%",borderRadius:"var(--r-md)"}}/>:
            platformData.length===0?(
              <div style={{textAlign:"center",color:"var(--text-muted)",fontSize:12}}>No data yet</div>
            ):(
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={platformData} cx="50%" cy="50%" outerRadius={75} innerRadius={45} dataKey="value" stroke="none" labelLine={false} label={renderLabel}>
                    {platformData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                  </Pie>
                  <Tooltip contentStyle={tt} itemStyle={{color:"var(--text-primary)"}}/>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {!loading && platformData.length>0 && (
            <div style={{display:"flex",flexWrap:"wrap",gap:10,marginTop:16,justifyContent:"center"}}>
              {platformData.map((p,i)=>(
                <div key={p.name} style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:10,height:10,borderRadius:"2px",background:PIE_COLORS[i%PIE_COLORS.length]}}/>
                  <span style={{fontSize:11,color:"var(--text-secondary)",fontWeight:500}}>{p.name} ({p.value})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Order Status Pie */}
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--r-lg)", padding:24 }}>
          <div style={{ fontSize:14,fontWeight:600,color:"var(--text-primary)",marginBottom:20 }}>Order Status Breakdown</div>
          <div style={{height:180}}>
            {loading?<div style={{...skeletonStyle,height:"100%",borderRadius:"var(--r-md)"}}/>:
            orderStatusData.length===0?(
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"var(--text-muted)",fontSize:12}}>No orders yet</div>
            ):(
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={orderStatusData} cx="50%" cy="50%" outerRadius={75} innerRadius={45} dataKey="value" stroke="none" labelLine={false} label={renderLabel}>
                    {orderStatusData.map((_,i)=><Cell key={i} fill={STATUS_COLORS[i%STATUS_COLORS.length]}/>)}
                  </Pie>
                  <Tooltip contentStyle={tt} itemStyle={{color:"var(--text-primary)"}}/>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {!loading && orderStatusData.length>0 && (
            <div style={{display:"flex",flexWrap:"wrap",gap:10,marginTop:16,justifyContent:"center"}}>
              {orderStatusData.map((s,i)=>(
                <div key={s.name} style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:10,height:10,borderRadius:"2px",background:STATUS_COLORS[i%STATUS_COLORS.length]}}/>
                  <span style={{fontSize:11,color:"var(--text-secondary)",fontWeight:500}}>{s.name} ({s.value})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product Message Count */}
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--r-lg)", padding:24 }}>
          <div style={{ fontSize:14,fontWeight:600,color:"var(--text-primary)",marginBottom:4 }}>Product Mentions in Chats</div>
          <div style={{ fontSize:11,color:"var(--text-muted)",marginBottom:20 }}>How often each product is discussed</div>
          <div style={{height:210}}>
            {loading?<div style={{...skeletonStyle,height:"100%",borderRadius:"var(--r-md)"}}/>:
            productMsgData.length===0?(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:10,color:"var(--text-muted)"}}>
                <MessageCircle size={32} style={{opacity:0.2}}/>
                <p style={{fontSize:12}}>No product data yet.</p>
              </div>
            ):(
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productMsgData} layout="vertical" margin={{top:0,right:10,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false}/>
                  <XAxis type="number" stroke="#888" fontSize={11} tickLine={false} axisLine={false}/>
                  <YAxis type="category" dataKey="product" width={100} stroke="#888" fontSize={11} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={tt} cursor={{fill:"rgba(255,255,255,0.05)"}}/>
                  <Bar dataKey="messages" fill="#8b5cf6" radius={[0,4,4,0]} maxBarSize={20}/>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
