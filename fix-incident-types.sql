-- Fix: Remove NOT NULL constraint from incident_types
-- This field is only populated AFTER AI triage completes

ALTER TABLE complaints
  ALTER COLUMN incident_types DROP NOT NULL;

-- Optionally set default to empty array
ALTER TABLE complaints
  ALTER COLUMN incident_types SET DEFAULT '{}';
