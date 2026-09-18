# Growthomic Dashboard — UI/UX Premium Redesign (v2 — verified against live repo)

> This version was written after directly inspecting `github.com/thehelmethub001-ux/Growthomic` (frontend/). Every fix below references a real file and, where possible, a real line number — not a guess. Antigravity should verify these line numbers against the current `main` branch before editing (they may have shifted slightly since this was written) but the diagnosis is confirmed accurate.

## ⚠️ SCOPE GUARDRAIL — READ FIRST
Pure UI/UX/styling task. Do NOT touch anything under `supabase/functions/`, `supabase/migrations/`, `frontend/src/app/api/`, or any file handling `cart_state`, orders, or product/variant matching logic. Only touch: `frontend/src/app/globals.css`, `frontend/src/lib/styles.ts`, `frontend/src/app/(dashboard)/layout.tsx`, and the markup/JSX inside individual `frontend/src/app/(dashboard)/*/page.tsx` files.

After every change: run `npx tsc --noEmit --skipLibCheck` inside `frontend/` and confirm zero new errors. Report `git diff --stat` when done — it must show only files listed above.

**Correction to prior assumptions:** the stack is Next.js 16 + React 19 + Tailwind CSS v4 (CSS-first config, no `tailwind.config.*` file — theme lives in `globals.css`) + `lucide-react` + `recharts` + `framer-motion`. It is **not** using shadcn/ui despite what older docs say — there are no Radix/CVA dependencies. Don't introduce shadcn; work with what's already there.

---

## 1. GOOD NEWS: a design token system already exists — USE IT, don't reinvent it
`frontend/src/app/globals.css` already defines a solid CSS variable system (`--bg-base`, `--bg-card`, `--primary`, `--accent`, `--border`, `--text-primary/secondary/muted`, `--green/--amber/--red/--cyan`) and a shared badge system (`.badge`, `.badge-purple`, `.badge-amber`, `.badge-green`, `.badge-red`, `.badge-muted`, `.badge-cyan`). `frontend/src/lib/styles.ts` exports a `C` object mapping to these same variables plus shared style objects (`pageWrap`, `pageHeader`, `thStyle`, `tdStyle`, `btnPrimary`, `btnSecondary`).

**The actual problem is that almost nothing uses them.** Confirmed by grep: the `.badge` class is used in exactly **one** page (`ai-settings/page.tsx:209` → `<span className="badge badge-amber">Policy Active</span>`) out of ten dashboard pages. Every other status pill is hand-rolled with inline hex colors, e.g.:
- `orders/page.tsx:367` — the "DUP" badge: `style={{ background:"rgba(251,191,36,0.18)", color:"#fbbf24", ... }}`
- `products/page.tsx:245` — the "Locked" badge: `style={{ color:"#fbbf24", ... }}`

**Task:** Go through every `page.tsx` under `frontend/src/app/(dashboard)/` and replace every ad-hoc inline-styled status pill/badge with `className="badge badge-{variant}"` using the existing `globals.css` classes. Match colors semantically: amber→warning/pending/locked/dup, green→success/active/clean/synced, red→danger/complaint/failed, purple→brand/VIP/AI, muted→neutral/unknown. Do not invent new badge classes unless a genuinely new semantic status has no matching variant — if so, add exactly one new `.badge-*` variant to `globals.css` following the existing pattern, don't hardcode a new inline color again.

---

## 2. BACKGROUND — premium black+purple gradient WITH grid lines (currently missing)
Confirmed: `frontend/src/app/(dashboard)/layout.tsx` currently renders the base background as flat `var(--bg-base)` plus two soft blurred "ambient orb" divs (`orb-drift-1`/`orb-drift-2` keyframes, 5–7% opacity radial gradients) — no grid pattern exists anywhere in the codebase yet. This is exactly why it still reads as flat/plain despite the orbs.

**Task — add a grid-overlay layer** as a new `<div>` inside the outermost wrapper in `layout.tsx` (the `display:flex, width:100vw, height:100vh` div), positioned between the base background and the ambient orb divs (same `position:absolute, pointerEvents:none` pattern already used there):
```tsx
<div style={{
  position:"absolute", inset:0, zIndex:0, pointerEvents:"none",
  backgroundImage:
    "linear-gradient(to right, hsla(262,83%,58%,0.05) 1px, transparent 1px)," +
    "linear-gradient(to bottom, hsla(262,83%,58%,0.05) 1px, transparent 1px)",
  backgroundSize: "40px 40px",
  maskImage: "radial-gradient(ellipse 90% 70% at 50% 0%, black 40%, transparent 100%)",
  WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 50% 0%, black 40%, transparent 100%)",
}} />
```
Keep opacity in the `hsla(262,83%,58%,0.04–0.06)` range — same purple hue already used for `--primary` (262 83% 58%), so it reads as intentional, not random. The mask fades the grid out near the bottom/edges so it doesn't look like a harsh CSS pattern. Verify the existing ambient orbs (`orb-drift-1`/`orb-drift-2`) still render on top of the grid, not behind it — check z-index ordering (grid at the base, orbs above it, both below `zIndex:5` content).

