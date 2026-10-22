-- Migration 016: Fix cases insert failures due to legacy case_events triggers

BEGIN;

-- If legacy event triggers exist but case_events was removed, inserts into cases fail.
-- Remove those triggers/functions; status tracking now uses case_status_history.
DROP TRIGGER IF EXISTS log_new_case_creation ON cases;
DROP TRIGGER IF EXISTS log_case_status_changes ON cases;

-- Assignment trigger also depends on case_events in legacy schema.
DROP TRIGGER IF EXISTS log_case_assignment_changes ON case_assignments;

-- Drop helper functions tied to legacy event logging.
DROP FUNCTION IF EXISTS auto_log_case_creation();
DROP FUNCTION IF EXISTS auto_log_status_change();
DROP FUNCTION IF EXISTS log_case_event(UUID, TEXT, JSONB, UUID, TEXT, TEXT);

COMMIT;
