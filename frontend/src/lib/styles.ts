import React from "react";

export const C = {
  /* Backgrounds */
  void:    "var(--bg-void)",
  base:    "var(--bg-base)",
  surface: "var(--bg-surface)",
  card:    "var(--bg-card)",
  elevated:"var(--bg-elevated)",
  overlay: "var(--bg-overlay)",
  hover:   "var(--bg-hover)",

  /* Borders */
  border:      "var(--border)",
  borderMid:   "var(--border-mid)",
  borderBrand: "var(--border-strong)",
  borderWhite: "var(--border-white)",

  /* Brand */
  brand:      "var(--primary)",
  brandMid:   "var(--primary-mid)",
  brandLight: "var(--primary-light)",
  accent:     "var(--accent)",
  accentLight:"var(--accent-light)",

  /* Text */
  textPrimary:   "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textMuted:     "var(--text-muted)",
  textBrand:     "var(--text-brand)",
};

export const pageWrap: React.CSSProperties = {
  padding: "32px 36px 64px",
  maxWidth: 1280,
};

export const pageHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  marginBottom: 28,
};

export const pageTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: "var(--text-primary)",
  letterSpacing: "-0.03em",
  lineHeight: 1.2,
};

export const pageSubtitle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-muted)",
  marginTop: 4,
  fontWeight: 400,
};

export const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-white)",
  borderRadius: 10,
  padding: "9px 13px",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

export const thStyle: React.CSSProperties = {
  textAlign: "left" as const,
  padding: "10px 16px",
  fontSize: 10,
  fontWeight: 700,
  color: "var(--text-muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  borderBottom: "1px solid var(--border)",
  background: "var(--bg-surface)",
  whiteSpace: "nowrap" as const,
};

export const tdStyle: React.CSSProperties = {
  padding: "13px 16px",
  fontSize: 13,
  color: "var(--text-secondary)",
  borderBottom: "1px solid var(--border-white)",
  verticalAlign: "middle" as const,
};

export const skeletonStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, var(--bg-card) 25%, var(--bg-overlay) 50%, var(--bg-card) 75%)",
  backgroundSize: "600px 100%",
  animation: "shimmer 1.5s infinite",
  borderRadius: 6,
};

export const btnPrimary: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "9px 18px",
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 600,
  background: "var(--primary)",
  color: "#fff",
  border: "none",
  cursor: "pointer",
  boxShadow: "0 0 24px var(--primary-glow)",
  transition: "all 0.15s",
  fontFamily: "inherit",
  letterSpacing: "-0.01em",
};

export const btnSecondary: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "9px 16px",
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 500,
  background: "var(--bg-elevated)",
  color: "var(--text-secondary)",
  border: "1px solid var(--border-white)",
  cursor: "pointer",
  transition: "all 0.15s",
  fontFamily: "inherit",
};
