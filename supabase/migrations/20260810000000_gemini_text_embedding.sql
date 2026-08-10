-- 20260810000000_gemini_text_embedding.sql
-- Step 1: Drop old 1536-dim text embedding column and replace with 768-dim Gemini column
ALTER TABLE products DROP COLUMN IF EXISTS embedding;
ALTER TABLE products ADD COLUMN embedding vector(768);

-- Step 2: Drop and recreate HNSW index for 768-dim
DROP INDEX IF EXISTS idx_products_embedding_hnsw;
CREATE INDEX idx_products_embedding_hnsw
  ON products USING hnsw (embedding vector_cosine_ops);

-- Step 3: Update ai_learned_responses embedding column  
ALTER TABLE ai_learned_responses DROP COLUMN IF EXISTS embedding;
ALTER TABLE ai_learned_responses ADD COLUMN embedding vector(768);
DROP INDEX IF EXISTS ai_learned_responses_embedding_idx;
CREATE INDEX ai_learned_responses_embedding_idx
  ON ai_learned_responses USING hnsw (embedding vector_cosine_ops);

-- Step 4: Update hybrid_product_search RPC to use vector(768)
CREATE OR REPLACE FUNCTION hybrid_product_search(
  query_embedding vector(768),
  query_text text,
  match_count int DEFAULT 10,
  match_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  regular_price numeric,
  sale_price numeric,
  stock_quantity integer,
  category text,
  images jsonb,
  variations jsonb,
  qna_pairs jsonb,
  required_order_fields jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.description,
    p.regular_price,
    p.sale_price,
    p.stock_quantity,
    p.category,
    p.images,
    p.variations,
    p.qna_pairs,
    p.required_order_fields,
    (
      -- Combined score: 60% text match + 40% embedding match (if embedding exists)
      0.6 * COALESCE(ts_rank(
        setweight(to_tsvector('english', coalesce(p.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(p.description, '')), 'B'),
        plainto_tsquery('english', query_text)
      ), 0) +
      0.4 * CASE
        WHEN p.embedding IS NOT NULL AND query_embedding IS NOT NULL THEN
          (1 - (p.embedding <=> query_embedding))
        ELSE 0
      END
    ) AS similarity
  FROM products p
  WHERE p.is_active = true
    AND (
      p.name ILIKE '%' || query_text || '%'
      OR p.description ILIKE '%' || query_text || '%'
      OR p.category ILIKE '%' || query_text || '%'
      OR (p.embedding IS NOT NULL AND query_embedding IS NOT NULL AND (1 - (p.embedding <=> query_embedding)) > match_threshold)
    )
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Step 5: Update hybrid_knowledge_search RPC to use vector(768)
CREATE OR REPLACE FUNCTION hybrid_knowledge_search(
  query_embedding vector(768),
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  question text,
  answer text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    alr.id,
    alr.question,
    alr.answer,
    1 - (alr.embedding <=> query_embedding) AS similarity
  FROM ai_learned_responses alr
  WHERE alr.embedding IS NOT NULL AND query_embedding IS NOT NULL
  ORDER BY alr.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
