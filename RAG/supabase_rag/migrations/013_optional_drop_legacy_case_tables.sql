-- Migration 013 (Optional): Drop legacy case-support tables not used by current app APIs
-- Run ONLY if you are sure you do not need these modules.

BEGIN;

-- Safety snapshot: check row counts before dropping
-- Keep this query result for audit.
SELECT 'case_sensitive_identity' AS table_name, COUNT(*) AS row_count FROM case_sensitive_identity
UNION ALL SELECT 'case_triage', COUNT(*) FROM case_triage
UNION ALL SELECT 'case_followups', COUNT(*) FROM case_followups
UNION ALL SELECT 'case_events', COUNT(*) FROM case_events
UNION ALL SELECT 'case_assignments', COUNT(*) FROM case_assignments
UNION ALL SELECT 'case_messages', COUNT(*) FROM case_messages
UNION ALL SELECT 'case_notes', COUNT(*) FROM case_notes
UNION ALL SELECT 'evidence', COUNT(*) FROM evidence
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs
UNION ALL SELECT 'compliance_reports', COUNT(*) FROM compliance_reports;

-- Drop helper functions tied to removed tables/token-pair flow
DROP FUNCTION IF EXISTS log_case_event(UUID, TEXT, JSONB, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS get_case_status_for_victim(TEXT, TEXT);
DROP FUNCTION IF EXISTS auto_log_case_creation();
DROP FUNCTION IF EXISTS auto_log_status_change();
DROP FUNCTION IF EXISTS verify_token_pair(TEXT, TEXT);
DROP FUNCTION IF EXISTS hash_secret_token(TEXT);
DROP FUNCTION IF EXISTS generate_secret_token();
DROP FUNCTION IF EXISTS generate_public_token();
DROP FUNCTION IF EXISTS hash_phone(TEXT);

-- Drop triggers tied to removed helper functions
DROP TRIGGER IF EXISTS log_new_case_creation ON cases;
DROP TRIGGER IF EXISTS log_case_status_changes ON cases;
DROP TRIGGER IF EXISTS log_case_assignment_changes ON case_assignments;
DROP TRIGGER IF EXISTS auto_suggest_followups ON case_triage;

-- Drop tables no longer required by current complaint-first flow
-- CASCADE is used because many policy objects/functions may still depend on these tables.
DROP TABLE IF EXISTS case_sensitive_identity CASCADE;
DROP TABLE IF EXISTS case_triage CASCADE;
DROP TABLE IF EXISTS case_followups CASCADE;
DROP TABLE IF EXISTS case_events CASCADE;
DROP TABLE IF EXISTS case_assignments CASCADE;
DROP TABLE IF EXISTS case_messages CASCADE;
DROP TABLE IF EXISTS case_notes CASCADE;
DROP TABLE IF EXISTS evidence CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS compliance_reports CASCADE;

COMMIT;
