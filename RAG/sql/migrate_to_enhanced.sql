-- ============================================================================
-- Migration Script: Upgrade Existing legal_chunks to Enhanced Schema
-- Run this in Supabase SQL Editor if you already have data
-- ============================================================================

-- Enable required extensions
create extension if not exists vector;
create extension if not exists pg_trgm;  -- For fuzzy text search

-- ============================================================================
-- Step 1: Add new columns to existing table
-- ============================================================================

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'legal_chunks' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE legal_chunks ADD COLUMN updated_at timestamptz default now();
    RAISE NOTICE 'Added updated_at column';
  ELSE
    RAISE NOTICE 'updated_at column already exists';
  END IF;
END $$;

-- Add content_tsv column if it doesn't exist
-- Note: We can't use GENERATED ALWAYS in ALTER TABLE, so we do it in two steps
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'legal_chunks' AND column_name = 'content_tsv'
  ) THEN
    -- Add as regular column first
    ALTER TABLE legal_chunks ADD COLUMN content_tsv tsvector;
    RAISE NOTICE 'Added content_tsv column';

    -- Populate it with initial data
    UPDATE legal_chunks SET content_tsv =
      setweight(to_tsvector('english', coalesce(section_title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(chunk_text, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(act_name, '')), 'C');
    RAISE NOTICE 'Populated content_tsv with existing data';
  ELSE
    RAISE NOTICE 'content_tsv column already exists';
  END IF;
END $$;

-- ============================================================================
-- Step 2: Create trigger to auto-update content_tsv on INSERT/UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION update_content_tsv()
RETURNS TRIGGER AS $$
BEGIN
  NEW.content_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.section_title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.chunk_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.act_name, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_legal_chunks_content_tsv ON legal_chunks;
CREATE TRIGGER update_legal_chunks_content_tsv
  BEFORE INSERT OR UPDATE ON legal_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_content_tsv();

-- ============================================================================
-- Step 3: Create trigger for updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_legal_chunks_updated_at ON legal_chunks;
CREATE TRIGGER update_legal_chunks_updated_at
  BEFORE UPDATE ON legal_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Step 4: Create/Update Indexes
-- ============================================================================

-- Unique constraint (should already exist)
CREATE UNIQUE INDEX IF NOT EXISTS legal_chunks_act_section_unique
  ON legal_chunks (act_name, section_num);

-- Vector similarity index (should already exist)
CREATE INDEX IF NOT EXISTS legal_chunks_embedding_idx
  ON legal_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search index (NEW)
CREATE INDEX IF NOT EXISTS legal_chunks_content_tsv_idx
  ON legal_chunks USING gin (content_tsv);

-- JSONB GIN index (NEW)
CREATE INDEX IF NOT EXISTS legal_chunks_metadata_idx
  ON legal_chunks USING gin (metadata jsonb_path_ops);

-- Category filter index (NEW)
CREATE INDEX IF NOT EXISTS legal_chunks_category_idx
  ON legal_chunks ((metadata->'classification'->>'category'));

-- Act name index (NEW)
CREATE INDEX IF NOT EXISTS legal_chunks_act_name_idx
  ON legal_chunks (act_name);

-- Trigram index for fuzzy search (NEW)
CREATE INDEX IF NOT EXISTS legal_chunks_section_title_trgm_idx
  ON legal_chunks USING gin (section_title gin_trgm_ops);

-- ============================================================================
-- Step 5: Hybrid Search Function (BM25 + Vector)
-- ============================================================================

CREATE OR REPLACE FUNCTION hybrid_search_legal_sections(
  query_text         text,
  query_embedding    vector(768),
  match_count        int default 10,
  filter_act         text default null,
  filter_category    text default null,
  vector_weight      float default 0.5,
  min_similarity     float default 0.0
)
RETURNS TABLE(
  id              uuid,
  act_name        text,
  section_num     text,
  section_title   text,
  chunk_text      text,
  hybrid_score    float,
  vector_score    float,
  bm25_score      float,
  category        text
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  WITH vector_search AS (
    SELECT
      lc.id,
      lc.act_name,
      lc.section_num,
      lc.section_title,
      lc.chunk_text,
      lc.metadata->'classification'->>'category' as category,
      1 - (lc.embedding <=> query_embedding) as similarity
    FROM legal_chunks lc
    WHERE
      (filter_act IS NULL OR lc.act_name = filter_act)
      AND (filter_category IS NULL OR lc.metadata->'classification'->>'category' = filter_category)
      AND lc.embedding IS NOT NULL
  ),
  bm25_search AS (
    SELECT
      lc.id,
      ts_rank_cd(lc.content_tsv, websearch_to_tsquery('english', query_text)) as rank
    FROM legal_chunks lc
    WHERE
      lc.content_tsv @@ websearch_to_tsquery('english', query_text)
      AND (filter_act IS NULL OR lc.act_name = filter_act)
      AND (filter_category IS NULL OR lc.metadata->'classification'->>'category' = filter_category)
  ),
  combined AS (
    SELECT
      COALESCE(v.id, b.id) as id,
      v.act_name,
      v.section_num,
      v.section_title,
      v.chunk_text,
      v.category,
      COALESCE(v.similarity, 0.0) as vector_score,
      COALESCE(b.rank, 0.0) as bm25_score,
      (COALESCE(v.similarity, 0.0) * vector_weight +
       COALESCE(b.rank, 0.0) * (1.0 - vector_weight)) as hybrid_score
    FROM vector_search v
    FULL OUTER JOIN bm25_search b ON v.id = b.id
  )
  SELECT
    c.id,
    c.act_name,
    c.section_num,
    c.section_title,
    c.chunk_text,
    c.hybrid_score,
    c.vector_score,
    c.bm25_score,
    c.category
  FROM combined c
  WHERE c.hybrid_score >= min_similarity
  ORDER BY c.hybrid_score DESC
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- Step 6: Pure BM25 Keyword Search
-- ============================================================================

CREATE OR REPLACE FUNCTION keyword_search_legal_sections(
  query_text      text,
  match_count     int default 10,
  filter_act      text default null,
  filter_category text default null
)
RETURNS TABLE(
  id              uuid,
  act_name        text,
  section_num     text,
  section_title   text,
  chunk_text      text,
  rank            float,
  headline        text
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    act_name,
    section_num,
    section_title,
    chunk_text,
    ts_rank_cd(content_tsv, websearch_to_tsquery('english', query_text)) as rank,
    ts_headline('english', chunk_text, websearch_to_tsquery('english', query_text),
                'MaxWords=50, MinWords=25, StartSel=<mark>, StopSel=</mark>') as headline
  FROM legal_chunks
  WHERE
    content_tsv @@ websearch_to_tsquery('english', query_text)
    AND (filter_act IS NULL OR act_name = filter_act)
    AND (filter_category IS NULL OR metadata->'classification'->>'category' = filter_category)
  ORDER BY rank DESC
  LIMIT match_count;
$$;

-- ============================================================================
-- Step 7: Vector-Only Search (backward compatible)
-- ============================================================================

CREATE OR REPLACE FUNCTION match_legal_sections(
  query_embedding vector(768),
  match_count     int default 5,
  filter_act      text default null
)
RETURNS TABLE(
  id            uuid,
  act_name      text,
  section_num   text,
  section_title text,
  chunk_text    text,
  similarity    float
)
LANGUAGE sql STABLE AS $$
  SELECT id, act_name, section_num, section_title, chunk_text,
         1 - (embedding <=> query_embedding) as similarity
  FROM legal_chunks
  WHERE (filter_act IS NULL OR act_name = filter_act)
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================================================
-- Step 8: Metadata Query Helpers
-- ============================================================================

CREATE OR REPLACE FUNCTION find_by_severity(
  severity_level  text,
  match_count     int default 10
)
RETURNS TABLE(
  id              uuid,
  act_name        text,
  section_num     text,
  section_title   text,
  severity        text
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    act_name,
    section_num,
    section_title,
    metadata->'classification'->>'severity' as severity
  FROM legal_chunks
  WHERE metadata->'classification'->>'severity' = severity_level
  ORDER BY created_at DESC
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION find_mandatory_reporting_sections()
RETURNS TABLE(
  id              uuid,
  act_name        text,
  section_num     text,
  section_title   text,
  category        text
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    act_name,
    section_num,
    section_title,
    metadata->'classification'->>'category' as category
  FROM legal_chunks
  WHERE (metadata->'classification'->>'mandatory_reporting')::boolean = true
  ORDER BY act_name, section_num;
$$;

CREATE OR REPLACE FUNCTION get_entity_stats()
RETURNS TABLE(
  entity_label    text,
  entity_count    bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    entity->>'label' as entity_label,
    count(*) as entity_count
  FROM legal_chunks,
    jsonb_array_elements(metadata->'entities') as entity
  GROUP BY entity->>'label'
  ORDER BY entity_count DESC;
$$;

-- ============================================================================
-- Step 9: Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Columns added:';
  RAISE NOTICE '  - content_tsv (tsvector for BM25 search)';
  RAISE NOTICE '  - updated_at (timestamp)';
  RAISE NOTICE '';
  RAISE NOTICE 'Indexes created:';
  RAISE NOTICE '  - legal_chunks_content_tsv_idx (GIN)';
  RAISE NOTICE '  - legal_chunks_metadata_idx (GIN)';
  RAISE NOTICE '  - legal_chunks_category_idx (B-tree)';
  RAISE NOTICE '  - legal_chunks_act_name_idx (B-tree)';
  RAISE NOTICE '  - legal_chunks_section_title_trgm_idx (GIN)';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '  - hybrid_search_legal_sections()';
  RAISE NOTICE '  - keyword_search_legal_sections()';
  RAISE NOTICE '  - match_legal_sections() [updated]';
  RAISE NOTICE '  - find_by_severity()';
  RAISE NOTICE '  - find_mandatory_reporting_sections()';
  RAISE NOTICE '  - get_entity_stats()';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Re-ingest data to populate rich metadata';
  RAISE NOTICE '  2. Test hybrid search with code examples';
  RAISE NOTICE '  3. Check ENHANCED_RAG_GUIDE.md for usage';
  RAISE NOTICE '============================================';
END $$;

-- ============================================================================
-- End of Migration
-- ============================================================================
