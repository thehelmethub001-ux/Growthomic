"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/overview",    icon: "dashboard",        label: "Overview" },
  { href: "/inbox",       icon: "forum",            label: "Inbox" },
  { href: "/human-queue", icon: "support_agent",    label: "Human Queue" },
  { href: "/orders",      icon: "shopping_bag",     label: "Orders" },
  { href: "/products",    icon: "inventory_2",      label: "Products" },
  { href: "/offers",      icon: "local_offer",      label: "Offers & Events" },
  { href: "/crm",         icon: "people",           label: "CRM" },
  { href: "/analytics",   icon: "monitoring",       label: "Analytics" },
  { href: "/spam",        icon: "block",            label: "Spam Queue" },
  { href: "/ai-settings", icon: "smart_toy",        label: "AI Settings" },
  { href: "/settings",    icon: "settings",         label: "Settings" },
];

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
      setAiEnabled(data.ai_reply_mode !== "off" && data.ai_automation_enabled !== false);
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

  return (
    <div style={{ display: "grid", gridTemplateColumns: "var(--sidebar-full) 1fr", width: "100vw", height: "100vh", overflow: "hidden", background: "#131313" }}>

      {/* Mobile backdrop */}
      {mobileNavOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`dashboard-sidebar ${mobileNavOpen ? "mobile-open" : ""}`}
        style={{
          height: "100vh", display: "flex", flexDirection: "column",
          background: "#0e0e0e",
          borderRight: "1px solid rgba(73,68,84,0.3)",
          overflow: "hidden", position: "relative", zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(73,68,84,0.2)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 4, flexShrink: 0,
              background: "#a078ff",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#fff" }}>bolt</span>
            </div>
            <div className="sidebar-logo-text" style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.025em", fontFamily: "Geist, system-ui" }}>
                Growthomic
              </div>
              <div style={{ fontSize: 10, color: "#958ea0", letterSpacing: "0.01em", marginTop: 1 }}>
                AI Sales Force
              </div>
            </div>
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
              style={{ background: "none", border: "none", color: "#958ea0", cursor: "pointer", display: "none", padding: 4 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>

          {/* Deploy Agent button */}
          <button
            className="sidebar-nav-label"
            style={{
              width: "100%", marginTop: 12,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "7px 12px",
              background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.35)",
              borderRadius: 4, color: "#e5e2e1",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
              transition: "background 0.12s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#201f1f")}
            onMouseLeave={e => (e.currentTarget.style.background = "#1c1b1b")}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#d0bcff" }}>add</span>
            Deploy Agent
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
          {navItems.map(({ href, icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                title={label}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 8px",
                  borderRadius: 4,
                  marginBottom: 1,
                  color: active ? "#e5e2e1" : "#958ea0",
                  background: active ? "#1c1b1b" : "transparent",
                  fontWeight: active ? 500 : 400,
                  fontSize: 13,
                  position: "relative",
                  transition: "background 0.1s, color 0.1s",
                  borderLeft: active ? "2px solid #a078ff" : "2px solid transparent",
                  overflow: "hidden", whiteSpace: "nowrap",
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.color = "#e5e2e1"; e.currentTarget.style.background = "rgba(14,14,14,0.5)"; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.color = "#958ea0"; e.currentTarget.style.background = "transparent"; } }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18, flexShrink: 0, color: active ? "#d0bcff" : "inherit" }}
                >
                  {icon}
                </span>
                <span className="sidebar-nav-label" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* AI Status + User Footer */}
        <div style={{ borderTop: "1px solid rgba(73,68,84,0.2)", flexShrink: 0 }}>
          {/* AI Status */}
          <div className="sidebar-ai-badge" style={{ padding: "10px 12px 6px" }}>
            <button
              onClick={toggleAi}
              disabled={togglingAi}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 7,
                padding: "7px 10px", borderRadius: 4,
                background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)",
                color: "#e5e2e1", fontSize: 12, fontWeight: 500, cursor: "pointer",
                transition: "background 0.12s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#201f1f")}
              onMouseLeave={e => (e.currentTarget.style.background = "#1c1b1b")}
            >
              <div style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: aiEnabled ? "#22c55e" : "#ef4444",
                animation: aiEnabled ? "pulse 2s infinite" : "none",
              }} />
              <span style={{ flex: 1, textAlign: "left" }}>AI {aiEnabled ? "Active" : "Paused"}</span>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#958ea0" }}>
                {aiEnabled ? "toggle_on" : "toggle_off"}
              </span>
            </button>
          </div>

          {/* User */}
          <div style={{ padding: "6px 12px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px", borderRadius: 4 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 4, flexShrink: 0,
                background: "#a078ff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "#340080",
              }}>A</div>
              <div className="sidebar-user-name" style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#e5e2e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Admin
                </div>
                <div style={{ fontSize: 10, color: "#958ea0" }}>Growthomic</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                display: "flex", alignItems: "center", gap: 7, width: "100%",
                padding: "5px 6px", borderRadius: 4,
                fontSize: 12, color: "#958ea0", background: "none",
                border: "none", cursor: "pointer", transition: "color 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#cbc3d7")}
              onMouseLeave={e => (e.currentTarget.style.color = "#958ea0")}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>logout</span>
              <span className="sidebar-logout-label">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {/* Top bar */}
        <header style={{
          height: 48, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px",
          borderBottom: "1px solid rgba(73,68,84,0.3)",
          background: "#0e0e0e",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              style={{
                background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)",
                borderRadius: 4, padding: "4px 6px",
                color: "#e5e2e1", cursor: "pointer", display: "none",
                alignItems: "center", justifyContent: "center",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>menu</span>
            </button>

            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#958ea0", fontWeight: 500 }}>Dashboard</span>
              <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#494454" }}>chevron_right</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#e5e2e1", fontFamily: "Geist, system-ui" }}>
                {navItems.find(n => pathname.startsWith(n.href))?.label ?? "Dashboard"}
              </span>
            </div>
          </div>

          {/* AI toggle chip */}
          <button
            onClick={toggleAi}
            disabled={togglingAi}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 12px", borderRadius: 100,
              border: `1px solid ${aiEnabled ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
              background: aiEnabled ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)",
              color: aiEnabled ? "#4ade80" : "#f87171",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
              transition: "all 0.15s", fontFamily: "inherit",
            }}
          >
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: aiEnabled ? "#22c55e" : "#ef4444",
              animation: aiEnabled ? "pulse 2s infinite" : "none",
            }} />
            AI Automation: {aiEnabled ? "Active" : "Paused"}
          </button>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0, background: "#131313" }}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{ minHeight: "100%" }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
