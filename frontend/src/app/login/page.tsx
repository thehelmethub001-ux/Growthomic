"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sb = createClient();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    router.replace("/overview");
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg-base)", position: "relative", overflow: "hidden", fontFamily: "inherit",
    }}>
      {/* Ambient orbs */}
      <div style={{ position:"absolute", width:600, height:600, borderRadius:"50%", background:"radial-gradient(circle,hsla(262,83%,58%,0.1) 0%,transparent 65%)", top:-200, left:-200, pointerEvents:"none", animation:"orb-drift-1 20s ease-in-out infinite" }}/>
      <div style={{ position:"absolute", width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle,hsla(271,91%,65%,0.07) 0%,transparent 65%)", bottom:-200, right:-150, pointerEvents:"none", animation:"orb-drift-2 16s ease-in-out infinite" }}/>

      <motion.div initial={{ opacity:0, y:20, scale:0.97 }} animate={{ opacity:1, y:0, scale:1 }} transition={{ duration:0.4, ease:"easeOut" }} style={{
        width: "100%", maxWidth: 400, padding: 40,
        background: "hsla(248,12%,9%,0.8)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid var(--border)",
        borderRadius: 20,
        boxShadow: "0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px var(--border)",
        position: "relative",
      }}>
        {/* Top glow */}
        <div style={{ position:"absolute", top:0, left:"10%", right:"10%", height:1, background:"linear-gradient(90deg,transparent,var(--primary),var(--accent),transparent)", opacity:0.7, borderRadius:"0 0 999px 999px" }}/>

        {/* Logo */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", marginBottom:32 }}>
          <div style={{
            width:48, height:48, borderRadius:14, marginBottom:16,
            background:"linear-gradient(135deg, var(--primary), var(--accent))",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:20, fontWeight:800, color:"#fff",
            boxShadow:"0 0 30px var(--primary-glow)",
          }}>G</div>
          <h1 style={{ fontSize:22, fontWeight:700, color:"var(--text-primary)", letterSpacing:"-0.03em", marginBottom:4 }}>Welcome back</h1>
          <p style={{ fontSize:13, color:"var(--text-muted)", fontWeight:400 }}>Sign in to Growthomic dashboard</p>
        </div>

        <form onSubmit={handleLogin} style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>Email</label>
            <input
              type="email" value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="admin@example.com" required autoComplete="email"
              style={{
                width:"100%", background:"var(--bg-elevated)", border:"1px solid var(--border-white)",
                borderRadius:10, padding:"10px 13px", color:"var(--text-primary)", fontSize:13,
                fontFamily:"inherit", outline:"none", transition:"border-color 0.15s",
              }}
              onFocus={e=>e.target.style.borderColor="var(--border-strong)"}
              onBlur={e=>e.target.style.borderColor="var(--border-white)"}
            />
          </div>
          <div>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>Password</label>
            <div style={{ position:"relative" }}>
              <input
                type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password"
                style={{
                  width:"100%", background:"var(--bg-elevated)", border:"1px solid var(--border-white)",
                  borderRadius:10, padding:"10px 40px 10px 13px", color:"var(--text-primary)", fontSize:13,
                  fontFamily:"inherit", outline:"none", transition:"border-color 0.15s",
                }}
                onFocus={e=>e.target.style.borderColor="var(--border-strong)"}
                onBlur={e=>e.target.style.borderColor="var(--border-white)"}
              />
              <button type="button" onClick={()=>setShowPw(p=>!p)} style={{
                position:"absolute", right:11, top:"50%", transform:"translateY(-50%)",
                background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", display:"flex",
              }}>
                {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ padding:"10px 13px", borderRadius:9, background:"hsla(350,85%,60%,0.08)", border:"1px solid hsla(350,85%,60%,0.2)", fontSize:12, color:"hsl(350,85%,70%)" }}>{error}</div>
          )}

          <motion.button
            type="submit" disabled={loading}
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
            style={{
              width:"100%", padding:"11px", marginTop:6, borderRadius:11,
              background:"linear-gradient(135deg, var(--primary), var(--accent))",
              color:"#fff", border:"none", fontSize:14, fontWeight:600,
              cursor: loading?"not-allowed":"pointer", opacity: loading?0.75:1,
              boxShadow:"0 0 24px var(--primary-glow)",
              fontFamily:"inherit", letterSpacing:"-0.01em",
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </motion.button>
        </form>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginTop:22 }}>
          <Sparkles size={12} color="var(--primary-light)" style={{opacity:0.6}}/>
          <span style={{ fontSize:11, color:"var(--text-muted)" }}>Secured by Supabase Auth</span>
        </div>
      </motion.div>
    </div>
  );
}
