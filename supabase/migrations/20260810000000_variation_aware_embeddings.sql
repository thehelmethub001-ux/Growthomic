-- 20260810000000_variation_aware_embeddings.sql

ALTER TABLE product_embeddings ADD COLUMN IF NOT EXISTS variation_woo_id INT;
ALTER TABLE product_embeddings ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE OR REPLACE FUNCTION match_product_by_image(
    query_embedding vector(768),
    match_threshold float,
    match_count int
)
RETURNS TABLE (product_id UUID, variation_woo_id INT, similarity float)
LANGUAGE sql STABLE AS $$
    SELECT product_id, variation_woo_id, 1 - (embedding <=> query_embedding) AS similarity
    FROM product_embeddings
    WHERE 1 - (embedding <=> query_embedding) > match_threshold
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;

-- Also commit the ALREADY-LIVE `variations` column into version control 
-- (safe no-op if it exists, prevents schema drift on fresh deploys):
ALTER TABLE products ADD COLUMN IF NOT EXISTS variations JSONB NOT NULL DEFAULT '[]';
