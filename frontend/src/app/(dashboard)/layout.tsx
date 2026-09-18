"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Bot, ChevronRight, Home, Inbox, LogOut,
  Package, Settings, ShieldAlert, ShoppingCart,
  Tag, Users, ShieldX, Menu, X, Zap,
} from "lucide-react";
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
  { label: "CONFIG", items: [
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
  const [aiEnabled, setAiEnabled] = useState(true);
  const [togglingAi, setTogglingAi] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  const loadAiStatus = useCallback(async () => {
    const { data } = await supabase
      .from("business_settings")
      .select("ai_automation_enabled, ai_reply_mode")
      .limit(1).single();
    if (data) {
      setAiEnabled(
        data.ai_reply_mode !== "off" && data.ai_automation_enabled !== false
      );
    }
  }, [supabase]);

  useEffect(() => { loadAiStatus(); }, [loadAiStatus]);

  const toggleAi = async () => {
    setTogglingAi(true);
    const next = !aiEnabled;
    setAiEnabled(next);
    const { data: s } = await supabase.from("business_settings").select("id").limit(1).single();
    if (s) {
      await supabase.from("business_settings").update({
        ai_automation_enabled: next,
        ai_reply_mode: next ? "full_auto" : "off",
      }).eq("id", s.id);
    }
    setTogglingAi(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const currentPage = Object.entries(pageName).find(([k]) => pathname.startsWith(k))?.[1] ?? "Dashboard";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "var(--sidebar-full) 1fr",
      width: "100vw",
      height: "100vh",
      overflow: "hidden",
      background: "var(--bg-base)",
    }}>

      {/* ── Mobile backdrop */}
      {mobileNavOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />
      )}

      {/* ── Sidebar ─────────────────────────── */}
      <aside
        className={`dashboard-sidebar ${mobileNavOpen ? "mobile-open" : ""}`}
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-void)",
          borderRight: "1px solid var(--border)",
          overflow: "hidden",
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 14px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          {/* Logo mark */}
          <div style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: "var(--brand)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Zap size={14} color="#fff" fill="#fff" />
          </div>
          {/* Text — hides in icon-only mode via CSS class */}
          <div className="sidebar-logo-text" style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
              letterSpacing: "-0.025em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              Growthomic
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.03em", marginTop: 1 }}>
              AI Sales Agent
            </div>
          </div>
          {/* Mobile close */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "none", padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "10px 6px" }}>
          {navGroups.map((group, gi) => (
            <div key={group.label} style={{ marginBottom: 18 }}>
              {gi > 0 && <div style={{ height: 1, background: "var(--border)", margin: "0 0 12px" }} />}
              {/* Section label */}
              <div className="sidebar-section-label" style={{
                fontSize: 9, fontWeight: 600, color: "var(--text-muted)",
                letterSpacing: "0.1em", padding: "0 10px", marginBottom: 4,
                textTransform: "uppercase",
              }}>
                {group.label}
              </div>

              {group.items.map(({ href, icon: Icon, label }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    title={label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      padding: "7px 10px",
                      borderRadius: "var(--r-md)",
                      marginBottom: 1,
                      color: active ? "var(--text-primary)" : "var(--text-muted)",
                      background: active ? "var(--bg-elevated)" : "transparent",
                      fontWeight: active ? 500 : 400,
                      fontSize: 13,
                      position: "relative",
                      transition: "background 0.1s, color 0.1s",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {/* Active indicator */}
                    {active && (
                      <motion.div
                        layoutId="nav-indicator"
                        style={{
                          position: "absolute", left: 0, top: "15%", bottom: "15%", width: 2,
                          background: "var(--brand)", borderRadius: "0 2px 2px 0",
                        }}
                      />
                    )}
                    <Icon
                      size={15}
                      style={{
                        flexShrink: 0,
                        color: active ? "var(--brand-light)" : "inherit",
                        opacity: active ? 1 : 0.6,
                      }}
                    />
                    <span className="sidebar-nav-label" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {label}
                    </span>
                    {active && (
                      <ChevronRight size={10} className="sidebar-nav-label" style={{ opacity: 0.35, flexShrink: 0 }} />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* AI status indicator */}
        <div className="sidebar-ai-badge" style={{ padding: "0 10px 8px", flexShrink: 0 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "7px 10px", borderRadius: "var(--r-md)",
            background: "var(--bg-elevated)", border: "1px solid var(--border)",
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
              background: aiEnabled ? "var(--green)" : "var(--red)",
              animation: aiEnabled ? "pulse 2s infinite" : "none",
            }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>
              AI {aiEnabled ? "Active" : "Paused"}
            </span>
          </div>
        </div>

        {/* User footer */}
        <div style={{
          padding: "8px 10px 12px",
          borderTop: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 9,
            padding: "7px 8px", borderRadius: "var(--r-md)",
            marginBottom: 2,
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: "var(--r-sm)", flexShrink: 0,
              background: "var(--brand)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 600, color: "#fff",
            }}>
              A
            </div>
            <div className="sidebar-user-name" style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Admin
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Growthomic</div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            style={{
              display: "flex", alignItems: "center", gap: 7, width: "100%",
              padding: "6px 8px", borderRadius: "var(--r-md)",
              fontSize: 12, color: "var(--text-muted)", background: "none",
              border: "none", cursor: "pointer", fontFamily: "inherit",
              transition: "color 0.1s",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text-secondary)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <LogOut size={13} />
            <span className="sidebar-logout-label">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Area ─────────────────────── */}
      <div style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        overflow: "hidden",
      }}>
        {/* Top bar */}
        <header style={{
          height: 52,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-void)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Mobile hamburger */}
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              style={{
                background: "var(--bg-elevated)", border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)", padding: "5px 7px",
                color: "var(--text-primary)", cursor: "pointer", display: "none",
                alignItems: "center", justifyContent: "center",
              }}
            >
              <Menu size={16} />
            </button>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Dashboard
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.015em" }}>
                {currentPage}
              </div>
            </div>
          </div>

          {/* AI Automation toggle */}
          <button
            onClick={toggleAi}
            disabled={togglingAi}
            title={aiEnabled ? "Click to pause AI" : "Click to enable AI"}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "5px 12px", borderRadius: 100,
              border: `1px solid ${aiEnabled ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
              background: aiEnabled ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)",
              color: aiEnabled ? "var(--green-light)" : "var(--red-light)",
              fontSize: 12, fontWeight: 500, cursor: togglingAi ? "not-allowed" : "pointer",
              transition: "all 0.15s", fontFamily: "inherit",
            }}
          >
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: aiEnabled ? "var(--green)" : "var(--red)",
              animation: aiEnabled ? "pulse 2s infinite" : "none",
            }} />
            AI Automation: {aiEnabled ? "Active" : "Paused"}
          </button>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{ minHeight: "100%" }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
