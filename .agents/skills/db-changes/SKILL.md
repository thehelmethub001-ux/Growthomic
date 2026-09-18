---
name: db-changes
description: Use when creating, altering, or migrating database tables or schema.
---

# Growthomic Database Changes & Migrations

Guidelines and workflow for managing PostgreSQL database schema, migrations, RLS policies, and extensions in Growthomic.

## 1. Migration Workflow

- All schema modifications MUST be recorded as version-controlled SQL files inside:
  `supabase/migrations/<YYYYMMDDHHMMSS>_<short_description>.sql`
- **Rules**:
  - Never alter production tables directly via the Supabase Dashboard without a corresponding migration script.
  - Every migration file should be idempotent where possible (use `IF NOT EXISTS`, `IF EXISTS`, `CREATE OR REPLACE`).
  - Include both schema definitions and associated RLS policies in the same migration file.

## 2. Naming Conventions

- **Tables**: lowercase snake_case plural (e.g. `orders`, `conversations`, `order_items`, `customers`).
- **Columns**: lowercase snake_case (e.g. `created_at`, `manually_edited`, `customer_phone`, `metadata`).
- **Indexes**: `idx_<table_name>_<column_name>` (e.g. `idx_orders_customer_phone`, `idx_products_embedding`).
- **Foreign Keys**: `fk_<source_table>_<target_table>` or standard `<referenced_table_singular>_id`.

## 3. Database Extensions

Growthomic relies on the following Postgres extensions:
- **`vector` (`pgvector`)**:
  - Used for AI product search, message semantic matching, and embeddings.
  - Standard embedding dimension: **768** (compatible with Gemini / `text-embedding-004`).
  - Indexing: Use IVFFlat or HNSW (e.g. `USING hnsw (embedding vector_cosine_ops)`).
- **`pg_trgm`**:
  - Used for fuzzy text search and trigram matching on product names, customer queries, and variations.

## 4. Row Level Security (RLS) & Permissions

- **Single-Tenant Model**:
  - Growthomic uses a single-tenant or authenticated-dashboard security model.
  - Always run `ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;`.
- **Role Permissions**:
  - `authenticated`: Granted access to dashboard operations (CRUD on products, orders, conversations, settings).
  - `anon`: Strictly limited or denied access to sensitive internal tables. Webhook endpoints authenticate via bearer tokens or secret headers.
  - `service_role`: Edge Functions run using the Supabase Service Role Key, which bypasses RLS.
- **Realtime publication**:
  - If a table requires live UI updates (e.g. `messages`, `orders`, `conversations`), explicitly add it to the realtime publication:
    ```sql
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    ```

## 5. Concurrency & Data Integrity Patterns

- **Cart Mutations & Idempotency**:
  - Concurrency-safe cart operations must use the `append_to_cart` stored procedure.
  - Background webhook workers must check `idempotency_log` using the external message/event ID before processing.
- **WooCommerce Sync Safety**:
  - Protect user modifications: Schema must support `manually_edited boolean DEFAULT false`. Update operations must not overwrite fields when `manually_edited = true`.

## 6. Migration Validation Checklist

Before applying any migration:
1. Verify syntax in a local Supabase environment: `supabase db reset` or `supabase migration up`.
2. Check for breaking column removals or type conversions.
3. Ensure all new tables have `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` or appropriate PK, and `created_at timestamptz DEFAULT now()`.
4. Ensure appropriate RLS policies are attached immediately.
