-- ai_learned_responses table for Human-in-the-Loop learning
CREATE TABLE ai_learned_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  embedding   vector(1536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create HNSW index for fast vector search on learned responses
CREATE INDEX ON ai_learned_responses USING hnsw (embedding vector_cosine_ops);

-- Create an RPC function to perform hybrid search on learned responses
CREATE OR REPLACE FUNCTION search_learned_responses(
  query_embedding vector(1536),
  match_count int DEFAULT 3
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
  ORDER BY alr.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
