-- ============================================================
-- 20260717000000_image_embeddings.sql
-- product_embeddings table, HNSW index, and match RPC function
-- ============================================================

-- Ensure vector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Table for storing image embeddings (768 dimensions for Gemini-embedding-2 / text-embedding-004)
CREATE TABLE IF NOT EXISTS product_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    embedding vector(768) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add an HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_product_embeddings_hnsw
    ON product_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- RPC function to find the best matching products for an image
-- Uses <#> (negative inner product) or <=> (cosine distance). We use <=> for cosine distance.
-- Cosine distance = 1 - cosine similarity. 
-- So similarity = 1 - distance.
CREATE OR REPLACE FUNCTION match_product_by_image(
    query_embedding vector(768),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    product_id UUID,
    similarity float
)
LANGUAGE sql STABLE AS $$
    SELECT
        product_id,
        1 - (embedding <=> query_embedding) AS similarity
    FROM product_embeddings
    WHERE 1 - (embedding <=> query_embedding) > match_threshold
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;
