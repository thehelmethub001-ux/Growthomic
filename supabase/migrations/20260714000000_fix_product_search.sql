-- ============================================================
-- Fix: text_only_product_search to work better with Bangla text
-- Also fix hybrid_product_search to NOT require embedding
-- ============================================================

-- Must drop existing functions first because we're changing return type
DROP FUNCTION IF EXISTS text_only_product_search(TEXT, INT);
DROP FUNCTION IF EXISTS hybrid_product_search(vector, TEXT, INT, FLOAT, FLOAT);

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
  sku             TEXT,
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
    p.sku,
    GREATEST(
      similarity(p.name, query_text),
      similarity(COALESCE(p.description, ''), query_text),
      similarity(COALESCE(p.category, ''), query_text)
    ) AS combined_score
  FROM products p
  WHERE
    p.is_active = TRUE
    AND (
      p.name ILIKE '%' || query_text || '%'
      OR p.description ILIKE '%' || query_text || '%'
      OR p.category ILIKE '%' || query_text || '%'
      OR similarity(p.name, query_text) > 0.05
      OR similarity(COALESCE(p.description, ''), query_text) > 0.05
    )
  ORDER BY combined_score DESC
  LIMIT match_count;
$$;

-- Fix hybrid_product_search: remove embedding IS NOT NULL requirement
-- so products without embeddings also appear in results
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
  sku             TEXT,
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
    p.sku,
    (
      CASE 
        WHEN p.embedding IS NOT NULL THEN
          vector_weight * (1 - (p.embedding <=> query_embedding))
        ELSE 0
      END
      +
      text_weight * GREATEST(
        similarity(p.name, query_text),
        similarity(COALESCE(p.description, ''), query_text),
        similarity(COALESCE(p.category, ''), query_text)
      )
    ) AS combined_score
  FROM products p
  WHERE
    p.is_active = TRUE
    AND (
      p.name ILIKE '%' || query_text || '%'
      OR p.description ILIKE '%' || query_text || '%'
      OR p.category ILIKE '%' || query_text || '%'
      OR similarity(p.name, query_text) > 0.05
      OR (p.embedding IS NOT NULL AND (1 - (p.embedding <=> query_embedding)) > 0.5)
    )
  ORDER BY combined_score DESC
  LIMIT match_count;
$$;
