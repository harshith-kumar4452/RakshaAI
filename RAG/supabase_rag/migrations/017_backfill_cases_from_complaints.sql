-- Migration 017: Backfill cases fields from complaints after trigger/RLS failures

BEGIN;

UPDATE cases c
SET
  description = COALESCE(NULLIF(c.description, ''), cmp.description),
  incident_types = CASE
    WHEN c.incident_types IS NULL OR cardinality(c.incident_types) = 0 THEN COALESCE(cmp.incident_types, '{}'::text[])
    ELSE c.incident_types
  END,
  incident_date = COALESCE(c.incident_date, cmp.incident_date),
  location_general = COALESCE(c.location_general, cmp.location_general),
  location_detail = COALESCE(c.location_detail, cmp.location_detail),
  is_ongoing = COALESCE(c.is_ongoing, cmp.is_ongoing),
  relationship_to_accused = COALESCE(c.relationship_to_accused, cmp.relationship_to_accused),
  frequency = COALESCE(c.frequency, cmp.frequency),
  has_witnesses = COALESCE(c.has_witnesses, cmp.has_witnesses),
  witness_description = COALESCE(c.witness_description, cmp.witness_description),
  has_evidence = COALESCE(c.has_evidence, cmp.has_evidence),
  reported_before = COALESCE(c.reported_before, cmp.reported_before),
  reported_to = COALESCE(c.reported_to, cmp.reported_to),
  accused_role = COALESCE(c.accused_role, cmp.accused_role),
  accused_name = COALESCE(c.accused_name, cmp.accused_name),
  severity = COALESCE(c.severity, cmp.severity),
  urgency = COALESCE(c.urgency, cmp.urgency),
  emotion_score = COALESCE(c.emotion_score, cmp.emotion_score),
  credibility_score = COALESCE(c.credibility_score, cmp.credibility_score),
  summary = COALESCE(c.summary, cmp.summary),
  exaggeration_flags = CASE
    WHEN c.exaggeration_flags IS NULL OR cardinality(c.exaggeration_flags) = 0 THEN cmp.exaggeration_flags
    ELSE c.exaggeration_flags
  END,
  routed_to = COALESCE(c.routed_to, cmp.routed_to),
  timeline = CASE
    WHEN c.timeline IS NULL OR c.timeline = '[]'::jsonb THEN COALESCE(cmp.timeline, '[]'::jsonb)
    ELSE c.timeline
  END,
  updated_at = NOW()
FROM complaints cmp
WHERE c.id = cmp.id;

COMMIT;
