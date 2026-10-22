-- Migration 011: Align cases table with complaints flow and migrate data
-- Safe to run multiple times.

BEGIN;

-- 1) Ensure act_routing_config exists and is seeded idempotently
CREATE TABLE IF NOT EXISTS act_routing_config (
  act_code TEXT PRIMARY KEY,
  config JSONB,
  created_at TIMESTAMP DEFAULT now()
);

INSERT INTO act_routing_config (act_code, config)
VALUES
(
  'POSH',
  '{
    "levels": [
      { "priority": "low", "authority": "ICC", "level": 1, "days": 7, "escalate_to": "Employer" },
      { "priority": "medium", "authority": "ICC Inquiry", "level": 2, "days": 15, "escalate_to": "Local Committee" },
      { "priority": "high", "authority": "Employer + ICC", "level": 3, "days": 30, "escalate_to": "Police" },
      { "priority": "critical", "authority": "Police", "level": 4, "days": 1, "escalate_to": null }
    ]
  }'::jsonb
),
(
  'POCSO',
  '{
    "levels": [
      { "priority": "low", "authority": "Police", "level": 1, "days": 1, "escalate_to": "SJPU" },
      { "priority": "medium", "authority": "SJPU", "level": 2, "days": 3, "escalate_to": "CWC" },
      { "priority": "high", "authority": "CWC", "level": 3, "days": 7, "escalate_to": "Special Court" },
      { "priority": "critical", "authority": "Special Court", "level": 4, "days": 1, "escalate_to": null }
    ]
  }'::jsonb
),
(
  'IT',
  '{
    "levels": [
      { "priority": "low", "authority": "HR + IT Admin", "level": 1, "days": 5, "escalate_to": "Cyber Cell" },
      { "priority": "medium", "authority": "Cyber Cell", "level": 2, "days": 10, "escalate_to": "Cyber Police" },
      { "priority": "high", "authority": "Cyber Police", "level": 3, "days": 15, "escalate_to": "CERT-IN" },
      { "priority": "critical", "authority": "CERT-IN", "level": 4, "days": 2, "escalate_to": null }
    ]
  }'::jsonb
),
(
  'BNS',
  '{
    "levels": [
      { "priority": "low", "authority": "HR", "level": 1, "days": 7, "escalate_to": "Police" },
      { "priority": "medium", "authority": "Police Complaint", "level": 2, "days": 10, "escalate_to": "FIR" },
      { "priority": "high", "authority": "FIR", "level": 3, "days": 30, "escalate_to": "Magistrate" },
      { "priority": "critical", "authority": "Court", "level": 4, "days": 1, "escalate_to": null }
    ]
  }'::jsonb
)
ON CONFLICT (act_code)
DO UPDATE SET config = EXCLUDED.config;

-- 2) Align cases columns with complaints model
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS token TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS incident_types TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS incident_date DATE,
  ADD COLUMN IF NOT EXISTS location_general TEXT,
  ADD COLUMN IF NOT EXISTS is_ongoing BOOLEAN,
  ADD COLUMN IF NOT EXISTS relationship_to_accused TEXT,
  ADD COLUMN IF NOT EXISTS frequency TEXT,
  ADD COLUMN IF NOT EXISTS has_witnesses BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS witness_description TEXT,
  ADD COLUMN IF NOT EXISTS has_evidence BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_urls TEXT[],
  ADD COLUMN IF NOT EXISTS location_detail TEXT,
  ADD COLUMN IF NOT EXISTS reported_before BOOLEAN,
  ADD COLUMN IF NOT EXISTS reported_to TEXT,
  ADD COLUMN IF NOT EXISTS accused_role TEXT,
  ADD COLUMN IF NOT EXISTS priority_score INTEGER,
  ADD COLUMN IF NOT EXISTS routed_to TEXT,
  ADD COLUMN IF NOT EXISTS accused_name TEXT,
  ADD COLUMN IF NOT EXISTS emotion_score NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS credibility_score NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS severity INTEGER,
  ADD COLUMN IF NOT EXISTS urgency TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS exaggeration_flags TEXT[],
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS victim_name TEXT,
  ADD COLUMN IF NOT EXISTS victim_role TEXT,
  ADD COLUMN IF NOT EXISTS timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_to TEXT;

-- 3) Relax old not-null requirements that block complaint-driven inserts
ALTER TABLE cases ALTER COLUMN token_secret_hash DROP NOT NULL;
ALTER TABLE cases ALTER COLUMN phone_hash DROP NOT NULL;

-- 4) Normalize victim_type values and accepted domain
UPDATE cases
SET victim_type = 'normal'
WHERE victim_type = 'with_identity';

ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_victim_type_check;
ALTER TABLE cases ADD CONSTRAINT cases_victim_type_check
CHECK (victim_type IN ('anonymous', 'normal', 'with_identity'));

-- 5) Update status domain to requested values
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'cases'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE cases DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE cases ALTER COLUMN status SET DEFAULT 'submitted';
ALTER TABLE cases ADD CONSTRAINT cases_status_check
CHECK (status IN ('submitted', 'assigned', 'in_progress', 'escalated', 'resolved', 'closed'));