Do not touch `--bg-base`/`--bg-card` hue values in `globals.css` — the black-to-purple tone is already correct (`hsl(240 13% 6%)` base, `hsl(262 83% 58%)` primary); the problem was texture, not color.

---

## 3. RESPONSIVE — FIX THE CONFIRMED ROOT CAUSE OF THE BIG-SCREEN EMPTY-SPACE BUG
**Root cause found and verified:** `frontend/src/lib/styles.ts`, the `pageWrap` export:
```ts
export const pageWrap: React.CSSProperties = {
  padding: "28px 36px 64px",
  maxWidth: 1280,
};
```
This is imported and applied as the outer wrapper in every dashboard page. It has `maxWidth: 1280` with **no `margin: "0 auto"`**. Since the parent (`layout.tsx`'s main content area) is a `flex:1, flexDirection:column` container with default `align-items: stretch`, this child gets capped at 1280px and — with no auto margin — sits flush against the left edge. On any monitor wider than sidebar (240px) + 1280px + padding (~1600px total), **all the remaining width becomes a dead empty gap on the right.** This is precisely the bug reported.

**Task — replace `pageWrap` in `frontend/src/lib/styles.ts`** with a fluid, breakpoint-aware version instead of a single hard cap:
```ts
export const pageWrap: React.CSSProperties = {
  padding: "28px 36px 64px",
  maxWidth: "100%",
  width: "100%",
};
```
Then, inside each page's content (the stat-card grids, tables), use CSS Grid/Flexbox with `fr` units so content genuinely expands to fill the available width rather than just removing the cap and leaving raw over-stretched single-column content. Specifically:
- Stat card rows: convert to `display:grid, gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))", gap:16` so cards reflow and widen naturally instead of stretching to absurd widths or leaving gaps.
- Tables (Orders, Products, CRM): keep `width:"100%"` on the table element itself (they likely already have this) — the fix in `pageWrap` above should already resolve the outer gap; confirm no table-specific `maxWidth` exists that would still cause a secondary gap.
- If a genuinely centered max-reading-width is wanted for text-heavy pages (e.g., AI Settings' persona textarea), that's fine to keep narrow — but center it explicitly (`margin:"0 auto"`) rather than leaving it left-aligned with dead space, and only apply that narrower cap to the specific text column, not the whole page wrapper.
- Test at 1366px, 1920px, 2560px, and 3440px (ultrawide) — confirm no dead gap and no awkward over-stretching (e.g., a single stat card stretching to 800px wide looks broken; use `auto-fit`/`minmax` as above so cards multiply into more columns instead of just growing wider).
- Confirm mobile (<768px) still collapses correctly — check if a mobile sidebar/hamburger exists in `layout.tsx` already; if the current 240px fixed-width sidebar has no responsive collapse, add one (this wasn't visible in the screenshots provided, verify directly in code).

---

## 4. TYPOGRAPHY / BENGALI FONT — fixes the broken ৳ (Taka) glyph
Confirmed: `frontend/src/app/globals.css` font stack is `'Inter', system-ui, -apple-system, sans-serif` — no Bengali-script-capable font. Confirmed the ৳ character itself is correctly embedded as a literal UTF-8 character in code (e.g. `overview/page.tsx:75`: `` `৳${kpiData.revenue.toLocaleString()}` ``) — so this is purely a font-rendering fallback issue, not a data/encoding bug.

**Task:** add `Noto Sans Bengali` to the `@import` and font-family stack in `globals.css`:
```css
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap");
...
html, body {
  font-family: 'Inter', 'Noto Sans Bengali', system-ui, -apple-system, sans-serif;
  ...
}
```
Verify after the change that ৳ renders as the actual Taka glyph (not a broken/substituted character) on Overview and Analytics revenue cards, and that any Bengali product category text (seen on the Products page, e.g. "এক্সেসরিজ") also renders cleanly with this font rather than a fallback tofu box.

---

## 5. CRITICAL — remove developer CLI instructions from client-facing Settings page
Confirmed: `frontend/src/app/(dashboard)/settings/page.tsx` lines 118–122 hardcode raw CLI setup commands directly into the rendered UI:
```tsx
<div><span style={{opacity:0.5}}>supabase secrets set </span><span ...>GEMINI_API_KEY</span>=xxx</div>
<div>...OPENAI_API_KEY...</div>
<div>...UPSTASH_REDIS_REST_URL...</div>
<div>...QSTASH_TOKEN...</div>
<div>...META_APP_SECRET...</div>
```
This is a real B2B SaaS settings page a paying tenant business owner will see — showing them raw Supabase CLI env-var commands is a scope/audience mismatch and looks unfinished/scary to a non-developer.

**Task:** delete this "Edge Function Secrets" block from `settings/page.tsx` entirely. Move the actual setup instructions to the repo's `README.md` (they're partially already there under "Deploy Edge Functions") — the dashboard itself should only ever show tenant-editable fields like the WooCommerce Store URL/Consumer Key/Secret block that's already correctly built above it on the same page.

---

## 6. BRANDING — personalize the greeting, since Growthomic is multi-tenant
Confirmed: `overview/page.tsx:93` hardcodes `"Admin!"` in the greeting (`{greeting}, <span className="gradient-text">Admin!</span> 👋`), while `ai-settings/page.tsx` already reads/writes a `business_settings.business_name` field (e.g. line 46, 103).

**Task:** change the Overview greeting to pull the tenant's actual `business_name` from `business_settings` (same table/pattern already used in `ai-settings/page.tsx`) instead of the hardcoded "Admin!" — e.g. `{greeting}, <span className="gradient-text">{businessName}!</span> 👋`. Fall back to "there" or the existing "Admin" only if the field is empty. This is a one-line change with real personalization payoff since the product is sold to multiple businesses (The Helmet Hub being just the first live tenant).

---

## 7. COMPONENT POLISH (do after 1–6, lower priority but real "premium" payoff)
- **Charts (recharts, Overview's Activity chart + Analytics' Revenue Trend/AI-vs-Human):** current styling is default recharts (thin lines, dotted gridlines). Add a gradient `<linearGradient>` area fill under line charts using `var(--primary)` fading to transparent, mute gridlines to `strokeOpacity: 0.06` horizontal-only, and style the tooltip component to match the dark/glass theme (check if it's currently using recharts' default white tooltip — likely is, since no custom `<Tooltip content={...}>` was found in the grep).
- **Empty states** (e.g. Offers & Events "No offers found. Create one above!"): replace the bare text with a small centered icon (from `lucide-react`, already a dependency) + heading + one-line subtext + the existing `btnPrimary` style CTA, instead of a plain sentence.
- **Avatars for "Unknown" customers** (CRM/Inbox): replace the generic `?` icon with a deterministic color gradient circle showing an initial derived from a hash of the customer ID — small change, removes a chunk of the template feeling from list-heavy pages.
- **Sidebar section labels** (`layout.tsx`'s `navGroups` render — MAIN/COMMERCE/INSIGHTS/SETTINGS): already reasonably muted (`fontSize:9, color:var(--text-muted)`), but add a subtle 1px divider (`var(--border-white)`) between groups for clearer separation, since currently only vertical margin (`marginBottom:20`) separates them.

---

## 8. VERIFICATION CHECKLIST (Antigravity must report against each line, not just say "done")
- [ ] Screenshot Overview, Orders, Products, CRM, Analytics, Settings at 1366px, 1920px, 2560px, 3440px, and 375px (mobile) — confirm no dead-space gap and no horizontal overflow.
- [ ] Confirm ৳ renders as a proper Taka glyph (not a broken character) on Overview and Analytics.
- [ ] Confirm zero occurrences of `supabase secrets set` or raw env var names remain in any file under `frontend/src/app/(dashboard)/`.
- [ ] Confirm `.badge badge-*` classes are used consistently across Orders/Products/CRM/Human Queue — grep for old ad-hoc badge inline-styles (e.g. `#fbbf24` hardcoded) and confirm they're gone or intentionally kept only where no semantic badge variant fits.
- [ ] Confirm the Overview greeting shows the real `business_settings.business_name`, not a hardcoded "Admin!".
- [ ] Run `npx tsc --noEmit --skipLibCheck` inside `frontend/` — zero new errors.
- [ ] Confirm no changes to any file under `supabase/` or `frontend/src/app/api/`.
- [ ] Paste `git diff --stat` output — should only list `globals.css`, `lib/styles.ts`, `(dashboard)/layout.tsx`, and `(dashboard)/*/page.tsx` files.