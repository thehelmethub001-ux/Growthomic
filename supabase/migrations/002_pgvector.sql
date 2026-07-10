-- ============================================================
-- 002_pgvector.sql
-- pgvector extension + HNSW index + Hybrid RAG search function
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- HNSW index for fast cosine similarity search on product embeddings
-- m=16, ef_construction=64 are good defaults for this scale
CREATE INDEX IF NOT EXISTS idx_products_embedding_hnsw
  ON products
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- GIN index for pg_trgm ILIKE search on product name and description
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON products USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_description_trgm
  ON products USING GIN (description gin_trgm_ops);

-- ============================================================
-- hybrid_product_search()
-- Combines pgvector cosine similarity + pg_trgm text matching
-- Returns top-k products ranked by combined relevance score
--
-- Usage:
--   SELECT * FROM hybrid_product_search(
--     query_embedding := '[0.1, 0.2, ...]'::vector,
--     query_text      := 'লাল শার্ট দাম কত',
--     match_count     := 5,
--     vector_weight   := 0.7,
--     text_weight     := 0.3
--   );
-- ============================================================
CREATE OR REPLACE FUNCTION hybrid_product_search(
  query_embedding  vector(1536),
  query_text       TEXT,
  match_count      INT     DEFAULT 5,
  vector_weight    FLOAT   DEFAULT 0.7,
  text_weight      FLOAT   DEFAULT 0.3
)
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  description     TEXT,
  regular_price   NUMERIC,
  sale_price      NUMERIC,
  stock_quantity  INT,
  category        TEXT,
  images          TEXT[],
  qna_pairs       JSONB,
  return_conditions TEXT,
  required_order_fields JSONB,
  related_product_ids   UUID[],
  woo_product_id  INT,
  combined_score  FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT
    p.id,
    p.name,
    p.description,
    p.regular_price,
    p.sale_price,
    p.stock_quantity,
    p.category,
    p.images,
    p.qna_pairs,
    p.return_conditions,
    p.required_order_fields,
    p.related_product_ids,
    p.woo_product_id,
    (
      vector_weight * (1 - (p.embedding <=> query_embedding)) +
      text_weight   * GREATEST(
        similarity(p.name, query_text),
        similarity(COALESCE(p.description, ''), query_text)
      )
    ) AS combined_score
  FROM products p
  WHERE
    p.is_active = TRUE
    AND p.embedding IS NOT NULL
  ORDER BY combined_score DESC
  LIMIT match_count;
$$;

-- ============================================================
-- text_only_product_search()
-- Fallback when no embedding available (new products not yet embedded)
-- ============================================================
CREATE OR REPLACE FUNCTION text_only_product_search(
  query_text   TEXT,
  match_count  INT DEFAULT 5
)
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  description     TEXT,
  regular_price   NUMERIC,
  sale_price      NUMERIC,
  stock_quantity  INT,
  category        TEXT,
  images          TEXT[],
  qna_pairs       JSONB,
  return_conditions TEXT,
  required_order_fields JSONB,
  related_product_ids   UUID[],
  woo_product_id  INT,
  combined_score  FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT
    p.id,
    p.name,
    p.description,
    p.regular_price,
    p.sale_price,
    p.stock_quantity,
    p.category,
    p.images,
    p.qna_pairs,
    p.return_conditions,
    p.required_order_fields,
    p.related_product_ids,
    p.woo_product_id,
    GREATEST(
      similarity(p.name, query_text),
      similarity(COALESCE(p.description, ''), query_text)
    ) AS combined_score
  FROM products p
  WHERE
    p.is_active = TRUE
    AND (
      p.name ILIKE '%' || query_text || '%'
      OR p.description ILIKE '%' || query_text || '%'
      OR similarity(p.name, query_text) > 0.1
    )
  ORDER BY combined_score DESC
  LIMIT match_count;
$$;

-- ============================================================
-- get_conversation_context()
-- Returns last N messages for AI context window
-- ============================================================
CREATE OR REPLACE FUNCTION get_conversation_context(
  p_conversation_id UUID,
  message_limit     INT DEFAULT 20
)
RETURNS TABLE (
  role       TEXT,
  content    TEXT,
  media_type TEXT,
  media_url  TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT role, content, media_type, media_url, created_at
  FROM messages
  WHERE conversation_id = p_conversation_id
  ORDER BY created_at DESC
  LIMIT message_limit;
$$;

-- ============================================================
-- cleanup_idempotency_log()
-- Removes old idempotency records (run daily via pg_cron or Edge Function)
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_idempotency_log()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM idempotency_log
  WHERE processed_at < NOW() - INTERVAL '7 days';
$$;
