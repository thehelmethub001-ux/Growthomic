"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Bot, ChevronRight, Home, Inbox, LogOut,
  Package, Settings, ShieldAlert, ShoppingCart,
  Sparkles, Tag, Users, ShieldX,
} from "lucide-react";
import { C } from "@/lib/styles";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const navGroups = [
  { label: "MAIN", items: [
    { href: "/overview",    icon: Home,         label: "Overview" },
    { href: "/inbox",       icon: Inbox,         label: "Inbox" },
    { href: "/human-queue", icon: ShieldAlert,   label: "Human Queue" },
  ]},
  { label: "COMMERCE", items: [
    { href: "/orders",      icon: ShoppingCart,  label: "Orders" },
    { href: "/products",    icon: Package,       label: "Products" },
    { href: "/offers",      icon: Tag,           label: "Offers & Events" },
    { href: "/crm",         icon: Users,         label: "CRM" },
  ]},
  { label: "INSIGHTS", items: [
    { href: "/analytics",   icon: BarChart3,     label: "Analytics" },
    { href: "/spam",        icon: ShieldX,       label: "Spam Queue" },
  ]},
  { label: "SETTINGS", items: [
    { href: "/ai-settings", icon: Bot,           label: "AI Settings" },
    { href: "/settings",    icon: Settings,      label: "Settings" },
  ]},
];

