# AI Sales Agent — Growthomic Lite

An AI-powered sales agent for Bangladeshi e-commerce businesses. Handles Facebook Messenger, Instagram DM, and WhatsApp conversations — answering product questions, taking COD orders, detecting spam, and following up with customers — all from a single dashboard.

## Architecture

- **Backend**: Supabase Edge Functions (Deno runtime)
- **Database**: PostgreSQL via Supabase (pgvector + pg_trgm for hybrid RAG)
- **Queue**: Upstash QStash (HTTP-based job queue)
- **Cache/Locks**: Upstash Redis (REST)
- **AI Engine**: Google Gemini 1.5 Flash
- **Voice**: OpenAI Whisper
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Storage**: Supabase Storage
- **Order Sync**: WooCommerce REST API (one-way push)

## Project Structure

```
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_pgvector.sql
│   │   └── 003_rls_policies.sql
│   └── functions/
│       ├── _shared/              # Shared utilities
│       │   ├── types.ts
│       │   ├── cors.ts
│       │   ├── supabase-client.ts
│       │   ├── upstash.ts
│       │   ├── gemini.ts
│       │   ├── spamguard.ts
│       │   ├── platform-send.ts
│       │   └── woocommerce.ts
│       ├── webhook-meta/         # Meta webhook handler (FB/IG/WA)
│       ├── queue-processor/      # Main AI pipeline
│       ├── followup-handler/     # Follow-up engine
│       └── woo-retry/            # WooCommerce retry
├── frontend/                     # Next.js dashboard
└── .env.example
```

## Setup

### 1. Supabase Project

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Run migrations in order:
   ```sql
   -- In Supabase SQL Editor:
   -- 1. Run 001_initial_schema.sql
   -- 2. Run 002_pgvector.sql
   -- 3. Run 003_rls_policies.sql
   ```

### 2. Upstash

1. Create Redis database at [upstash.com](https://upstash.com) → copy REST URL + Token
2. Create QStash → copy Token + Signing Keys

### 3. Meta App Setup

1. Create Meta Developer App
2. Add Messenger, Instagram, WhatsApp products
3. Set webhook URL to your deployed `webhook-meta` Edge Function URL
4. Set `META_VERIFY_TOKEN` to any string you choose

### 4. Deploy Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-id

# Set environment variables
supabase secrets set GEMINI_API_KEY=xxx
supabase secrets set OPENAI_API_KEY=xxx
supabase secrets set UPSTASH_REDIS_REST_URL=xxx
supabase secrets set UPSTASH_REDIS_REST_TOKEN=xxx
supabase secrets set QSTASH_TOKEN=xxx
supabase secrets set QSTASH_CURRENT_SIGNING_KEY=xxx
supabase secrets set QSTASH_NEXT_SIGNING_KEY=xxx
supabase secrets set META_APP_SECRET=xxx
supabase secrets set META_VERIFY_TOKEN=xxx
supabase secrets set META_PAGE_ACCESS_TOKEN=xxx
supabase secrets set WHATSAPP_PHONE_NUMBER_ID=xxx
supabase secrets set QUEUE_PROCESSOR_URL=https://xxx.supabase.co/functions/v1/queue-processor
supabase secrets set FOLLOWUP_HANDLER_URL=https://xxx.supabase.co/functions/v1/followup-handler
supabase secrets set WOO_RETRY_URL=https://xxx.supabase.co/functions/v1/woo-retry

# Deploy all Edge Functions
supabase functions deploy webhook-meta
supabase functions deploy queue-processor
supabase functions deploy followup-handler
supabase functions deploy woo-retry
```

### 5. Frontend

```bash
cd frontend
cp ../.env.example .env.local
# Fill in env vars
npm install
npm run dev
```

## Meta Compliance

This system is compliant with Meta's January 15, 2026 WhatsApp policy:
- AI is strictly scoped to e-commerce/product/order topics
- No general-purpose AI responses
- System prompt hard-locks the bot to business scope only
- Off-topic questions get a fixed redirect reply

## PRD Reference

See `instruction.md` for the full Product Requirements Document.
