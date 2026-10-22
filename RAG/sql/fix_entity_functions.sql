-- ============================================================================
-- FIX: get_all_entities() and get_relationship_stats() functions
-- Run this to fix the syntax errors
-- ============================================================================

-- Get all unique entities in database (FIXED)
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
    all_sections[1:5] as sample_sections  -- Slice AFTER aggregation
  FROM entity_counts
  ORDER BY occurrence_count DESC;
$$;

-- Get relationship statistics (FIXED)
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
    ) as sample_pairs  -- Take first 5 manually
  FROM rel_counts
  ORDER BY count DESC;
$$;

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'Fixed SQL functions:';
  RAISE NOTICE '  - get_all_entities() (fixed array slicing)';
  RAISE NOTICE '  - get_relationship_stats() (fixed JSONB slicing)';
  RAISE NOTICE '';
  RAISE NOTICE 'Test with:';
  RAISE NOTICE '  SELECT * FROM get_all_entities() LIMIT 10;';
  RAISE NOTICE '  SELECT * FROM get_relationship_stats();';
END $$;