-- 6) Add escalation target domain based on act_routing_config values
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'cases'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%escalated_to%'
  LOOP
    EXECUTE format('ALTER TABLE cases DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE cases ADD CONSTRAINT cases_escalated_to_check
CHECK (
  escalated_to IS NULL OR escalated_to IN (
    'Employer',
    'Local Committee',
    'Police',
    'SJPU',
    'CWC',
    'Special Court',
    'Cyber Cell',
    'Cyber Police',
    'CERT-IN',
    'FIR',
    'Magistrate',
    'Court'
  )
);

-- 7) Drop columns not needed in complaint-first case model
DROP VIEW IF EXISTS analytics_incident_trends;

ALTER TABLE cases
  DROP COLUMN IF EXISTS reporter_user_id,
  DROP COLUMN IF EXISTS voice_note_path,
  DROP COLUMN IF EXISTS voice_transcript,
  DROP COLUMN IF EXISTS complaint_text_redacted,
  DROP COLUMN IF EXISTS complaint_scope,
  DROP COLUMN IF EXISTS triage_category,
  DROP COLUMN IF EXISTS triage_severity,
  DROP COLUMN IF EXISTS triage_urgency,
  DROP COLUMN IF EXISTS recommended_authority,
  DROP COLUMN IF EXISTS triage_summary,
  DROP COLUMN IF EXISTS legal_citations,
  DROP COLUMN IF EXISTS power_imbalance_score,
  DROP COLUMN IF EXISTS pocso_flagged,
  DROP COLUMN IF EXISTS involves_minor,
  DROP COLUMN IF EXISTS aadhar_verified,
  DROP COLUMN IF EXISTS aadhar_vault_ref;

-- 8) Update dependent views/functions to new status list
CREATE VIEW analytics_incident_trends AS
SELECT
  org_id,
  DATE_TRUNC('month', created_at) AS month,
  COALESCE(incident_types[1], 'other') AS triage_category,
  urgency AS triage_urgency,
  COUNT(*) AS incident_count,
  AVG(credibility_score::float) AS avg_credibility,
  AVG(severity::float) AS avg_severity
FROM cases
GROUP BY org_id, month, COALESCE(incident_types[1], 'other'), urgency;

DROP VIEW IF EXISTS sla_alerts;
CREATE VIEW sla_alerts AS
SELECT
  id AS case_id,
  org_id,
  status,
  sla_deadline,
  sla_breached,
  EXTRACT(DAY FROM (sla_deadline - NOW())) AS days_remaining
FROM cases
WHERE sla_start_date IS NOT NULL
  AND status NOT IN ('resolved', 'closed');

CREATE OR REPLACE FUNCTION manage_sla()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sla_start_date IS NOT NULL THEN
    NEW.sla_deadline = NEW.sla_start_date + INTERVAL '90 days';
  END IF;

  IF NEW.sla_deadline IS NOT NULL
     AND NEW.sla_deadline < NOW()
     AND NEW.status NOT IN ('resolved', 'closed') THEN
    NEW.sla_breached = TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9) Move complaints into cases (all inserted as submitted)
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
SELECT
  c.id,
  c.org_id,
  c.token,
  c.token,
  c.token_secret_hash,
  c.phone_hash,
  CASE WHEN COALESCE(c.is_anonymous, true) THEN 'anonymous' ELSE 'normal' END,
  c.description,
  COALESCE(c.incident_types, '{}'::text[]),
  c.incident_date,
  c.location_general,
  c.is_ongoing,
  c.relationship_to_accused,
  c.frequency,
  COALESCE(c.has_witnesses, false),
  c.witness_description,
  COALESCE(c.has_evidence, false),
  c.evidence_urls,
  c.location_detail,
  c.reported_before,
  c.reported_to,
  c.accused_role,
  'submitted',
  c.priority_score,
  c.routed_to,
  c.sla_deadline,
  c.created_at,
  c.updated_at,
  COALESCE(c.submitted_at, c.updated_at, c.created_at),
  c.accused_name,
  CASE WHEN c.emotion_score IS NULL THEN NULL ELSE c.emotion_score::numeric(3,2) END,
  CASE WHEN c.credibility_score IS NULL THEN NULL ELSE c.credibility_score::numeric(3,2) END,
  c.severity,
  c.urgency,
  c.summary,
  c.exaggeration_flags,
  c.phone_number,
  COALESCE(c.is_anonymous, true),
  c.victim_name,
  c.victim_role,
  COALESCE(c.timeline, '[]'::jsonb),
  NULL
FROM complaints c
ON CONFLICT (id) DO UPDATE
SET
  org_id = EXCLUDED.org_id,
  token_public = EXCLUDED.token_public,
  token = EXCLUDED.token,
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
  status = 'submitted',
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
  timeline = EXCLUDED.timeline,
  escalated_to = EXCLUDED.escalated_to;

-- 10) Link complaints to migrated cases
UPDATE complaints
SET case_id = id
WHERE case_id IS NULL;

-- 11) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_cases_token ON cases(token);
CREATE INDEX IF NOT EXISTS idx_cases_phone_number ON cases(phone_number);
CREATE INDEX IF NOT EXISTS idx_cases_routed_to ON cases(routed_to);
CREATE INDEX IF NOT EXISTS idx_cases_escalated_to ON cases(escalated_to);
CREATE INDEX IF NOT EXISTS idx_cases_incident_types ON cases USING gin (incident_types);
CREATE INDEX IF NOT EXISTS idx_cases_timeline ON cases USING gin (timeline);

COMMIT;
