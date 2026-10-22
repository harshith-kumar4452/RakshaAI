-- ============================================================================
-- Complete Entity Columns Setup (Fixed Version)
-- Run this INSTEAD of add_entity_columns.sql if you haven't run it yet
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- Step 1: Add new columns to existing table
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'legal_chunks' AND column_name = 'entity_names'
  ) THEN
    ALTER TABLE legal_chunks ADD COLUMN entity_names text[];
    RAISE NOTICE 'Added entity_names column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'legal_chunks' AND column_name = 'entity_types'
  ) THEN
    ALTER TABLE legal_chunks ADD COLUMN entity_types text[];
    RAISE NOTICE 'Added entity_types column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'legal_chunks' AND column_name = 'relationship_types'
  ) THEN
    ALTER TABLE legal_chunks ADD COLUMN relationship_types text[];
    RAISE NOTICE 'Added relationship_types column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'legal_chunks' AND column_name = 'entities_full'
  ) THEN
    ALTER TABLE legal_chunks ADD COLUMN entities_full jsonb default '[]'::jsonb;
    RAISE NOTICE 'Added entities_full column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'legal_chunks' AND column_name = 'relationships_full'
  ) THEN
    ALTER TABLE legal_chunks ADD COLUMN relationships_full jsonb default '[]'::jsonb;
    RAISE NOTICE 'Added relationships_full column';
  END IF;
END $$;

-- ============================================================================
-- Step 2: Populate columns from existing metadata
-- ============================================================================

UPDATE legal_chunks
SET entity_names = (
  SELECT array_agg(DISTINCT entity->>'name')
  FROM jsonb_array_elements(metadata->'entities') AS entity
  WHERE entity->>'name' IS NOT NULL
)
WHERE metadata->'entities' IS NOT NULL
  AND jsonb_array_length(metadata->'entities') > 0
  AND entity_names IS NULL;

UPDATE legal_chunks
SET entity_types = (
  SELECT array_agg(DISTINCT entity->>'label')
  FROM jsonb_array_elements(metadata->'entities') AS entity
  WHERE entity->>'label' IS NOT NULL
)
WHERE metadata->'entities' IS NOT NULL
  AND jsonb_array_length(metadata->'entities') > 0
  AND entity_types IS NULL;

UPDATE legal_chunks
SET relationship_types = (
  SELECT array_agg(DISTINCT rel->>'type')
  FROM jsonb_array_elements(metadata->'relationships') AS rel
  WHERE rel->>'type' IS NOT NULL
)
WHERE metadata->'relationships' IS NOT NULL
  AND jsonb_array_length(metadata->'relationships') > 0
  AND relationship_types IS NULL;

UPDATE legal_chunks
SET entities_full = metadata->'entities'
WHERE metadata->'entities' IS NOT NULL
  AND entities_full = '[]'::jsonb;

UPDATE legal_chunks
SET relationships_full = metadata->'relationships'
WHERE metadata->'relationships' IS NOT NULL
  AND relationships_full = '[]'::jsonb;

-- ============================================================================
-- Step 3: Create indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS legal_chunks_entity_names_idx
  ON legal_chunks USING gin (entity_names);

CREATE INDEX IF NOT EXISTS legal_chunks_entity_types_idx
  ON legal_chunks USING gin (entity_types);

CREATE INDEX IF NOT EXISTS legal_chunks_relationship_types_idx
  ON legal_chunks USING gin (relationship_types);

CREATE INDEX IF NOT EXISTS legal_chunks_entities_full_idx
  ON legal_chunks USING gin (entities_full jsonb_path_ops);

CREATE INDEX IF NOT EXISTS legal_chunks_relationships_full_idx
  ON legal_chunks USING gin (relationships_full jsonb_path_ops);

-- ============================================================================
-- Step 4: Create auto-sync trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_entity_columns()
RETURNS TRIGGER AS $$
BEGIN
  NEW.entity_names := (
    SELECT array_agg(DISTINCT entity->>'name')
    FROM jsonb_array_elements(NEW.metadata->'entities') AS entity
    WHERE entity->>'name' IS NOT NULL
  );

  NEW.entity_types := (
    SELECT array_agg(DISTINCT entity->>'label')
    FROM jsonb_array_elements(NEW.metadata->'entities') AS entity
    WHERE entity->>'label' IS NOT NULL
  );

  NEW.relationship_types := (
    SELECT array_agg(DISTINCT rel->>'type')
    FROM jsonb_array_elements(NEW.metadata->'relationships') AS rel
    WHERE rel->>'type' IS NOT NULL
  );

  NEW.entities_full := NEW.metadata->'entities';
  NEW.relationships_full := NEW.metadata->'relationships';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_legal_chunks_entities ON legal_chunks;
