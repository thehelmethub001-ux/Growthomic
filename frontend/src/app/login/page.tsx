"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Mail, Lock, ArrowRight, Sparkles, Zap, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  { icon: Zap,         label: "AI replies in seconds, 24/7 — no agents needed" },
  { icon: ShieldCheck, label: "SpamGuard auto-blocks abusive customers" },
  { icon: Sparkles,    label: "Understands Banglish natively" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const sb = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }
    router.replace("/overview");
  };

  return (
    <div style={{
      minHeight: "100vh", width: "100%",
      background: "var(--bg-base)",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", position: "relative", fontFamily: "inherit",
    }}>
      {/* Ambient blobs */}
      <div style={{ position:"absolute", top:"-10%", left:"-10%", width:500, height:500, background:"hsla(262,83%,58%,0.18)", borderRadius:"50%", filter:"blur(120px)", pointerEvents:"none", animation:"float1 8s ease-in-out infinite" }}/>
      <div style={{ position:"absolute", bottom:"-10%", right:"-10%", width:400, height:400, background:"hsla(271,91%,65%,0.13)", borderRadius:"50%", filter:"blur(100px)", pointerEvents:"none", animation:"float2 10s ease-in-out infinite" }}/>

      {/* ── LEFT PANEL ── */}
      <div style={{
        flex:1, display:"flex", flexDirection:"column", justifyContent:"center",
        padding:"60px 64px", height:"100vh", position:"relative", zIndex:1,
        borderRight:"1px solid rgba(255,255,255,0.05)",
      }} className="left-panel-hide">
        {/* Badge */}
        <motion.div
          initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.4 }}
          style={{ marginBottom:24 }}
        >
          <span style={{
            display:"inline-flex", alignItems:"center", gap:8,
            padding:"6px 14px", borderRadius:999,
            background:"hsla(262,83%,58%,0.1)", border:"1px solid hsla(262,83%,58%,0.25)",
            color:"var(--primary)", fontSize:12, fontWeight:700, letterSpacing:"0.02em",
          }}>
            <Sparkles size={12}/> Bangladesh&apos;s #1 AI Sales Platform
          </span>
        </motion.div>

        {/* Big heading */}
        <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.45, delay:0.06 }}>
          <h1 style={{ fontSize:64, fontWeight:900, letterSpacing:"-0.04em", lineHeight:1, marginBottom:20 }}
              className="gradient-text">
            Growthomic
          </h1>
          <p style={{ fontSize:18, color:"var(--text-muted)", lineHeight:1.7, maxWidth:420, fontWeight:400, marginBottom:40 }}>
            Automate your Facebook, Instagram &amp; WhatsApp customer support with AI — in Bangla &amp; Banglish.
          </p>
        </motion.div>

        {/* Feature list */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {features.map(({ icon: Icon, label }, i) => (
            <motion.div
              key={label}
              initial={{ opacity:0, x:-14 }} animate={{ opacity:1, x:0 }} transition={{ duration:0.35, delay:0.15 + i*0.08 }}
              style={{ display:"flex", alignItems:"center", gap:14 }}
            >
              <div style={{
                width:34, height:34, borderRadius:"50%", flexShrink:0,
                background:"hsla(262,83%,58%,0.1)", border:"1px solid hsla(262,83%,58%,0.22)",
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>
                <Icon size={16} color="var(--primary)"/>
              </div>
              <span style={{ fontSize:14, color:"var(--text-muted)" }}>{label}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL (Form) ── */}
      <div style={{
        width:480, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
        padding:"40px 44px", position:"relative", zIndex:1,
      }}>
        <motion.div
          initial={{ opacity:0, y:20, scale:0.97 }} animate={{ opacity:1, y:0, scale:1 }} transition={{ duration:0.4, ease:"easeOut" }}
          style={{
            width:"100%", maxWidth:400,
            background:"hsla(248,12%,9%,0.85)",
            backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)",
            border:"1px solid var(--border)", borderRadius:20, padding:"40px 36px",
            boxShadow:"0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px var(--border)", position:"relative",
          }}
        >
          {/* Top glow */}
          <div style={{ position:"absolute", top:0, left:"10%", right:"10%", height:1, background:"linear-gradient(90deg,transparent,var(--primary),var(--accent),transparent)", opacity:0.6, borderRadius:"0 0 999px 999px" }}/>

          {/* Mobile logo */}
          <div style={{ display:"none" }} className="mobile-logo">
            <h2 style={{ fontSize:24, fontWeight:900, marginBottom:24 }} className="gradient-text">Growthomic</h2>
          </div>

          {/* Header */}
          <div style={{ marginBottom:28 }}>
            <h2 style={{ fontSize:22, fontWeight:800, color:"var(--text-primary)", letterSpacing:"-0.03em", marginBottom:6 }}>Welcome back</h2>
            <p style={{ fontSize:13, color:"var(--text-muted)" }}>Sign in to your dashboard</p>
          </div>

          {error && (
            <div style={{ marginBottom:16, padding:"10px 14px", borderRadius:10, background:"hsla(350,85%,60%,0.08)", border:"1px solid hsla(350,85%,60%,0.22)", fontSize:12, color:"hsl(350,85%,70%)" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* Email */}
            <div>
              <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--text-primary)", marginBottom:8 }}>Email address</label>
              <div style={{ position:"relative" }}>
                <Mail size={15} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)", pointerEvents:"none" }}/>
                <input
                  type="email" value={email} onChange={e=>setEmail(e.target.value)}
                  placeholder="admin@growthomic.com" required autoComplete="email"
                  style={{
                    width:"100%", paddingLeft:38, paddingRight:14, paddingTop:10, paddingBottom:10,
                    background:"hsla(248,12%,13%,0.6)", border:"1px solid var(--border-white)",
                    borderRadius:12, color:"var(--text-primary)", fontSize:13, fontFamily:"inherit",
                    outline:"none", transition:"border-color 0.15s, box-shadow 0.15s", boxSizing:"border-box",
                  }}
                  onFocus={e => { e.target.style.borderColor="var(--primary)"; e.target.style.boxShadow="0 0 0 3px hsla(262,83%,58%,0.12)"; }}
                  onBlur={e  => { e.target.style.borderColor="var(--border-white)"; e.target.style.boxShadow="none"; }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--text-primary)", marginBottom:8 }}>Password</label>
              <div style={{ position:"relative" }}>
                <Lock size={15} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)", pointerEvents:"none" }}/>
                <input
                  type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="current-password"
                  style={{
                    width:"100%", paddingLeft:38, paddingRight:44, paddingTop:10, paddingBottom:10,
                    background:"hsla(248,12%,13%,0.6)", border:"1px solid var(--border-white)",
                    borderRadius:12, color:"var(--text-primary)", fontSize:13, fontFamily:"inherit",
                    outline:"none", transition:"border-color 0.15s, box-shadow 0.15s", boxSizing:"border-box",
                  }}
                  onFocus={e => { e.target.style.borderColor="var(--primary)"; e.target.style.boxShadow="0 0 0 3px hsla(262,83%,58%,0.12)"; }}
                  onBlur={e  => { e.target.style.borderColor="var(--border-white)"; e.target.style.boxShadow="none"; }}
                />
                <button type="button" onClick={()=>setShowPw(p=>!p)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", display:"flex", padding:0 }}>
                  {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit" disabled={isLoading}
              style={{
                marginTop:4, padding:"12px 16px",
                background: isLoading ? "hsla(262,83%,58%,0.5)" : "linear-gradient(135deg, var(--primary), var(--accent))",
                border:"none", borderRadius:12, color:"#fff", fontSize:14, fontWeight:600,
                cursor: isLoading ? "not-allowed" : "pointer", fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                boxShadow: isLoading ? "none" : "0 4px 20px var(--primary-glow)",
                transition:"opacity 0.2s, box-shadow 0.2s",
              }}
            >
              {isLoading ? (
                <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ width:16, height:16, border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", borderRadius:"50%", display:"inline-block", animation:"spin 0.7s linear infinite" }}/>
                  Signing in...
                </span>
              ) : (
                <><span>Sign In</span><ArrowRight size={16}/></>
              )}
            </button>
          </form>
        </motion.div>
      </div>

      <style>{`
        @keyframes float1 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,15px)} }
        @keyframes float2 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-15px,20px)} }
        @keyframes spin { to { transform: rotate(360deg) } }
        .gradient-text { background: linear-gradient(135deg, var(--primary), var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        @media (max-width: 768px) {
          .left-panel-hide { display: none !important; }
          .mobile-logo { display: block !important; }
        }
      `}</style>
    </div>
  );
}
