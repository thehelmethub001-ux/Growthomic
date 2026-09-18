---
name: pre-deploy-check
description: Use before deploying or creating a pull request / merging to main.
---

# Growthomic Pre-Deploy Verification

Verification checklist and steps to ensure code quality, build stability, and deployment readiness before pushing to GitHub or deploying to production.

## 1. Frontend Verification

Navigate to `frontend/` directory and execute:

```bash
cd frontend

# 1. Typecheck the entire frontend codebase
npx tsc --noEmit

# 2. Production build verification (validates Next.js routes, server components, and styling)
npm run build
```

- **Pass Criteria**:
  - `tsc --noEmit` must finish with **0 errors**.
  - `npm run build` must generate static and dynamic routes cleanly without compilation or hydration warnings.

## 2. Environment Variables & Configuration

- Confirm no secret keys have been committed to git (check `.env.local`, `.env`).
- Verify any newly added environment variables are reflected in `.env.example`:
  - Frontend public vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - Edge function secrets: `SUPABASE_SERVICE_ROLE_KEY`, AI API keys, Webhook secrets.
- If new environment variables were introduced, ensure they are configured in the **Vercel Project Settings** and **Supabase Secrets** before deployment.

## 3. Edge Functions Validation

If any code in `supabase/functions/` was touched:
- Validate syntax and formatting:
  ```bash
  supabase functions test
  # or verify via Deno
  deno check supabase/functions/<function-name>/index.ts
  ```
- Verify CORS headers are properly configured for functions called from the browser.
- Ensure all third-party dependencies use explicit versions in ESM URLs.

## 4. Git Hygiene & Staging Check

Run from workspace root:
```bash
git status
```

- **Verify**:
  - No temporary test scripts (`check_*.ts`, `test_*.js`, scratch `.json` files) are staged.
  - No secrets, tokens, or credentials are in staged files.
  - Only expected files related to the specific feature or bugfix are staged.

## 5. Deployment Pipelines

- **Frontend**: Automatically deployed via Vercel upon pushing to the `main` branch:
  - Live production URL: `https://growthomic.vercel.app`
- **Backend / Database**:
  - Migrations: Deployed via `supabase db push` or connected GitHub integration.
  - Edge Functions: Deployed via `supabase functions deploy <function-name>`.
