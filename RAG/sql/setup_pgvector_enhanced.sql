-- ============================================================================
-- Enhanced Supabase Schema for JustRAG
-- Features: pgvector + BM25 hybrid search + rich metadata
-- ============================================================================

-- Enable required extensions
create extension if not exists vector;
create extension if not exists pg_trgm;  -- For fuzzy text search

-- ============================================================================
-- Main Table: legal_chunks
-- ============================================================================

create table if not exists legal_chunks (
  id              uuid primary key default gen_random_uuid(),

  -- Document identifiers
  act_name        text not null,
  section_num     text,
  section_title   text,

  -- Content
  chunk_text      text not null,
  chunk_index     integer,

  -- Full-text search (for BM25-style keyword search)
  content_tsv     tsvector generated always as (
    setweight(to_tsvector('english', coalesce(section_title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(chunk_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(act_name, '')), 'C')
  ) stored,

  -- Embeddings for semantic search
  embedding       vector(768),

  -- Rich metadata schema (JSONB for flexibility + indexing)
  metadata        jsonb default '{}'::jsonb,

  -- Timestamps
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================================
-- Metadata Schema Structure (stored in metadata JSONB field)
-- ============================================================================

-- Example metadata structure:
-- {
--   "extraction": {
--     "model": "qwen2.5:1.5b",
--     "timestamp": "2026-03-23T10:30:00Z",
--     "confidence": 0.85,
--     "extraction_time_ms": 2340
--   },
--   "classification": {
--     "category": "sexual_harassment" | "cybercrime" | "minor_protection" | "workplace" | "general",
--     "severity": "low" | "medium" | "high" | "critical",
--     "keywords": ["harassment", "stalking", "workplace"],
--     "jurisdiction": "criminal" | "civil" | "administrative",
--     "age_restricted": true | false,
--     "mandatory_reporting": true | false
--   },
--   "entities": [
--     {
--       "id": "bns_2023:sexual_harassment",
--       "label": "Offence",
--       "name": "Sexual Harassment at Workplace",
--       "confidence": 0.92,
--       "properties": {
--         "severity": "high",
--         "cognizable": true,
--         "bailable": false,
--         "jurisdiction": "local_police"
--       },
--       "mentions": [
--         {
--           "text": "sexual harassment",
--           "start_char": 45,
--           "end_char": 62
--         }
--       ]
--     }
--   ],
--   "relationships": [
--     {
--       "from_id": "bns_2023:section_354a",
--       "to_id": "bns_2023:sexual_harassment",
--       "type": "DEFINES",
--       "confidence": 0.95,
--       "properties": {
--         "source_line": "Section 354A defines sexual harassment...",
--         "relationship_strength": "strong"
--       }
--     }
--   ],
--   "legal_references": {
--     "cross_references": ["Section 509 BNS", "Section 11 POSH"],
--     "supersedes": ["Section 354A IPC"],
--     "case_law": []
--   },
--   "penalties": {
--     "imprisonment_min_years": 1,
--     "imprisonment_max_years": 3,
--     "fine_min": 0,
--     "fine_max": null,
--     "description": "Imprisonment up to 3 years and fine"
--   },
--   "authorities": {
--     "primary": ["Internal Committee", "Local Commission for Women"],
--     "secondary": ["Police", "District Court"],
--     "reporting_timeline_days": 90
--   },
--   "victims": {
--     "protected_categories": ["women", "employee", "student"],
--     "age_restrictions": null,
--     "special_provisions": []
--   }
-- }

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Unique constraint for upserts
create unique index if not exists legal_chunks_act_section_unique
  on legal_chunks (act_name, section_num);

-- Vector similarity index (HNSW for fast ANN search)
create index if not exists legal_chunks_embedding_idx
  on legal_chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Full-text search index (GIN for BM25-style keyword search)
create index if not exists legal_chunks_content_tsv_idx
  on legal_chunks using gin (content_tsv);

-- JSONB GIN index for fast metadata queries
create index if not exists legal_chunks_metadata_idx
  on legal_chunks using gin (metadata jsonb_path_ops);

-- Category filter index (for common queries)
create index if not exists legal_chunks_category_idx
  on legal_chunks ((metadata->'classification'->>'category'));

-- Act name index for filtering
create index if not exists legal_chunks_act_name_idx
  on legal_chunks (act_name);

-- Trigram index for fuzzy text search (typo tolerance)
create index if not exists legal_chunks_section_title_trgm_idx
  on legal_chunks using gin (section_title gin_trgm_ops);

-- ============================================================================
-- Hybrid Search Function: BM25 + Vector Similarity
-- ============================================================================

create or replace function hybrid_search_legal_sections(
  query_text         text,
  query_embedding    vector(768),
  match_count        int default 10,
  filter_act         text default null,
  filter_category    text default null,
  vector_weight      float default 0.5,  -- 0.0 = pure BM25, 1.0 = pure vector
  min_similarity     float default 0.0
)
returns table(
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
language plpgsql stable as $$
begin
  return query
  with vector_search as (
    select
      lc.id,
      lc.act_name,
      lc.section_num,
      lc.section_title,
      lc.chunk_text,
      lc.metadata->'classification'->>'category' as category,
      1 - (lc.embedding <=> query_embedding) as similarity
    from legal_chunks lc
    where
      (filter_act is null or lc.act_name = filter_act)
      and (filter_category is null or lc.metadata->'classification'->>'category' = filter_category)
      and lc.embedding is not null
  ),
  bm25_search as (
    select
      lc.id,
      ts_rank_cd(lc.content_tsv, websearch_to_tsquery('english', query_text)) as rank
    from legal_chunks lc
    where
      lc.content_tsv @@ websearch_to_tsquery('english', query_text)
      and (filter_act is null or lc.act_name = filter_act)
      and (filter_category is null or lc.metadata->'classification'->>'category' = filter_category)
  ),
  combined as (
    select
      coalesce(v.id, b.id) as id,
      v.act_name,
      v.section_num,
      v.section_title,
      v.chunk_text,
      v.category,
      coalesce(v.similarity, 0.0) as vector_score,
      coalesce(b.rank, 0.0) as bm25_score,
      -- Hybrid score: weighted combination
      (coalesce(v.similarity, 0.0) * vector_weight +
       coalesce(b.rank, 0.0) * (1.0 - vector_weight)) as hybrid_score
    from vector_search v
    full outer join bm25_search b on v.id = b.id
  )
  select
    c.id,
    c.act_name,
    c.section_num,
    c.section_title,
    c.chunk_text,
    c.hybrid_score,
    c.vector_score,
    c.bm25_score,
    c.category
  from combined c
  where c.hybrid_score >= min_similarity
  order by c.hybrid_score desc
  limit match_count;
end;
$$;

-- ============================================================================
-- Pure BM25 Keyword Search (for exact phrase matching)
-- ============================================================================

create or replace function keyword_search_legal_sections(
  query_text      text,
  match_count     int default 10,
  filter_act      text default null,
  filter_category text default null
)
returns table(
  id              uuid,
  act_name        text,
  section_num     text,
  section_title   text,
  chunk_text      text,
  rank            float,
  headline        text
)
language sql stable as $$
  select
    id,
    act_name,
    section_num,
    section_title,
    chunk_text,
    ts_rank_cd(content_tsv, websearch_to_tsquery('english', query_text)) as rank,
    ts_headline('english', chunk_text, websearch_to_tsquery('english', query_text),
                'MaxWords=50, MinWords=25, StartSel=<mark>, StopSel=</mark>') as headline
  from legal_chunks
  where
    content_tsv @@ websearch_to_tsquery('english', query_text)
    and (filter_act is null or act_name = filter_act)
    and (filter_category is null or metadata->'classification'->>'category' = filter_category)
  order by rank desc
  limit match_count;
$$;

-- ============================================================================
-- Vector-Only Search (backward compatible)
-- ============================================================================

create or replace function match_legal_sections(
  query_embedding vector(768),
  match_count     int default 5,
  filter_act      text default null
)
returns table(
  id            uuid,
  act_name      text,
  section_num   text,
  section_title text,
  chunk_text    text,
  similarity    float
)
language sql stable as $$
  select id, act_name, section_num, section_title, chunk_text,
         1 - (embedding <=> query_embedding) as similarity
  from legal_chunks
  where (filter_act is null or act_name = filter_act)
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================================
-- Metadata Query Helpers
-- ============================================================================

-- Find sections by severity
create or replace function find_by_severity(
  severity_level  text,  -- 'low', 'medium', 'high', 'critical'
  match_count     int default 10
)
returns table(
  id              uuid,
  act_name        text,
  section_num     text,
  section_title   text,
  severity        text
)
language sql stable as $$
  select
    id,
    act_name,
    section_num,
    section_title,
    metadata->'classification'->>'severity' as severity
  from legal_chunks
  where metadata->'classification'->>'severity' = severity_level
  order by created_at desc
  limit match_count;
$$;

-- Find sections with mandatory reporting
create or replace function find_mandatory_reporting_sections()
returns table(
  id              uuid,
  act_name        text,
  section_num     text,
  section_title   text,
  category        text
)
language sql stable as $$
  select
    id,
    act_name,
    section_num,
    section_title,
    metadata->'classification'->>'category' as category
  from legal_chunks
  where (metadata->'classification'->>'mandatory_reporting')::boolean = true
  order by act_name, section_num;
$$;

-- Get entity statistics
create or replace function get_entity_stats()
returns table(
  entity_label    text,
  entity_count    bigint
)
language sql stable as $$
  select
    entity->>'label' as entity_label,
    count(*) as entity_count
  from legal_chunks,
    jsonb_array_elements(metadata->'entities') as entity
  group by entity->>'label'
  order by entity_count desc;
$$;

-- ============================================================================
-- Update Trigger (for updated_at timestamp)
-- ============================================================================

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_legal_chunks_updated_at
  before update on legal_chunks
  for each row
  execute function update_updated_at_column();

-- ============================================================================
-- Sample Queries to Test
-- ============================================================================

-- Example 1: Hybrid search (60% vector, 40% BM25)
-- select * from hybrid_search_legal_sections(
--   'sexual harassment at workplace',
--   (select embedding from legal_chunks limit 1),  -- Replace with actual query embedding
--   10,
--   null,
--   null,
--   0.6
-- );

-- Example 2: BM25-only search
-- select * from keyword_search_legal_sections('stalking cybercrime', 5);

-- Example 3: Find high-severity offenses
-- select * from find_by_severity('high', 10);

-- Example 4: Get entity statistics
-- select * from get_entity_stats();

-- ============================================================================
-- End of Enhanced Schema
-- ============================================================================
