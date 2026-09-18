import React from "react";

// ─────────────────────────────────────────────────────────────
// Semantic color constants — single source of truth
// All values map to CSS vars in globals.css
// ─────────────────────────────────────────────────────────────
export const C = {
  /* Backgrounds */
  void:     "var(--bg-void)",
  base:     "var(--bg-base)",
  surface:  "var(--bg-surface)",
  card:     "var(--bg-card)",
  elevated: "var(--bg-elevated)",
  overlay:  "var(--bg-overlay)",
  hover:    "var(--bg-hover)",

  /* Borders */
  border:       "var(--border)",
  borderMid:    "var(--border-mid)",
  borderStrong: "var(--border-strong)",

  /* Brand */
  brand:       "var(--brand)",
  brandDim:    "var(--brand-dim)",
  brandLight:  "var(--brand-light)",
  brandSubtle: "var(--brand-subtle)",
  brandBorder: "var(--brand-border)",

  /* Text */
  textPrimary:   "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textMuted:     "var(--text-muted)",
  textBrand:     "var(--text-brand)",
} as const;

// ─────────────────────────────────────────────────────────────
// Layout primitives
// ─────────────────────────────────────────────────────────────

/**
 * Page content wrapper — responsive padding + max-width centered.
 * maxWidth caps at 1440px so 24" screens don't get empty sprawl.
 * padding uses clamp: min 16px, preferred 3vw, max 48px.
 */
export const pageWrap: React.CSSProperties = {
  width: "100%",
  maxWidth: 1440,
  margin: "0 auto",
  padding: "clamp(16px, 3vw, 40px) clamp(16px, 3vw, 48px) 64px",
};

export const pageHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  marginBottom: 28,
};

export const pageTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  color: "var(--text-primary)",
  letterSpacing: "-0.025em",
  lineHeight: 1.2,
};

export const pageSubtitle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-muted)",
  marginTop: 4,
  fontWeight: 400,
};

// ─────────────────────────────────────────────────────────────
// Form controls
// ─────────────────────────────────────────────────────────────
export const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-md)",
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  transition: "border-color 0.12s",
};

// ─────────────────────────────────────────────────────────────
// Table styles
// ─────────────────────────────────────────────────────────────
export const thStyle: React.CSSProperties = {
  textAlign: "left" as const,
  padding: "9px 14px",
  fontSize: 11,
  fontWeight: 500,
  color: "var(--text-muted)",
  letterSpacing: "0.04em",
  borderBottom: "1px solid var(--border)",
  background: "var(--bg-surface)",
  whiteSpace: "nowrap" as const,
};

export const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 13,
  color: "var(--text-secondary)",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "middle" as const,
};

// ─────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────
export const skeletonStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, var(--bg-card) 25%, var(--bg-overlay) 50%, var(--bg-card) 75%)",
  backgroundSize: "600px 100%",
  animation: "shimmer 1.5s infinite",
  borderRadius: "var(--r-sm)",
};

// ─────────────────────────────────────────────────────────────
// Buttons
// ─────────────────────────────────────────────────────────────
export const btnPrimary: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  borderRadius: "var(--r-md)",
  fontSize: 13,
  fontWeight: 500,
  background: "var(--brand)",
  color: "#fff",
  border: "none",
  cursor: "pointer",
  transition: "opacity 0.12s",
  fontFamily: "inherit",
  letterSpacing: "-0.01em",
};

export const btnSecondary: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 14px",
  borderRadius: "var(--r-md)",
  fontSize: 13,
  fontWeight: 400,
  background: "var(--bg-elevated)",
  color: "var(--text-secondary)",
  border: "1px solid var(--border)",
  cursor: "pointer",
  transition: "border-color 0.12s, color 0.12s",
  fontFamily: "inherit",
};

// ─────────────────────────────────────────────────────────────
// Customer avatar helper
// ─────────────────────────────────────────────────────────────
const AVATAR_PALETTES = [
  { bg: "linear-gradient(135deg, hsl(258,90%,62%), hsl(280,85%,65%))",  border: "hsla(258,90%,62%,0.25)" },
  { bg: "linear-gradient(135deg, hsl(190,80%,45%), hsl(214,80%,58%))",  border: "hsla(190,80%,45%,0.25)" },
  { bg: "linear-gradient(135deg, hsl(150,55%,42%), hsl(190,80%,48%))",  border: "hsla(150,55%,42%,0.25)" },
  { bg: "linear-gradient(135deg, hsl(38,80%,52%),  hsl(350,72%,54%))",  border: "hsla(38,80%,52%,0.25)"  },
  { bg: "linear-gradient(135deg, hsl(280,85%,65%), hsl(330,70%,62%))",  border: "hsla(280,85%,65%,0.25)" },
  { bg: "linear-gradient(135deg, hsl(214,80%,58%), hsl(258,90%,62%))",  border: "hsla(214,80%,58%,0.25)" },
];

export function getCustomerAvatar(id?: string | null, name?: string | null) {
  const seed = (id || "") + (name || "");
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0xffffff;
  }
  const palette = AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];

  let initial = "";
  if (name && name.trim() && name.toLowerCase() !== "unknown") {
    initial = name.trim()[0].toUpperCase();
  } else if (id && id.trim()) {
    const clean = id.replace(/[^a-zA-Z0-9]/g, "");
    initial = (clean[0] || "C").toUpperCase();
  } else {
    initial = "C";
  }

  return { gradient: palette.bg, border: palette.border, initial };
}
