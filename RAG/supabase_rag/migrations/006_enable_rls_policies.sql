-- Migration 006: Enable RLS and create policies

-- Enable RLS on all tables
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------
-- CASES policies
-- -----------------------------------------------

-- HR Admin: can see all cases in their org
CREATE POLICY "hr_admin_select_cases"
ON cases FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND org_id = cases.org_id
    AND role = 'hr_admin'
  )
);

CREATE POLICY "hr_admin_update_cases"
ON cases FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND org_id = cases.org_id
    AND role = 'hr_admin'
  )
);

-- -----------------------------------------------
-- CASE MESSAGES policies
-- -----------------------------------------------

CREATE POLICY "hr_admin_messages"
ON case_messages FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN cases c ON c.id = case_messages.case_id
    WHERE ur.user_id = auth.uid()
    AND ur.org_id = c.org_id
    AND ur.role = 'hr_admin'
  )
);

-- -----------------------------------------------
-- CASE NOTES policies
-- -----------------------------------------------

CREATE POLICY "hr_admin_notes"
ON case_notes FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN cases c ON c.id = case_notes.case_id
    WHERE ur.user_id = auth.uid()
    AND ur.org_id = c.org_id
    AND ur.role = 'hr_admin'
  )
);

-- -----------------------------------------------
-- EVIDENCE policies
-- -----------------------------------------------

CREATE POLICY "hr_admin_evidence"
ON evidence FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN cases c ON c.id = evidence.case_id
    WHERE ur.user_id = auth.uid()
    AND ur.org_id = c.org_id
    AND ur.role = 'hr_admin'
  )
);

-- -----------------------------------------------
-- USER ROLES policies
-- -----------------------------------------------

CREATE POLICY "users_select_own_roles"
ON user_roles FOR SELECT
USING (auth.uid() = user_id);

-- -----------------------------------------------
-- COMPLIANCE REPORTS policies
-- -----------------------------------------------

CREATE POLICY "compliance_officer_reports"
ON compliance_reports FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND org_id = compliance_reports.org_id
    AND role IN ('compliance_officer', 'hr_admin')
  )
);

-- -----------------------------------------------
-- IDENTITY VAULT — NO POLICIES
-- -----------------------------------------------
-- Zero direct access for anyone
-- Access only via Edge Function with audit logging
-- No policies = no one can access via Supabase client

-- -----------------------------------------------
-- AUDIT LOGS policies
-- -----------------------------------------------

CREATE POLICY "hr_admin_audit_logs"
ON audit_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN cases c ON c.id = audit_logs.target_case_id
    WHERE ur.user_id = auth.uid()
    AND ur.org_id = c.org_id
    AND ur.role = 'hr_admin'
  )
);
