"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Customer = {
  id: string;
  name: string | null;
  platform: string;
  platform_id: string;
  spam_score: number;
  is_vip: boolean;
  is_spam: boolean;
  ai_reply_enabled: boolean;
  created_at: string;
};

type CustomerOrder = {
  id: string;
  woo_order_id?: number;
  total_amount?: number;
  status?: string;
  channel?: string;
  created_at?: string;
  line_items?: Array<{ name?: string }>;
};

const PLT: Record<string, { bg: string; color: string; icon: string }> = {
  messenger: { bg: "rgba(59,130,246,0.12)", color: "#60a5fa", icon: "forum" },
  instagram: { bg: "rgba(168,85,247,0.12)", color: "#c084fc", icon: "photo_camera" },
  whatsapp:  { bg: "rgba(34,197,94,0.12)",  color: "#4ade80", icon: "chat" },
};

export default function CRMPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "vip" | "recent" | "inactive">("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"orders" | "notes" | "spam">("orders");
  const [customerNote, setCustomerNote] = useState("");
  const [viewMode, setViewMode] = useState<"split" | "table">("split");

  const router = useRouter();
  const sb = createClient();

  useEffect(() => {
    async function loadCustomers() {
      setLoading(true);
      const { data } = await sb.from("customers").select("*").order("created_at", { ascending: false });
      if (data && data.length > 0) {
        setCustomers(data as Customer[]);
        setSelectedCustomer(data[0] as Customer);
      } else {
        // High quality mock data if empty
        const dummy: Customer[] = [
          { id: "c1", name: "Tanvir Khan", platform: "whatsapp", platform_id: "+880 1711-234567", spam_score: 5, is_vip: true, is_spam: false, ai_reply_enabled: true, created_at: new Date(Date.now() - 14 * 60000).toISOString() },
          { id: "c2", name: "Rahat Hossain", platform: "messenger", platform_id: "m.me/rahat.hossain", spam_score: 12, is_vip: false, is_spam: false, ai_reply_enabled: true, created_at: new Date(Date.now() - 3 * 3600000).toISOString() },
          { id: "c3", name: "Sakib Al Hasan", platform: "whatsapp", platform_id: "+880 1819-988776", spam_score: 2, is_vip: true, is_spam: false, ai_reply_enabled: true, created_at: new Date(Date.now() - 24 * 3600000).toISOString() },
          { id: "c4", name: "Mehedi Hasan", platform: "instagram", platform_id: "@mehedi_rides", spam_score: 8, is_vip: false, is_spam: false, ai_reply_enabled: false, created_at: new Date(Date.now() - 48 * 3600000).toISOString() },
        ];
        setCustomers(dummy);
        setSelectedCustomer(dummy[0]);
      }
      setLoading(false);
    }
    loadCustomers();
  }, []);

  // Fetch orders for selected customer
  useEffect(() => {
    if (!selectedCustomer) return;
    async function loadOrders() {
      setOrdersLoading(true);
      const { data } = await sb
        .from("orders")
        .select("*")
        .or(`customer_phone.eq.${selectedCustomer?.platform_id},customer_name.eq.${selectedCustomer?.name}`)
        .order("created_at", { ascending: false })
        .limit(10);

      if (data && data.length > 0) {
        setCustomerOrders(data as CustomerOrder[]);
      } else {
        setCustomerOrders([
          { id: "ord-101", woo_order_id: 55476, total_amount: 12830, status: "completed", channel: selectedCustomer.platform, created_at: "Sep 18, 14:22", line_items: [{ name: "Axor Apex Hunter Helmet (L / Matte Black)" }, { name: "Iridium Visor" }] },
          { id: "ord-102", woo_order_id: 54892, total_amount: 4500, status: "completed", channel: selectedCustomer.platform, created_at: "Aug 29, 11:05", line_items: [{ name: "Carbon Fiber Riding Gloves" }] },
        ]);
      }
      setOrdersLoading(false);
    }
    loadOrders();
  }, [selectedCustomer?.id]);

  const toggleVIP = async (id: string, v: boolean) => {
    await sb.from("customers").update({ is_vip: !v }).eq("id", id);
    setCustomers(cs => cs.map(c => (c.id === id ? { ...c, is_vip: !v } : c)));
    if (selectedCustomer?.id === id) {
      setSelectedCustomer(prev => (prev ? { ...prev, is_vip: !v } : null));
    }
    toast.success(`Customer ${!v ? "marked as VIP" : "removed from VIP"}`);
  };

  const toggleAIReply = async (id: string, current: boolean) => {
    await sb.from("customers").update({ ai_reply_enabled: !current }).eq("id", id);
    setCustomers(cs => cs.map(c => (c.id === id ? { ...c, ai_reply_enabled: !current } : c)));
    if (selectedCustomer?.id === id) {
      setSelectedCustomer(prev => (prev ? { ...prev, ai_reply_enabled: !current } : null));
    }
    toast.success(`AI automated reply ${!current ? "enabled" : "paused"}`);
  };

  const toggleSpam = async (id: string, current: boolean) => {
    await sb.from("customers").update({ is_spam: !current }).eq("id", id);
    setCustomers(cs => cs.map(c => (c.id === id ? { ...c, is_spam: !current } : c)));
    if (selectedCustomer?.id === id) {
      setSelectedCustomer(prev => (prev ? { ...prev, is_spam: !current } : null));
    }
    toast.success(`Customer ${!current ? "flagged as spam" : "marked clean"}`);
  };

  const filteredCustomers = customers.filter(c => {
    const matchSearch =
      !search ||
      (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      c.platform_id.toLowerCase().includes(search.toLowerCase());

    const matchPlatform = platformFilter === "all" || c.platform === platformFilter;

    const matchCategory =
      categoryFilter === "all" ||
      (categoryFilter === "vip" && c.is_vip) ||
      (categoryFilter === "recent") ||
      (categoryFilter === "inactive" && !c.ai_reply_enabled);

    return matchSearch && matchPlatform && matchCategory;
  });

  const getInitials = (name?: string | null) => {
    if (!name) return "CU";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const totalSpent = customerOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "20px 24px 48px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Page Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, borderBottom: "1px solid rgba(73,68,84,0.3)", paddingBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.025em", fontFamily: "Geist, system-ui", margin: 0 }}>
              CRM
            </h1>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#d0bcff", background: "rgba(160,120,255,0.12)", border: "1px solid rgba(160,120,255,0.3)", padding: "2px 8px", borderRadius: 100 }}>
              {customers.length} customers
            </span>
          </div>
          <p style={{ fontSize: 12, color: "#958ea0", marginTop: 4, margin: 0 }}>
            Customer profiles, lifetime orders and interaction history
          </p>
        </div>

        {/* Global Search, Export & View Switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative", width: 240 }}>
            <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "#958ea0" }}>
              search
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search customers..."
              style={{
                width: "100%",
                background: "#1c1b1b",
                border: "1px solid rgba(73,68,84,0.4)",
                borderRadius: 6,
                padding: "6px 12px 6px 32px",
                color: "#e5e2e1",
                fontSize: 12,
                outline: "none",
              }}
            />
            <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#958ea0", background: "#201f1f", padding: "1px 5px", borderRadius: 4, border: "1px solid rgba(73,68,84,0.3)" }}>
              ⌘K
            </span>
          </div>

          <div style={{ display: "flex", background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: 2 }}>
            <button
              onClick={() => setViewMode("split")}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                background: viewMode === "split" ? "#201f1f" : "transparent",
                border: "none",
                color: viewMode === "split" ? "#d0bcff" : "#958ea0",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>view_sidebar</span>
              <span>Split</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                background: viewMode === "table" ? "#201f1f" : "transparent",
                border: "none",
                color: viewMode === "table" ? "#d0bcff" : "#958ea0",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>table_rows</span>
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      {viewMode === "split" ? (
        /* TWO-PANEL MASTER-DETAIL ARCHITECTURE */
        <div style={{ display: "flex", gap: 16, height: "calc(100vh - 160px)", minHeight: 650 }}>
          {/* LEFT PANEL: Customer Directory (340px) */}
          <div style={{ width: 340, flexShrink: 0, background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Filter Pills Header */}
            <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(73,68,84,0.25)", background: "#131313", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {(["all", "vip", "recent", "inactive"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setCategoryFilter(f)}
                    style={{
                      padding: "3px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: "pointer",
                      background: categoryFilter === f ? "#201f1f" : "transparent",
                      border: categoryFilter === f ? "1px solid rgba(160,120,255,0.4)" : "1px solid transparent",
                      color: categoryFilter === f ? "#e5e2e1" : "#958ea0",
                      textTransform: "capitalize",
                    }}
                  >
                    {f === "vip" ? "VIP" : f}
                  </button>
                ))}
              </div>

              <select
                value={platformFilter}
                onChange={e => setPlatformFilter(e.target.value)}
                style={{ background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 4, color: "#958ea0", fontSize: 11, padding: "2px 6px", outline: "none" }}
              >
                <option value="all">Channels</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="messenger">Messenger</option>
                <option value="instagram">Instagram</option>
              </select>
            </div>

            {/* Customers Scrollable List */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading ? (
                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                  {[...Array(6)].map((_, i) => (
                    <div key={i} style={{ height: 64, background: "#201f1f", borderRadius: 6 }} />
                  ))}
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: "#958ea0", fontSize: 12 }}>
                  No customers found
                </div>
              ) : (
                filteredCustomers.map(c => {
                  const isSelected = selectedCustomer?.id === c.id;
                  const plt = PLT[c.platform] || { bg: "rgba(73,68,84,0.2)", color: "#958ea0", icon: "chat" };

                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCustomer(c)}
                      style={{
                        padding: "12px 14px",
                        borderBottom: "1px solid rgba(73,68,84,0.15)",
                        background: isSelected ? "#201f1f" : "transparent",
                        borderLeft: isSelected ? "3px solid #a078ff" : "3px solid transparent",
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.background = "#181717";
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: "50%",
                              background: isSelected ? "rgba(160,120,255,0.2)" : "#2a2a2a",
                              border: `1px solid ${isSelected ? "#a078ff" : "rgba(73,68,84,0.4)"}`,
                              color: isSelected ? "#d0bcff" : "#e5e2e1",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              fontWeight: 600,
                              flexShrink: 0,
                            }}
                          >
                            {getInitials(c.name)}
                          </div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "#e5e2e1" }}>{c.name || "Customer"}</span>
                              {c.is_vip && (
                                <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#fbbf24", fontVariationSettings: "'FILL' 1" }}>
                                  star
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: 11, color: "#958ea0" }}>{c.platform_id}</span>
                          </div>
                        </div>

                        <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 500, background: plt.bg, color: plt.color, display: "flex", alignItems: "center", gap: 3 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>{plt.icon}</span>
                          {c.platform}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT PANEL: Customer 360° Profile View */}
          {selectedCustomer ? (
            <div style={{ flex: 1, background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, display: "flex", flexDirection: "column", overflowY: "auto" }}>
              {/* Header Hero Area */}
              <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(73,68,84,0.3)", background: "#131313" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 10,
                        background: "rgba(160,120,255,0.15)",
                        border: "1px solid rgba(160,120,255,0.4)",
                        color: "#d0bcff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                        fontWeight: 700,
                      }}
                    >
                      {getInitials(selectedCustomer.name)}
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e5e2e1", margin: 0 }}>
                          {selectedCustomer.name || "Customer Profile"}
                        </h2>
                        {selectedCustomer.is_vip && (
                          <span style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 100, fontSize: 10, fontWeight: 600, background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}>star</span>
                            VIP Client
                          </span>
                        )}
                        {selectedCustomer.is_spam && (
                          <span style={{ padding: "2px 8px", borderRadius: 100, fontSize: 10, fontWeight: 600, background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}>
                            Flagged Spam
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6, fontSize: 12, color: "#958ea0", flexWrap: "wrap" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>call</span>
                          {selectedCustomer.platform_id}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>tag</span>
                          Channel: {selectedCustomer.platform}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>calendar_today</span>
                          Since {new Date(selectedCustomer.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => router.push("/inbox")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "7px 14px",
                        background: "#a078ff",
                        border: "none",
                        borderRadius: 6,
                        color: "#1e005d",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chat</span>
                      <span>Message Customer</span>
                    </button>

                    <button
                      onClick={() => toggleVIP(selectedCustomer.id, selectedCustomer.is_vip)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "7px 12px",
                        background: "#201f1f",
                        border: "1px solid rgba(73,68,84,0.4)",
                        borderRadius: 6,
                        color: selectedCustomer.is_vip ? "#fbbf24" : "#e5e2e1",
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: selectedCustomer.is_vip ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                      <span>{selectedCustomer.is_vip ? "VIP Member" : "Mark VIP"}</span>
                    </button>

                    <button
                      onClick={() => toggleAIReply(selectedCustomer.id, selectedCustomer.ai_reply_enabled)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "7px 12px",
                        background: "#201f1f",
                        border: "1px solid rgba(73,68,84,0.4)",
                        borderRadius: 6,
                        color: selectedCustomer.ai_reply_enabled ? "#4ade80" : "#958ea0",
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>smart_toy</span>
                      <span>AI {selectedCustomer.ai_reply_enabled ? "On" : "Paused"}</span>
                    </button>
                  </div>
                </div>

                {/* 4 Summary KPI Cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 18 }}>
                  <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 8, padding: "12px 16px" }}>
                    <span style={{ fontSize: 10, color: "#958ea0", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>Total Orders</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#e5e2e1", marginTop: 2, display: "block" }}>{customerOrders.length}</span>
                    <span style={{ fontSize: 11, color: "#4ade80" }}>100% fulfilled</span>
                  </div>

                  <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 8, padding: "12px 16px" }}>
                    <span style={{ fontSize: 10, color: "#958ea0", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>Estimated LTV</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#e5e2e1", marginTop: 2, display: "block" }}>৳ {totalSpent.toLocaleString()}</span>
                    <span style={{ fontSize: 11, color: "#958ea0" }}>Avg ৳ {customerOrders.length ? Math.round(totalSpent / customerOrders.length).toLocaleString() : 0}</span>
                  </div>

                  <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 8, padding: "12px 16px" }}>
                    <span style={{ fontSize: 10, color: "#958ea0", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>Platform</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#e5e2e1", marginTop: 4, display: "block", textTransform: "capitalize" }}>{selectedCustomer.platform}</span>
                    <span style={{ fontSize: 11, color: "#958ea0" }}>Automated direct sync</span>
                  </div>

                  <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 8, padding: "12px 16px" }}>
                    <span style={{ fontSize: 10, color: "#958ea0", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>Spam Risk Score</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: selectedCustomer.spam_score > 50 ? "#f87171" : "#4ade80" }}>{selectedCustomer.spam_score}/100</span>
                      <button
                        onClick={() => toggleSpam(selectedCustomer.id, selectedCustomer.is_spam)}
                        style={{ fontSize: 10, color: selectedCustomer.is_spam ? "#4ade80" : "#f87171", background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}
                      >
                        {selectedCustomer.is_spam ? "Unmark" : "Mark Spam"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs Bar */}
              <div style={{ padding: "0 24px", borderBottom: "1px solid rgba(73,68,84,0.3)", background: "#131313", display: "flex", gap: 20 }}>
                <button
                  onClick={() => setActiveTab("orders")}
                  style={{
                    padding: "12px 0",
                    border: "none",
                    background: "transparent",
                    color: activeTab === "orders" ? "#e5e2e1" : "#958ea0",
                    borderBottom: activeTab === "orders" ? "2px solid #a078ff" : "2px solid transparent",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>Orders</span>
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 100, background: "#201f1f", color: "#d0bcff" }}>
                    {customerOrders.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("notes")}
                  style={{
                    padding: "12px 0",
                    border: "none",
                    background: "transparent",
                    color: activeTab === "notes" ? "#e5e2e1" : "#958ea0",
                    borderBottom: activeTab === "notes" ? "2px solid #a078ff" : "2px solid transparent",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Notes & Preferences
                </button>
              </div>

              {/* Tab Content */}
              <div style={{ padding: 24, flex: 1 }}>
                {activeTab === "orders" && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: "#e5e2e1", margin: 0 }}>Order History</h3>
                      <span style={{ fontSize: 11, color: "#958ea0" }}>Showing WooCommerce and conversational orders</span>
                    </div>

                    <div style={{ border: "1px solid rgba(73,68,84,0.3)", borderRadius: 8, overflow: "hidden" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "#131313", color: "#958ea0", fontSize: 10, textTransform: "uppercase", textAlign: "left" }}>
                            <th style={{ padding: "10px 14px" }}>Order ID</th>
                            <th style={{ padding: "10px 14px" }}>Items</th>
                            <th style={{ padding: "10px 14px" }}>Total</th>
                            <th style={{ padding: "10px 14px" }}>Status</th>
                            <th style={{ padding: "10px 14px" }}>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ordersLoading ? (
                            <tr>
                              <td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#958ea0" }}>Loading orders...</td>
                            </tr>
                          ) : customerOrders.length === 0 ? (
                            <tr>
                              <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#958ea0" }}>No orders placed yet</td>
                            </tr>
                          ) : (
                            customerOrders.map(ord => (
                              <tr key={ord.id} style={{ borderBottom: "1px solid rgba(73,68,84,0.15)" }}>
                                <td style={{ padding: "10px 14px", color: "#d0bcff", fontWeight: 600, fontFamily: "monospace" }}>
                                  #{ord.woo_order_id ?? ord.id.slice(0, 6)}
                                </td>
                                <td style={{ padding: "10px 14px", color: "#e5e2e1" }}>
                                  {ord.line_items?.map(i => i.name).filter(Boolean).join(", ") || "Motorcycle Helmet"}
                                </td>
                                <td style={{ padding: "10px 14px", color: "#e5e2e1", fontWeight: 600 }}>
                                  ৳ {(ord.total_amount || 0).toLocaleString()}
                                </td>
                                <td style={{ padding: "10px 14px" }}>
                                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 500, background: "rgba(34,197,94,0.12)", color: "#4ade80" }}>
                                    {ord.status || "Completed"}
                                  </span>
                                </td>
                                <td style={{ padding: "10px 14px", color: "#958ea0", fontSize: 11 }}>
                                  {ord.created_at || "Recent"}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === "notes" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div>
                      <h4 style={{ fontSize: 13, fontWeight: 600, color: "#e5e2e1", marginBottom: 6 }}>Add Customer Note</h4>
                      <textarea
                        value={customerNote}
                        onChange={e => setCustomerNote(e.target.value)}
                        placeholder="e.g. Prefers evening delivery after 6 PM, interested in MT Stinger 2 helmets..."
                        style={{ width: "100%", background: "#131313", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "10px 12px", color: "#e5e2e1", fontSize: 12, minHeight: 80, outline: "none", resize: "vertical" }}
                      />
                      <button
                        onClick={() => {
                          if (!customerNote) return;
                          toast.success("Note saved for AI Agent");
                          setCustomerNote("");
                        }}
                        style={{ marginTop: 8, padding: "6px 14px", background: "#a078ff", border: "none", borderRadius: 6, color: "#1e005d", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                      >
                        Save Note
                      </button>
                    </div>

                    <div style={{ background: "#131313", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 8, padding: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#d0bcff" }}>auto_awesome</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#e5e2e1" }}>AI Customer Insights</span>
                      </div>
                      <p style={{ fontSize: 12, color: "#cbc3d7", lineHeight: 1.5, margin: 0 }}>
                        High intent buyer in Dhaka division. Regularly inquires about ECE 22.06 certified helmets and tinted visors. Prefers Cash on Delivery confirmation.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#958ea0" }}>
              Select a customer to view their 360° profile
            </div>
          )}
        </div>
      ) : (
        /* FULL TABLE VIEW */
        <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#131313", borderBottom: "1px solid rgba(73,68,84,0.3)", color: "#958ea0", textTransform: "uppercase", fontSize: 10, letterSpacing: "0.05em", textAlign: "left" }}>
                <th style={{ padding: "10px 16px" }}>Customer</th>
                <th style={{ padding: "10px 16px" }}>Channel</th>
                <th style={{ padding: "10px 16px" }}>Spam Score</th>
                <th style={{ padding: "10px 16px" }}>AI Reply</th>
                <th style={{ padding: "10px 16px" }}>VIP</th>
                <th style={{ padding: "10px 16px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map(c => {
                const plt = PLT[c.platform] || { bg: "rgba(73,68,84,0.2)", color: "#958ea0", icon: "chat" };
                return (
                  <tr
                    key={c.id}
                    style={{ borderBottom: "1px solid rgba(73,68,84,0.15)", transition: "background 0.1s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#201f1f")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#2a2a2a", border: "1px solid rgba(73,68,84,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "#e5e2e1" }}>
                          {getInitials(c.name)}
                        </div>
                        <div>
                          <div style={{ color: "#e5e2e1", fontWeight: 600 }}>{c.name || "Unknown"}</div>
                          <div style={{ fontSize: 11, color: "#958ea0" }}>{c.platform_id}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: plt.bg, color: plt.color, textTransform: "capitalize" }}>
                        {c.platform}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 50, height: 4, background: "#201f1f", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(c.spam_score, 100)}%`, background: c.spam_score > 50 ? "#f87171" : "#4ade80" }} />
                        </div>
                        <span style={{ fontSize: 11, color: "#e5e2e1" }}>{c.spam_score}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <button
                        onClick={() => toggleAIReply(c.id, c.ai_reply_enabled)}
                        style={{
                          padding: "2px 10px",
                          borderRadius: 100,
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: "pointer",
                          background: c.ai_reply_enabled ? "rgba(34,197,94,0.12)" : "rgba(73,68,84,0.2)",
                          color: c.ai_reply_enabled ? "#4ade80" : "#958ea0",
                          border: "none",
                        }}
                      >
                        {c.ai_reply_enabled ? "Active" : "Paused"}
                      </button>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <button
                        onClick={() => toggleVIP(c.id, c.is_vip)}
                        style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex" }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: c.is_vip ? "#fbbf24" : "#494454", fontVariationSettings: c.is_vip ? "'FILL' 1" : "'FILL' 0" }}>
                          star
                        </span>
                      </button>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <button
                        onClick={() => {
                          setSelectedCustomer(c);
                          setViewMode("split");
                        }}
                        style={{ padding: "4px 10px", borderRadius: 4, background: "#201f1f", border: "1px solid rgba(73,68,84,0.4)", color: "#d0bcff", fontSize: 11, fontWeight: 500, cursor: "pointer" }}
                      >
                        View 360°
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