CREATE TRIGGER sync_legal_chunks_entities
  BEFORE INSERT OR UPDATE OF metadata ON legal_chunks
  FOR EACH ROW
  EXECUTE FUNCTION sync_entity_columns();

-- ============================================================================
-- Step 5: Query Helper Functions (FIXED)
-- ============================================================================

CREATE OR REPLACE FUNCTION find_by_entity_name(
  entity_name_pattern text,
  match_count int default 10
)
RETURNS TABLE(
  id              uuid,
  act_name        text,
  section_num     text,
  section_title   text,
  matching_entities text[]
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    act_name,
    section_num,
    section_title,
    entity_names as matching_entities
  FROM legal_chunks
  WHERE entity_names @> ARRAY[entity_name_pattern]
     OR EXISTS (
       SELECT 1 FROM unnest(entity_names) AS en
       WHERE en ILIKE '%' || entity_name_pattern || '%'
     )
  ORDER BY created_at DESC
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION find_by_entity_type(
  entity_type text,
  match_count int default 10
)
RETURNS TABLE(
  id              uuid,
  act_name        text,
  section_num     text,
  section_title   text,
  entity_count    int,
  entity_names    text[]
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    act_name,
    section_num,
    section_title,
    array_length(entity_types, 1) as entity_count,
    entity_names
  FROM legal_chunks
  WHERE entity_type = ANY(entity_types)
  ORDER BY array_length(entity_types, 1) DESC, created_at DESC
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION find_by_relationship_type(
  rel_type text,
  match_count int default 10
)
RETURNS TABLE(
  id                uuid,
  act_name          text,
  section_num       text,
  section_title     text,
  relationship_count int,
  relationships     jsonb
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    act_name,
    section_num,
    section_title,
    array_length(relationship_types, 1) as relationship_count,
    relationships_full as relationships
  FROM legal_chunks
  WHERE rel_type = ANY(relationship_types)
  ORDER BY array_length(relationship_types, 1) DESC, created_at DESC
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION find_entity_connections(
  entity1_pattern text,
  entity2_pattern text,
  match_count int default 10
)
RETURNS TABLE(
  id              uuid,
  act_name        text,
  section_num     text,
  section_title   text,
  entities        text[],
  relationships   jsonb
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    act_name,
    section_num,
    section_title,
    entity_names as entities,
    relationships_full as relationships
  FROM legal_chunks
  WHERE entity_names && ARRAY[entity1_pattern]
    AND entity_names && ARRAY[entity2_pattern]
    OR (
      EXISTS (
        SELECT 1 FROM unnest(entity_names) AS en
        WHERE en ILIKE '%' || entity1_pattern || '%'
      )
      AND EXISTS (
        SELECT 1 FROM unnest(entity_names) AS en
        WHERE en ILIKE '%' || entity2_pattern || '%'
      )
    )
  ORDER BY created_at DESC
  LIMIT match_count;
$$;

-- FIXED: get_all_entities with proper array slicing
CREATE OR REPLACE FUNCTION get_all_entities()
RETURNS TABLE(
  entity_name   text,
  entity_type   text,
  occurrence_count bigint,
  sample_sections text[]
)
LANGUAGE sql STABLE AS $$
  WITH entity_data AS (
    SELECT
      entity->>'name' as name,
      entity->>'label' as type,
      act_name || ' § ' || section_num as section_ref
    FROM legal_chunks,
      jsonb_array_elements(entities_full) as entity
    WHERE entity->>'name' IS NOT NULL
  ),
  entity_counts AS (
    SELECT
      name,
      type,
      count(*) as count,
      array_agg(DISTINCT section_ref ORDER BY section_ref) as all_sections
    FROM entity_data
    GROUP BY name, type
  )
  SELECT
    name as entity_name,
    type as entity_type,
    count as occurrence_count,
    all_sections[1:5] as sample_sections
  FROM entity_counts
  ORDER BY occurrence_count DESC;
$$;

-- FIXED: get_relationship_stats with proper JSONB handling
CREATE OR REPLACE FUNCTION get_relationship_stats()
RETURNS TABLE(
  relationship_type text,
  count bigint,
  sample_pairs jsonb
)
LANGUAGE sql STABLE AS $$
  WITH rel_data AS (
    SELECT
      rel->>'type' as rel_type,
      jsonb_build_object(
        'from', rel->>'from_id',
        'to', rel->>'to_id',
        'section', section_num
      ) as pair
    FROM legal_chunks,
      jsonb_array_elements(relationships_full) as rel
    WHERE rel->>'type' IS NOT NULL
  ),
  rel_counts AS (
    SELECT
      rel_type,
      count(*) as count,
      jsonb_agg(pair ORDER BY pair->>'section') as all_pairs
    FROM rel_data
    GROUP BY rel_type
  )
  SELECT
    rel_type as relationship_type,
    count,
    jsonb_build_array(
      all_pairs->0,
      all_pairs->1,
      all_pairs->2,
      all_pairs->3,
      all_pairs->4
    ) as sample_pairs
  FROM rel_counts
  ORDER BY count DESC;
$$;

CREATE OR REPLACE FUNCTION hybrid_search_with_entities(
  query_text         text,
  query_embedding    vector(768),
  match_count        int default 10,
  filter_entity_type text default null,
  filter_entity_name text default null,
  filter_rel_type    text default null,
  vector_weight      float default 0.5
)
RETURNS TABLE(
  id              uuid,
  act_name        text,
  section_num     text,
  section_title   text,
  chunk_text      text,
  hybrid_score    float,
  entity_names    text[],
  entity_types    text[],
  relationship_types text[]
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
      lc.entity_names,
      lc.entity_types,
      lc.relationship_types,
      1 - (lc.embedding <=> query_embedding) as similarity
    FROM legal_chunks lc
    WHERE lc.embedding IS NOT NULL
      AND (filter_entity_type IS NULL OR filter_entity_type = ANY(lc.entity_types))
      AND (filter_entity_name IS NULL OR filter_entity_name = ANY(lc.entity_names))
      AND (filter_rel_type IS NULL OR filter_rel_type = ANY(lc.relationship_types))
  ),
  bm25_search AS (
    SELECT
      lc.id,
      ts_rank_cd(lc.content_tsv, websearch_to_tsquery('english', query_text)) as rank
    FROM legal_chunks lc
    WHERE lc.content_tsv @@ websearch_to_tsquery('english', query_text)
      AND (filter_entity_type IS NULL OR filter_entity_type = ANY(lc.entity_types))
      AND (filter_entity_name IS NULL OR filter_entity_name = ANY(lc.entity_names))
      AND (filter_rel_type IS NULL OR filter_rel_type = ANY(lc.relationship_types))
  ),
  combined AS (
    SELECT
      COALESCE(v.id, b.id) as id,
      v.act_name,
      v.section_num,
      v.section_title,
      v.chunk_text,
      v.entity_names,
      v.entity_types,
      v.relationship_types,
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
    c.entity_names,
    c.entity_types,
    c.relationship_types
  FROM combined c
  ORDER BY c.hybrid_score DESC
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  entity_count int;
  rel_count int;
BEGIN
  SELECT count(*) INTO entity_count FROM legal_chunks WHERE entity_names IS NOT NULL AND array_length(entity_names, 1) > 0;
  SELECT count(*) INTO rel_count FROM legal_chunks WHERE relationship_types IS NOT NULL AND array_length(relationship_types, 1) > 0;

  RAISE NOTICE '============================================';
  RAISE NOTICE 'Entity & Relationship Columns Setup Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Columns: entity_names, entity_types, relationship_types';
  RAISE NOTICE 'Indexes: 5 GIN indexes created';
  RAISE NOTICE 'Data: % chunks with entities, % with relationships', entity_count, rel_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Test queries:';
  RAISE NOTICE '  SELECT * FROM get_all_entities() LIMIT 10;';
  RAISE NOTICE '  SELECT * FROM get_relationship_stats();';
  RAISE NOTICE '  SELECT * FROM find_by_entity_type(''Offence'');';
  RAISE NOTICE '============================================';
END $$;
