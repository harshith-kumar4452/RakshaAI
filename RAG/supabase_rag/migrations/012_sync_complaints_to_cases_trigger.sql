-- Migration 012: Auto-sync complaints -> cases
-- After running this, new complaints and complaint updates are mirrored to cases.

BEGIN;

CREATE OR REPLACE FUNCTION sync_complaint_to_case()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO cases (
    id,
    org_id,
    token_public,
    token,
    token_secret_hash,
    phone_hash,
    victim_type,
    description,
    incident_types,
    incident_date,
    location_general,
    is_ongoing,
    relationship_to_accused,
    frequency,
    has_witnesses,
    witness_description,
    has_evidence,
    evidence_urls,
    location_detail,
    reported_before,
    reported_to,
    accused_role,
    status,
    priority_score,
    routed_to,
    sla_deadline,
    created_at,
    updated_at,
    submitted_at,
    accused_name,
    emotion_score,
    credibility_score,
    severity,
    urgency,
    summary,
    exaggeration_flags,
    phone_number,
    is_anonymous,
    victim_name,
    victim_role,
    timeline,
    escalated_to
  )
  VALUES (
    NEW.id,
    NEW.org_id,
    NEW.token,
    NEW.token,
    NEW.token_secret_hash,
    NEW.phone_hash,
    CASE WHEN COALESCE(NEW.is_anonymous, true) THEN 'anonymous' ELSE 'normal' END,
    NEW.description,
    COALESCE(NEW.incident_types, '{}'::text[]),
    NEW.incident_date,
    NEW.location_general,
    NEW.is_ongoing,
    NEW.relationship_to_accused,
    NEW.frequency,
    COALESCE(NEW.has_witnesses, false),
    NEW.witness_description,
    COALESCE(NEW.has_evidence, false),
    NEW.evidence_urls,
    NEW.location_detail,
    NEW.reported_before,
    NEW.reported_to,
    NEW.accused_role,
    'submitted',
    NEW.priority_score,
    NEW.routed_to,
    NEW.sla_deadline,
    NEW.created_at,
    NEW.updated_at,
    COALESCE(NEW.submitted_at, NEW.updated_at, NEW.created_at),
    NEW.accused_name,
    CASE WHEN NEW.emotion_score IS NULL THEN NULL ELSE NEW.emotion_score::numeric(3,2) END,
    CASE WHEN NEW.credibility_score IS NULL THEN NULL ELSE NEW.credibility_score::numeric(3,2) END,
    NEW.severity,
    NEW.urgency,
    NEW.summary,
    NEW.exaggeration_flags,
    NEW.phone_number,
    COALESCE(NEW.is_anonymous, true),
    NEW.victim_name,
    NEW.victim_role,
    COALESCE(NEW.timeline, '[]'::jsonb),
    NULL
  )
  ON CONFLICT (id) DO UPDATE
  SET
    org_id = EXCLUDED.org_id,
    token_public = EXCLUDED.token_public,
    token = EXCLUDED.token,
    token_secret_hash = EXCLUDED.token_secret_hash,
    phone_hash = EXCLUDED.phone_hash,
    victim_type = EXCLUDED.victim_type,
    description = EXCLUDED.description,
    incident_types = EXCLUDED.incident_types,
    incident_date = EXCLUDED.incident_date,
    location_general = EXCLUDED.location_general,
    is_ongoing = EXCLUDED.is_ongoing,
    relationship_to_accused = EXCLUDED.relationship_to_accused,
    frequency = EXCLUDED.frequency,
    has_witnesses = EXCLUDED.has_witnesses,
    witness_description = EXCLUDED.witness_description,
    has_evidence = EXCLUDED.has_evidence,
    evidence_urls = EXCLUDED.evidence_urls,
    location_detail = EXCLUDED.location_detail,
    reported_before = EXCLUDED.reported_before,
    reported_to = EXCLUDED.reported_to,
    accused_role = EXCLUDED.accused_role,
    priority_score = EXCLUDED.priority_score,
    routed_to = EXCLUDED.routed_to,
    sla_deadline = EXCLUDED.sla_deadline,
    updated_at = EXCLUDED.updated_at,
    submitted_at = EXCLUDED.submitted_at,
    accused_name = EXCLUDED.accused_name,
    emotion_score = EXCLUDED.emotion_score,
    credibility_score = EXCLUDED.credibility_score,
    severity = EXCLUDED.severity,
    urgency = EXCLUDED.urgency,
    summary = EXCLUDED.summary,
    exaggeration_flags = EXCLUDED.exaggeration_flags,
    phone_number = EXCLUDED.phone_number,
    is_anonymous = EXCLUDED.is_anonymous,
    victim_name = EXCLUDED.victim_name,
    victim_role = EXCLUDED.victim_role,
    timeline = EXCLUDED.timeline;

  NEW.case_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_complaint_to_case ON complaints;
CREATE TRIGGER trg_sync_complaint_to_case
BEFORE INSERT OR UPDATE ON complaints
FOR EACH ROW
EXECUTE FUNCTION sync_complaint_to_case();

COMMIT;
