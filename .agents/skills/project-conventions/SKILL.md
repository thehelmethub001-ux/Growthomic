---
name: project-conventions
description: Use when writing or modifying any code in this repository.
---

# Growthomic Project Conventions

Guidelines, architecture patterns, and conventions for development in the Growthomic repository.

## 1. Codebase Architecture

- **Frontend (`frontend/`)**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4.
  - App routes live in `frontend/src/app/`.
  - Shared components live in `frontend/src/components/` (UI primitives in `frontend/src/components/ui/`).
  - Lib / utilities in `frontend/src/lib/` (e.g. Supabase browser/server clients).
  - Context & state providers in `frontend/src/context/`.
  - Type definitions in `frontend/src/types/`.
- **Backend / Edge Functions (`supabase/functions/`)**: Deno + TypeScript serverless functions.
  - Deployed directly via Supabase CLI.
  - Handle webhook ingestion (Facebook, WooCommerce), AI logic, and background processing.
- **Database (`supabase/migrations/`)**: PostgreSQL managed via declarative migration files.

## 2. Naming & Import Conventions

- **Files & Components**:
  - React components: PascalCase (e.g. `OrderTable.tsx`, `StatCard.tsx`).
  - Utilities / hooks / helpers: camelCase (e.g. `useRealtimeOrders.ts`, `formatCurrency.ts`).
  - Next.js routing files: standard lowercase (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`).
- **Imports**:
  - Use the `@/` path alias mapped to `frontend/src/` (e.g. `@/components/ui/badge`, `@/lib/supabase/client`).
  - Keep imports grouped: standard libraries first, internal alias imports second, relative styles/assets last.

## 3. Error Handling & API Responses

- **API Response Shape**: Standardize Edge Function and internal API route responses:
  ```ts
  // Success
  return Response.json({ success: true, data: result }, { status: 200 });

  // Error
  return Response.json({ success: false, error: "Human-readable error message" }, { status: 400 });
  ```
- **Edge Functions**:
  - Always wrap top-level request handlers in `try ... catch`.
  - Return appropriate HTTP status codes (400 for bad payloads, 401 for unauthorized, 500 for unhandled exceptions).
  - Never crash the worker process without returning a structured JSON response.
- **Frontend Data Fetching**:
  - Guard against null/undefined in Supabase responses (`const { data, error } = await supabase...`).
  - Always handle the `error` branch gracefully (toast notification or inline error state).

## 4. State & Realtime Patterns

- **Realtime Subscriptions**:
  - When subscribing to Postgres changes via Supabase Client (e.g. `messages`, `orders`, `conversations`), always clean up the channel in `useEffect` return function:
  ```ts
  const channel = supabase.channel('order-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => { ... })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
  ```
- **Local State**: Prefer React 19 standard hooks (`useState`, `useReducer`, `useMemo`, `useTransition`) over third-party heavyweight state libraries unless necessary.

## 5. What NEVER To Do in this Repository

1. **NEVER mutate cart items directly in concurrent scenarios**:
   - Always use the `append_to_cart` RPC or check `idempotency_log` to prevent race conditions and duplicate orders.
2. **NEVER overwrite manually edited orders during WooCommerce sync**:
   - If an order or item has `manually_edited: true`, automated sync routines must preserve the manual edits.
3. **NEVER hardcode secrets or service role keys**:
   - Frontend must only use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - `SUPABASE_SERVICE_ROLE_KEY` is strictly for server-side / Edge Functions.
4. **NEVER run Node.js npm installs inside `supabase/functions/`**:
   - Edge functions run on Deno. Use ESM imports (e.g. `npm:<package>` or `https://esm.sh/<package>`).
5. **NEVER touch backend migrations or API logic during purely UI/styling tasks**:
   - Confine UI changes strictly to `frontend/src/` components and CSS.
