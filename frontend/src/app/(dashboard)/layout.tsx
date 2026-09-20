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
    <div className="dashboard-layout">

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

        {/* AI Status + Workspace Footer */}
        <div style={{ borderTop: "1px solid rgba(73,68,84,0.2)", flexShrink: 0 }}>
          {/* Documentation & Support links */}
          <div style={{ padding: "8px 12px 4px", display: "flex", flexDirection: "column", gap: 2 }}>
            <Link
              href="/settings"
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 4, fontSize: 12, color: "#958ea0", textDecoration: "none" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#958ea0" }}>menu_book</span>
              <span>Documentation</span>
            </Link>
            <Link
              href="/settings"
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 4, fontSize: 12, color: "#958ea0", textDecoration: "none" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#958ea0" }}>headset_mic</span>
              <span>Support</span>
            </Link>
          </div>

          {/* Workspace Switcher */}
          <div style={{ padding: "6px 12px 10px" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "7px 10px", borderRadius: 6,
              background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                  background: "rgba(160,120,255,0.2)", border: "1px solid rgba(160,120,255,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: "#d0bcff",
                }}>H</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#e5e2e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    Helmet Shop BD
                  </div>
                </div>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#958ea0" }}>unfold_more</span>
            </div>

            {/* Sign Out */}
            <button
              onClick={handleLogout}
              style={{
                display: "flex", alignItems: "center", gap: 6, width: "100%",
                marginTop: 6, padding: "5px 8px", borderRadius: 4,
                fontSize: 11, color: "#958ea0", background: "none",
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

      {/* ── Main Canvas ── */}
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {/* Top bar — Stitch MD3 Navigation */}
        <header style={{
          height: 56, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px",
          borderBottom: "1px solid rgba(73,68,84,0.3)",
          background: "#0e0e0e",
          gap: 16,
        }}>
          {/* Left: Mobile Toggle & Global Search */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, maxWidth: 480 }}>
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

            {/* Stitch Search input with ⌘K badge */}
            <div style={{
              position: "relative", width: "100%", maxWidth: 300,
              display: "flex", alignItems: "center", flexShrink: 1,
            }}>
              <span className="material-symbols-outlined" style={{
                position: "absolute", left: 10, fontSize: 16, color: "#958ea0", pointerEvents: "none", zIndex: 1,
              }}>search</span>
              <input
                type="text"
                placeholder="Search conversations, agents..."
                style={{
                  width: "100%", background: "#1c1b1b",
                  border: "1px solid rgba(73,68,84,0.35)", borderRadius: 6,
                  padding: "6px 42px 6px 34px", fontSize: 12, color: "#e5e2e1",
                  outline: "none", fontFamily: "inherit",
                }}
              />
              <span style={{
                position: "absolute", right: 8, fontSize: 10,
                background: "#2a2a2a", border: "1px solid rgba(73,68,84,0.4)",
                padding: "1px 5px", borderRadius: 4, color: "#958ea0", fontWeight: 500,
                pointerEvents: "none",
              }}>⌘K</span>
            </div>

            {/* Quick links: Live Feed, Agent Actions, Workspaces */}
            <div style={{ display: "none" }} className="topbar-desktop-links">
              <span style={{ fontSize: 12, color: "#958ea0", cursor: "pointer" }}>Live Feed</span>
              <span style={{ fontSize: 12, color: "#e5e2e1", fontWeight: 500, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                Agent Actions <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#a078ff" }} />
              </span>
              <span style={{ fontSize: 12, color: "#958ea0", cursor: "pointer" }}>Workspaces</span>
            </div>
          </div>

          {/* Right Action Cluster */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {/* Live Status Active Pill */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)",
              padding: "4px 10px", borderRadius: 100, fontSize: 11, fontWeight: 500, color: "#e5e2e1",
              whiteSpace: "nowrap", flexShrink: 0,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
              <span>Live Status: Active</span>
            </div>

            {/* AI Toggle Button */}
            <button
              onClick={toggleAi}
              disabled={togglingAi}
              title="Toggle AI Automation"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: 6,
                border: `1px solid ${aiEnabled ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                background: aiEnabled ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                color: aiEnabled ? "#4ade80" : "#f87171",
                fontSize: 11, fontWeight: 500, cursor: "pointer",
                transition: "all 0.15s", fontFamily: "inherit",
                whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                {aiEnabled ? "smart_toy" : "pause_circle"}
              </span>
              <span>AI {aiEnabled ? "Active" : "Off"}</span>
            </button>

            {/* + New Campaign Button (Navigates to Offers) */}
            <Link
              href="/offers"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "#a078ff", color: "#340080",
                padding: "5px 12px", borderRadius: 6,
                fontSize: 12, fontWeight: 600, textDecoration: "none",
                cursor: "pointer", transition: "opacity 0.15s",
                whiteSpace: "nowrap", flexShrink: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15, fontWeight: "bold" }}>add</span>
              <span>New Campaign</span>
            </Link>

            <div style={{ width: 1, height: 16, background: "rgba(73,68,84,0.3)", margin: "0 2px" }} />

            {/* Notification Bell */}
            <Link
              href="/human-queue"
              title="Escalation alerts"
              style={{
                width: 32, height: 32, minWidth: 32, borderRadius: 6, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#958ea0", background: "transparent", border: "none", textDecoration: "none",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#1c1b1b"; e.currentTarget.style.color = "#e5e2e1"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#958ea0"; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>notifications</span>
            </Link>

            {/* Tune / Settings */}
            <Link
              href="/ai-settings"
              title="AI Settings"
              style={{
                width: 32, height: 32, minWidth: 32, borderRadius: 6, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#958ea0", background: "transparent", border: "none", textDecoration: "none",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#1c1b1b"; e.currentTarget.style.color = "#e5e2e1"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#958ea0"; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>tune</span>
            </Link>

            {/* User Profile Initials Avatar */}
            <div style={{
              width: 28, height: 28, minWidth: 28, borderRadius: "50%", flexShrink: 0,
              background: "#513e7f", border: "1px solid rgba(160,120,255,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: "#e9ddff",
            }}>
              SA
            </div>
          </div>
        </header>

        {/* Page content canvas */}
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