const pageName: Record<string, string> = {
  "/overview": "Overview", "/inbox": "Inbox", "/human-queue": "Human Queue",
  "/orders": "Orders", "/products": "Products", "/offers": "Offers & Events",
  "/crm": "CRM", "/analytics": "Analytics", "/spam": "Spam Queue",
  "/ai-settings": "AI Settings", "/settings": "Settings",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [aiAutomationEnabled, setAiAutomationEnabled] = useState(true);
  const [togglingAi, setTogglingAi] = useState(false);

  useEffect(() => {
    supabase.from("business_settings").select("ai_automation_enabled, ai_reply_mode").limit(1).single()
      .then(({ data }) => {
        if (data) {
          if (data.ai_reply_mode === "off" || data.ai_automation_enabled === false) {
            setAiAutomationEnabled(false);
          } else {
            setAiAutomationEnabled(true);
          }
        }
      });
  }, []);

  const toggleAiAutomation = async () => {
    setTogglingAi(true);
    const nextState = !aiAutomationEnabled;
    setAiAutomationEnabled(nextState);
    const { data: existing } = await supabase.from("business_settings").select("id").limit(1).single();
    if (existing) {
      await supabase.from("business_settings").update({ 
        ai_automation_enabled: nextState,
        ai_reply_mode: nextState ? "full_auto" : "off"
      }).eq("id", existing.id);
    }
    setTogglingAi(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const currentPage = Object.entries(pageName).find(([k]) => pathname.startsWith(k))?.[1] ?? "Dashboard";

  return (
    <div style={{ display:"flex", width:"100vw", height:"100vh", overflow:"hidden", background:"var(--bg-base)", position:"relative" }}>

      {/* Ambient orbs */}
      <div style={{ position:"absolute", width:600, height:600, borderRadius:"50%", background:"radial-gradient(circle,hsla(262,83%,58%,0.07) 0%,transparent 65%)", top:-250, left:-200, pointerEvents:"none", zIndex:0, animation:"orb-drift-1 22s ease-in-out infinite" }}/>
      <div style={{ position:"absolute", width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,hsla(271,91%,65%,0.05) 0%,transparent 65%)", bottom:-150, right:-100, pointerEvents:"none", zIndex:0, animation:"orb-drift-2 18s ease-in-out infinite" }}/>

      {/* ── Sidebar ─────────────────────────── */}
      <div style={{
        width:240, minWidth:240, height:"100vh", flexShrink:0, zIndex:10, position:"relative",
        display:"flex", flexDirection:"column",
        background:"hsla(248,12%,7%,0.9)",
        backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
        borderRight:"1px solid var(--border)",
      }}>
        {/* Top glow line */}
        <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:"linear-gradient(90deg,transparent,var(--primary),var(--accent),transparent)", opacity:0.6 }}/>

        {/* Logo */}
        <div style={{ padding:"18px 14px 14px", borderBottom:"1px solid var(--border-white)", display:"flex", alignItems:"center", gap:11, flexShrink:0 }}>
          <div style={{
            width:34, height:34, borderRadius:10, flexShrink:0,
            background:"linear-gradient(135deg,var(--primary),var(--accent))",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 0 20px var(--primary-glow)",
            animation:"glow-pulse 3s ease-in-out infinite",
          }}>
            <Sparkles size={15} color="#fff"/>
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"var(--text-primary)", letterSpacing:"-0.025em" }} className="gradient-text">Growthomic</div>
            <div style={{ fontSize:9, color:"var(--text-muted)", fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", marginTop:1 }}>AI Sales Agent</div>
          </div>
        </div>

        {/* Navigation Wrapper */}
        <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
          {/* Scrollable Navigation */}
          <div style={{ flex:1, overflowY:"auto", padding:"12px 8px" }}>
            {navGroups.map((group, gi) => (
              <motion.div key={group.label} initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay:gi*0.07, duration:0.3 }} style={{ marginBottom:20 }}>
                <div style={{ fontSize:9, fontWeight:700, color:"var(--text-muted)", letterSpacing:"0.12em", padding:"0 10px", marginBottom:5, textTransform:"uppercase" }}>
                  {group.label}
                </div>
                {group.items.map(({ href, icon: Icon, label }) => {
                  const active = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <Link key={href} href={href} style={{
                      display:"flex", alignItems:"center", gap:9, padding:"8px 10px", borderRadius:9, marginBottom:1,
                      color: active ? "#fff" : "var(--text-secondary)",
                      background: active ? "hsla(262,83%,58%,0.12)" : "transparent",
                      fontWeight: active ? 600 : 400, fontSize:13,
                      border: active ? "1px solid hsla(262,83%,58%,0.22)" : "1px solid transparent",
                      position:"relative", transition:"all 0.12s", letterSpacing:"-0.01em",
                    }}>
                      {active && (
                        <motion.div layoutId="nav-pill" style={{
                          position:"absolute", left:0, top:"20%", bottom:"20%", width:3,
                          background:"linear-gradient(180deg,var(--primary),var(--accent))",
                          borderRadius:"0 3px 3px 0",
                        }}/>
                      )}
                      <Icon size={14} style={{ flexShrink:0, opacity:active?1:0.5, color:active?"var(--primary-light)":"inherit" }}/>
                      <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{label}</span>
                      {active && <ChevronRight size={11} style={{ opacity:0.4 }}/>}
                    </Link>
                  );
                })}
              </motion.div>
            ))}
          </div>
        </div>

        {/* AI Status */}
        <div style={{ padding:"0 8px 8px", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 12px", borderRadius:10, background:"hsla(262,83%,58%,0.06)", border:"1px solid hsla(262,83%,58%,0.15)" }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"var(--green)", animation:"pulse 2s infinite", flexShrink:0 }}/>
            <span style={{ fontSize:12, fontWeight:500, color:"var(--primary-light)", flex:1 }}>AI Agent Online</span>
          </div>
        </div>

        {/* User footer */}
        <div style={{ padding:"8px 8px 12px", borderTop:"1px solid var(--border-white)", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, padding:"8px 11px", borderRadius:10, background:"var(--bg-elevated)", border:"1px solid var(--border-white)", marginBottom:4 }}>
            <div style={{ width:28, height:28, borderRadius:8, flexShrink:0, background:"linear-gradient(135deg,var(--primary),var(--accent))", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#fff" }}>A</div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:600, color:"var(--text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>Admin</div>
              <div style={{ fontSize:10, color:"var(--text-muted)" }}>Growthomic</div>
            </div>
          </div>
          <button onClick={handleLogout} style={{
            display:"flex", alignItems:"center", gap:7, width:"100%",
            padding:"6px 11px", borderRadius:9, fontSize:12, fontWeight:400,
            color:"var(--text-muted)", background:"none", border:"none", transition:"color 0.12s",
          }}
          onMouseEnter={e=>e.currentTarget.style.color="var(--text-primary)"}
          onMouseLeave={e=>e.currentTarget.style.color="var(--text-muted)"}>
            <LogOut size={13}/> Sign Out
          </button>
        </div>
      </div>

      {/* ── Main Area ─────────────────────── */}
      <div style={{ flex:1, height:"100vh", display:"flex", flexDirection:"column", minWidth:0, position:"relative", zIndex:5 }}>

        {/* Top Header Bar */}
        <div style={{
          height:52, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 28px", borderBottom:"1px solid var(--border-white)",
          background:"hsla(248,12%,7%,0.6)", backdropFilter:"blur(12px)",
        }}>
          <div>
            <div style={{ fontSize:10, color:"var(--text-muted)", fontWeight:500, letterSpacing:"0.04em" }}>Dashboard</div>
            <div style={{ fontSize:14, fontWeight:600, color:"var(--text-primary)", letterSpacing:"-0.02em" }}>{currentPage}</div>
          </div>
          
          {/* Interactive Global AI Automation Toggle Switch */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button
              onClick={toggleAiAutomation}
              disabled={togglingAi}
              title={aiAutomationEnabled ? "Click to Pause AI Automation" : "Click to Enable AI Automation"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                borderRadius: 20,
                border: `1px solid ${aiAutomationEnabled ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)"}`,
                background: aiAutomationEnabled ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)",
                color: aiAutomationEnabled ? "#34d399" : "#fb7185",
                fontSize: 12,
                fontWeight: 600,
                cursor: togglingAi ? "not-allowed" : "pointer",
                transition: "all 0.2s"
              }}
            >
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: aiAutomationEnabled ? "#34d399" : "#fb7185",
                boxShadow: aiAutomationEnabled ? "0 0 8px #34d399" : "none",
                animation: aiAutomationEnabled ? "pulse 2s infinite" : "none"
              }} />
              {aiAutomationEnabled ? "🤖 AI Automation: ON" : "⏸️ AI Automation: OFF"}
            </button>
          </div>
        </div>

        {/* Page Content Wrapper */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0, overflow:"hidden" }}>
          {/* Scrollable Page Content */}
          <div style={{ flex:1, overflowY:"auto", overflowX:"hidden", minHeight:0 }}>
            <motion.div
              key={pathname}
              initial={{ opacity:0 }}
              animate={{ opacity:1 }}
              transition={{ duration:0.18, ease:"easeOut" }}
              style={{ minHeight:"100%" }}
            >
              {children}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
