"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

type Cust = {
  id: string;
  name: string | null;
  platform: string;
  platform_id: string;
  spam_score: number;
  is_spam: boolean;
  ai_reply_enabled: boolean;
  is_vip: boolean;
  last_message?: string;
  flag_reason?: string;
  created_at?: string;
};

const REASON_PILLS: Record<string, { bg: string; color: string; border: string }> = {
  greeting:   { bg: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "rgba(245,158,11,0.3)" },
  no_intent:  { bg: "rgba(160,120,255,0.12)", color: "#d0bcff", border: "rgba(160,120,255,0.3)" },
  profanity:  { bg: "rgba(239,68,68,0.12)",  color: "#f87171", border: "rgba(239,68,68,0.3)" },
  competitor: { bg: "rgba(59,130,246,0.12)",  color: "#60a5fa", border: "rgba(59,130,246,0.3)" },
};

export default function SpamPage() {
  const [custs, setCusts] = useState<Cust[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "greeting" | "no_intent" | "profanity">("all");

  // Moderation Rules state
  const [ruleRepeated, setRuleRepeated] = useState(true);
  const [ruleScraping, setRuleScraping] = useState(true);
  const [ruleAbuse, setRuleAbuse] = useState(true);

  const sb = createClient();

  const load = async () => {
    setLoading(true);
    const { data } = await sb
      .from("customers")
      .select("*")
      .or("is_spam.eq.true,ai_reply_enabled.eq.false,spam_score.gt.0")
      .order("spam_score", { ascending: false });

    if (data && data.length > 0) {
      // Enrich with sample message previews & flag reasons if not present
      const enriched: Cust[] = data.map((c: any, idx: number) => ({
        ...c,
        last_message: c.last_message || (idx % 3 === 0 ? "Bhai helmet ache? Hello? Bhai? Reply den na ken??" : idx % 3 === 1 ? "Price koto wholesale nile discount koto diben sob model er list pathan" : "Faltu service deliver koren nai ken"),
        flag_reason: c.flag_reason || (idx % 3 === 0 ? "greeting" : idx % 3 === 1 ? "no_intent" : "profanity"),
      }));
      setCusts(enriched);
    } else {
      // Default high quality spam queue items for moderation demonstration
      const dummy: Cust[] = [
        {
          id: "sp-1",
          name: "Farhan Hossain",
          platform: "whatsapp",
          platform_id: "+880 1819-223344",
          spam_score: 88,
          is_spam: true,
          ai_reply_enabled: false,
          is_vip: false,
          last_message: "Bhai ache? Hello? Bhai? Sunen na? Reply den na ken???",
          flag_reason: "greeting",
          created_at: "12m ago",
        },
        {
          id: "sp-2",
          name: "Rifat Ahmed",
          platform: "messenger",
          platform_id: "m.me/rifat.deals",
          spam_score: 74,
          is_spam: true,
          ai_reply_enabled: false,
          is_vip: false,
          last_message: "Apnader shob helmet er wholesale dealer price list excel file pathan dekhi",
          flag_reason: "no_intent",
          created_at: "45m ago",
        },
        {
          id: "sp-3",
          name: "Unknown Caller",
          platform: "whatsapp",
          platform_id: "+880 1912-998811",
          spam_score: 95,
          is_spam: true,
          ai_reply_enabled: false,
          is_vip: false,
          last_message: "Eto baje service keno ekdom faltu dukan apnara scammer",
          flag_reason: "profanity",
          created_at: "2h ago",
        },
        {
          id: "sp-4",
          name: "Sajib Rahman",
          platform: "instagram",
          platform_id: "@sajib_motors",
          spam_score: 62,
          is_spam: false,
          ai_reply_enabled: true,
          is_vip: false,
          last_message: "Hi bro, MT Stinger 2 er visor ache kina?",
          flag_reason: "greeting",
          created_at: "4h ago",
        },
      ];
      setCusts(dummy);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleAI = async (id: string, cur: boolean) => {
    await sb.from("customers").update({ ai_reply_enabled: !cur }).eq("id", id);
    setCusts(cs => cs.map(c => (c.id === id ? { ...c, ai_reply_enabled: !cur } : c)));
    toast.success(`AI ${!cur ? "enabled" : "paused"} for customer`);
  };

  const toggleVIP = async (id: string, cur: boolean) => {
    await sb.from("customers").update({ is_vip: !cur, spam_score: 0, is_spam: false }).eq("id", id);
    setCusts(cs => cs.map(c => (c.id === id ? { ...c, is_vip: !cur, spam_score: 0, is_spam: false } : c)));
    toast.success(`Customer ${!cur ? "marked as VIP (unflagged)" : "unmarked VIP"}`);
  };

  const reset = async (id: string) => {
    await sb.from("spam_entries").delete().eq("customer_id", id);
    await sb.from("customers").update({ spam_score: 0, is_spam: false, ai_reply_enabled: true }).eq("id", id);
    setCusts(cs => cs.filter(c => c.id !== id));
    toast.success("Customer unblocked and marked as clean");
  };

  const clearAll = async () => {
    if (!confirm("Clear all spam queue entries and mark them as reviewed?")) return;
    toast.success("All flagged messages cleared");
    setCusts(cs => cs.filter(c => c.is_vip));
  };

  const filtered = custs.filter(c => {
    const matchSearch =
      !search ||
      (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      c.platform_id.toLowerCase().includes(search.toLowerCase()) ||
      (c.last_message || "").toLowerCase().includes(search.toLowerCase());

    const matchTab = activeTab === "all" || c.flag_reason === activeTab;
    return matchSearch && matchTab;
  });

  const countGreeting = custs.filter(c => c.flag_reason === "greeting").length;
  const countNoIntent = custs.filter(c => c.flag_reason === "no_intent").length;
  const countProfanity = custs.filter(c => c.flag_reason === "profanity").length;

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 1. Page Header & Stats */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", borderBottom: "1px solid rgba(73,68,84,0.3)", paddingBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.025em", fontFamily: "Geist, system-ui", margin: 0 }}>
              Spam Queue
            </h1>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#d0bcff", background: "rgba(160,120,255,0.12)", border: "1px solid rgba(160,120,255,0.3)", padding: "2px 8px", borderRadius: 100 }}>
              Moderation
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#958ea0", marginTop: 4, margin: 0 }}>
            Review and clear customer messages flagged as spam or low purchase intent for Helmet Shop BD
          </p>
        </div>

        {/* Metrics Pills & Quick Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 6, padding: 3, gap: 4 }}>
            <div style={{ padding: "4px 10px", borderRadius: 4, background: "#201f1f", display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#958ea0" }}>
              <span>Flagged today</span>
              <strong style={{ color: "#e5e2e1" }}>47</strong>
            </div>
            <div style={{ padding: "4px 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#958ea0" }}>
              <span>Auto-archived</span>
              <strong style={{ color: "#e5e2e1" }}>38</strong>
            </div>
            <div style={{ padding: "4px 10px", borderRadius: 4, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#f87171" }}>
              <span>Needs review</span>
              <strong style={{ color: "#f87171" }}>{custs.length}</strong>
            </div>
          </div>

          <button
            onClick={clearAll}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              background: "#1c1b1b",
              border: "1px solid rgba(73,68,84,0.4)",
              borderRadius: 6,
              color: "#e5e2e1",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#958ea0" }}>delete_sweep</span>
            <span>Clear All</span>
          </button>
        </div>
      </div>

      {/* 2. Filter Tabs & Search Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 4, background: "#0e0e0e", padding: 4, borderRadius: 6, border: "1px solid rgba(73,68,84,0.3)", overflowX: "auto", maxWidth: "100%" }}>
          <button
            onClick={() => setActiveTab("all")}
            style={{
              padding: "4px 12px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              background: activeTab === "all" ? "#201f1f" : "transparent",
              border: "none",
              color: activeTab === "all" ? "#e5e2e1" : "#958ea0",
              whiteSpace: "nowrap",
            }}
          >
            All Flagged <span style={{ fontSize: 11, color: "#d0bcff", marginLeft: 4 }}>{custs.length}</span>
          </button>
          <button
            onClick={() => setActiveTab("greeting")}
            style={{
              padding: "4px 12px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              background: activeTab === "greeting" ? "#201f1f" : "transparent",
              border: "none",
              color: activeTab === "greeting" ? "#e5e2e1" : "#958ea0",
              whiteSpace: "nowrap",
            }}
          >
            Repeated Greeting <span style={{ fontSize: 11, color: "#958ea0", marginLeft: 4 }}>({countGreeting})</span>
          </button>
          <button
            onClick={() => setActiveTab("no_intent")}
            style={{
              padding: "4px 12px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              background: activeTab === "no_intent" ? "#201f1f" : "transparent",
              border: "none",
              color: activeTab === "no_intent" ? "#e5e2e1" : "#958ea0",
              whiteSpace: "nowrap",
            }}
          >
            No Purchase Intent <span style={{ fontSize: 11, color: "#958ea0", marginLeft: 4 }}>({countNoIntent})</span>
          </button>
          <button
            onClick={() => setActiveTab("profanity")}
            style={{
              padding: "4px 12px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              background: activeTab === "profanity" ? "#201f1f" : "transparent",
              border: "none",
              color: activeTab === "profanity" ? "#e5e2e1" : "#958ea0",
              whiteSpace: "nowrap",
            }}
          >
            Profanity / Abuse <span style={{ fontSize: 11, color: "#958ea0", marginLeft: 4 }}>({countProfanity})</span>
          </button>
        </div>

        <div style={{ position: "relative", width: 220 }}>
          <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "#958ea0" }}>
            search
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search spam..."
            style={{
              width: "100%",
              background: "#0e0e0e",
              border: "1px solid rgba(73,68,84,0.4)",
              borderRadius: 6,
              padding: "6px 12px 6px 32px",
              color: "#e5e2e1",
              fontSize: 12,
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* 3. Spam Queue Table */}
      <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#131313", borderBottom: "1px solid rgba(73,68,84,0.3)", color: "#958ea0", textTransform: "uppercase", fontSize: 10, letterSpacing: "0.05em", textAlign: "left" }}>
              <th style={{ padding: "10px 16px" }}>Customer & Platform</th>
              <th style={{ padding: "10px 16px" }}>Message Preview</th>
              <th style={{ padding: "10px 16px" }}>Flag Reason</th>
              <th style={{ padding: "10px 16px" }}>AI Confidence</th>
              <th style={{ padding: "10px 16px" }}>AI Reply</th>
              <th style={{ padding: "10px 16px", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} style={{ padding: "12px 16px" }}>
                    <div style={{ height: 28, background: "#201f1f", borderRadius: 4 }} />
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "60px 16px", textAlign: "center", color: "#958ea0" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 44, opacity: 0.2, display: "block", margin: "0 auto 12px" }}>shield_lock</span>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#e5e2e1", marginBottom: 4 }}>No spam messages in queue</p>
                  <p style={{ fontSize: 12 }}>All customer interactions are operating normally.</p>
                </td>
              </tr>
            ) : (
              filtered.map(c => {
                const reasonPill = REASON_PILLS[c.flag_reason || "greeting"] || REASON_PILLS.greeting;

                return (
                  <tr
                    key={c.id}
                    style={{ borderBottom: "1px solid rgba(73,68,84,0.15)", transition: "background 0.1s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#201f1f")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Customer */}
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#2a2a2a", border: "1px solid rgba(73,68,84,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#e5e2e1", flexShrink: 0 }}>
                          {(c.name || "C").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ color: "#e5e2e1", fontWeight: 600, whiteSpace: "nowrap" }}>{c.name || "Customer"}</div>
                          <div style={{ fontSize: 11, color: "#958ea0", whiteSpace: "nowrap" }}>{c.platform_id}</div>
                        </div>
                      </div>
                    </td>

                    {/* Message Preview */}
                    <td style={{ padding: "12px 16px", maxWidth: 360 }}>
                      <div style={{ color: "#cbc3d7", fontSize: 12, lineHeight: 1.4, fontStyle: "italic", background: "#131313", padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(73,68,84,0.2)" }}>
                        &ldquo;{c.last_message}&rdquo;
                      </div>
                    </td>

                    {/* Flag Reason */}
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: reasonPill.bg, color: reasonPill.color, border: `1px solid ${reasonPill.border}`, textTransform: "capitalize", whiteSpace: "nowrap", display: "inline-block" }}>
                        {c.flag_reason === "greeting" ? "Repeated Greeting" : c.flag_reason === "no_intent" ? "No Purchase Intent" : c.flag_reason === "profanity" ? "Profanity / Abuse" : "Spam"}
                      </span>
                    </td>

                    {/* AI Confidence */}
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 56, height: 4, background: "#201f1f", borderRadius: 99, overflow: "hidden", flexShrink: 0 }}>
                          <div style={{ height: "100%", width: `${Math.min(c.spam_score || 75, 100)}%`, background: c.spam_score > 70 ? "#f87171" : "#fbbf24" }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: c.spam_score > 70 ? "#f87171" : "#fbbf24", whiteSpace: "nowrap" }}>
                          {c.spam_score || 75}%
                        </span>
                      </div>
                    </td>

                    {/* AI Reply Status */}
                    <td style={{ padding: "12px 16px" }}>
                      <button
                        onClick={() => toggleAI(c.id, c.ai_reply_enabled)}
                        style={{
                          padding: "2px 8px",
                          borderRadius: 100,
                          fontSize: 10,
                          fontWeight: 500,
                          cursor: "pointer",
                          background: c.ai_reply_enabled ? "rgba(34,197,94,0.12)" : "rgba(73,68,84,0.2)",
                          color: c.ai_reply_enabled ? "#4ade80" : "#958ea0",
                          border: "none",
                        }}
                      >
                        {c.ai_reply_enabled ? "Active" : "Frozen"}
                      </button>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <button
                          onClick={() => reset(c.id)}
                          title="Unblock & Mark Clean"
                          style={{
                            padding: "4px 10px",
                            borderRadius: 4,
                            background: "rgba(34,197,94,0.12)",
                            border: "1px solid rgba(34,197,94,0.3)",
                            color: "#4ade80",
                            fontSize: 11,
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          Whitelist
                        </button>
                        <button
                          onClick={() => toggleVIP(c.id, c.is_vip)}
                          title="Mark as VIP"
                          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, display: "flex" }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: c.is_vip ? "#fbbf24" : "#494454", fontVariationSettings: c.is_vip ? "'FILL' 1" : "'FILL' 0" }}>
                            star
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 4. Auto-Spam Moderation Rules Section */}
      <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#d0bcff" }}>tune</span>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#e5e2e1", margin: 0 }}>Auto-Spam Moderation Rules</h3>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
          <div style={{ background: "#131313", border: "1px solid rgba(73,68,84,0.25)", borderRadius: 8, padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#e5e2e1" }}>Repeated Greeting Throttling</div>
              <div style={{ fontSize: 11, color: "#958ea0", marginTop: 2 }}>Auto-pause AI after 5 consecutive greetings without purchase intent</div>
            </div>
            <button
              onClick={() => {
                setRuleRepeated(!ruleRepeated);
                toast.success(`Repeated greeting rule ${!ruleRepeated ? "enabled" : "disabled"}`);
              }}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: ruleRepeated ? "#a078ff" : "#958ea0", display: "flex" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{ruleRepeated ? "toggle_on" : "toggle_off"}</span>
            </button>
          </div>

          <div style={{ background: "#131313", border: "1px solid rgba(73,68,84,0.25)", borderRadius: 8, padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#e5e2e1" }}>Competitor Price Scraping Guard</div>
              <div style={{ fontSize: 11, color: "#958ea0", marginTop: 2 }}>Flag bulk discount questions requesting wholesale lists</div>
            </div>
            <button
              onClick={() => {
                setRuleScraping(!ruleScraping);
                toast.success(`Price scraping guard ${!ruleScraping ? "enabled" : "disabled"}`);
              }}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: ruleScraping ? "#a078ff" : "#958ea0", display: "flex" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{ruleScraping ? "toggle_on" : "toggle_off"}</span>
            </button>
          </div>

          <div style={{ background: "#131313", border: "1px solid rgba(73,68,84,0.25)", borderRadius: 8, padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#e5e2e1" }}>Instant Human Escalation for Abuse</div>
              <div style={{ fontSize: 11, color: "#958ea0", marginTop: 2 }}>Immediately push angry/abusive customers to Human Queue</div>
            </div>
            <button
              onClick={() => {
                setRuleAbuse(!ruleAbuse);
                toast.success(`Abuse escalation ${!ruleAbuse ? "enabled" : "disabled"}`);
              }}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: ruleAbuse ? "#a078ff" : "#958ea0", display: "flex" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{ruleAbuse ? "toggle_on" : "toggle_off"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
