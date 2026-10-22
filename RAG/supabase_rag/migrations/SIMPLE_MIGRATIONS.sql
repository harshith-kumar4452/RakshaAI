-- =====================================================
-- JUSTRA - SIMPLE SAFE MIGRATIONS
-- Copy and paste this entire file into Supabase SQL Editor
-- =====================================================

-- Enable required extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- TABLE 1: case_sensitive_identity
-- =====================================================
CREATE TABLE IF NOT EXISTS case_sensitive_identity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
  complaint_text_raw TEXT NOT NULL,
  reporter_name TEXT,
  reporter_email TEXT,
  reporter_phone TEXT,
  reporter_address TEXT,
  pii_detected JSONB,
  accessed_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  last_accessed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_sensitive_identity_case_id ON case_sensitive_identity(case_id);
ALTER TABLE case_sensitive_identity ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- TABLE 2: case_triage
-- =====================================================
CREATE TABLE IF NOT EXISTS case_triage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
  category TEXT CHECK (category IN ('sexual_harassment', 'bullying', 'cyberbullying', 'verbal_abuse', 'discrimination', 'other')),
  severity INTEGER CHECK (severity BETWEEN 1 AND 10),
  urgency TEXT CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  emotion_score FLOAT CHECK (emotion_score BETWEEN 0 AND 1),
  detail_score FLOAT CHECK (detail_score BETWEEN 0 AND 1),
  exaggeration_flags TEXT[],
  recommended_authority TEXT CHECK (recommended_authority IN ('ICC', 'HR', 'legal', 'HSE')),
  summary TEXT,
  legal_citations JSONB,
  suggested_followups TEXT[],
  needs_followup BOOLEAN DEFAULT FALSE,
  model_used TEXT,
  model_metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_triage_case_id ON case_triage(case_id);
CREATE INDEX IF NOT EXISTS idx_case_triage_category ON case_triage(category);
CREATE INDEX IF NOT EXISTS idx_case_triage_urgency ON case_triage(urgency);
ALTER TABLE case_triage ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- TABLE 3: case_followups
-- =====================================================
CREATE TABLE IF NOT EXISTS case_followups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  answered_at TIMESTAMPTZ,
  answer_metadata JSONB,
  asked_by UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'skipped')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_followups_case_id ON case_followups(case_id);
CREATE INDEX IF NOT EXISTS idx_case_followups_status ON case_followups(status);
ALTER TABLE case_followups ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- TABLE 4: case_events
-- =====================================================
CREATE TABLE IF NOT EXISTS case_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  actor_type TEXT DEFAULT 'user' CHECK (actor_type IN ('user', 'system', 'service_role')),
  event_type TEXT NOT NULL,
  event_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_events_case_id ON case_events(case_id);
CREATE INDEX IF NOT EXISTS idx_case_events_actor_id ON case_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_case_events_event_type ON case_events(event_type);
CREATE INDEX IF NOT EXISTS idx_case_events_created_at ON case_events(created_at DESC);
ALTER TABLE case_events ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- TABLE 5: case_assignments
-- =====================================================
CREATE TABLE IF NOT EXISTS case_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES auth.users(id),
  assigned_by UUID REFERENCES auth.users(id),
  assignment_role TEXT DEFAULT 'primary_investigator' CHECK (assignment_role IN ('primary_investigator', 'secondary_reviewer', 'legal_counsel', 'icc_member')),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  removed_at TIMESTAMPTZ,
  removed_by UUID REFERENCES auth.users(id),
  removal_reason TEXT,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_case_assignments_case_id ON case_assignments(case_id);
CREATE INDEX IF NOT EXISTS idx_case_assignments_assigned_to ON case_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_case_assignments_is_active ON case_assignments(is_active) WHERE is_active = TRUE;
ALTER TABLE case_assignments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- UPDATE cases table - add new columns
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cases' AND column_name = 'reporter_user_id') THEN
    ALTER TABLE cases ADD COLUMN reporter_user_id UUID REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cases' AND column_name = 'voice_note_path') THEN
    ALTER TABLE cases ADD COLUMN voice_note_path TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cases' AND column_name = 'voice_transcript') THEN
    ALTER TABLE cases ADD COLUMN voice_transcript TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cases_reporter_user_id ON cases(reporter_user_id) WHERE reporter_user_id IS NOT NULL;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION generate_public_token()
RETURNS TEXT AS $$
DECLARE token TEXT; exists_check INTEGER;
BEGIN
  LOOP
    token := 'JUST-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    SELECT COUNT(*) INTO exists_check FROM cases WHERE token_public = token;
    IF exists_check = 0 THEN RETURN token; END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_secret_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION hash_secret_token(secret TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN crypt(secret, gen_salt('bf', 10));
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION verify_token_pair(p_public_token TEXT, p_secret_token TEXT)
RETURNS UUID AS $$
DECLARE v_case_id UUID; v_secret_hash TEXT;
BEGIN
  SELECT id, token_secret_hash INTO v_case_id, v_secret_hash FROM cases WHERE token_public = p_public_token;
  IF v_case_id IS NULL THEN RETURN NULL; END IF;
  IF v_secret_hash = crypt(p_secret_token, v_secret_hash) THEN RETURN v_case_id;
  ELSE RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION hash_phone(phone TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(digest(phone, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION log_case_event(
  p_case_id UUID,
  p_event_type TEXT,
  p_event_data JSONB DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_actor_type TEXT DEFAULT 'user',
  p_ip_address TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE v_event_id UUID;
BEGIN
  INSERT INTO case_events (case_id, actor_id, actor_type, event_type, event_data, ip_address)
  VALUES (p_case_id, COALESCE(p_actor_id, auth.uid()), p_actor_type, p_event_type, p_event_data, p_ip_address)
  RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_case_status_for_victim(p_public_token TEXT, p_secret_token TEXT)
RETURNS TABLE (
  case_id UUID, status TEXT, created_at TIMESTAMPTZ, last_updated TIMESTAMPTZ,
  timeline JSONB, support_message TEXT
) AS $$
DECLARE v_case_id UUID;
BEGIN
  v_case_id := verify_token_pair(p_public_token, p_secret_token);
  IF v_case_id IS NULL THEN RAISE EXCEPTION 'Invalid token pair'; END IF;

  RETURN QUERY
  SELECT c.id, c.status, c.created_at, c.updated_at AS last_updated,
    (SELECT jsonb_agg(jsonb_build_object('event', ce.event_type, 'date', ce.created_at,
      'description', CASE ce.event_type
        WHEN 'case_created' THEN 'Your report was submitted'
        WHEN 'triage_completed' THEN 'Initial review completed'
        WHEN 'under_review' THEN 'Case is being reviewed by our team'
        WHEN 'inquiry_open' THEN 'Formal inquiry has begun'
        WHEN 'resolved' THEN 'Case has been resolved'
        ELSE 'Case updated'
      END) ORDER BY ce.created_at)
     FROM case_events ce
     WHERE ce.case_id = c.id
     AND ce.event_type IN ('case_created', 'triage_completed', 'under_review', 'inquiry_open', 'resolved')) AS timeline,
    CASE c.status
      WHEN 'submitted' THEN 'Your report is being processed. We will update you soon.'
      WHEN 'triage_complete' THEN 'Initial assessment complete. An investigator will be assigned shortly.'
      WHEN 'under_review' THEN 'Your case is under active review. Thank you for your patience.'
      WHEN 'inquiry_open' THEN 'A formal inquiry is underway. We may reach out for additional information.'
      WHEN 'resolved' THEN 'Your case has been resolved. Thank you for coming forward.'
      ELSE 'Your case is being handled with care and confidentiality.'
    END AS support_message
  FROM cases c WHERE c.id = v_case_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RLS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "hr_admin_select_triage" ON case_triage;
CREATE POLICY "hr_admin_select_triage" ON case_triage FOR SELECT
USING (EXISTS (
  SELECT 1 FROM user_roles ur JOIN cases c ON c.id = case_triage.case_id
  WHERE ur.user_id = auth.uid() AND ur.org_id = c.org_id AND ur.role = 'hr_admin'
));

DROP POLICY IF EXISTS "hr_admin_case_events" ON case_events;
CREATE POLICY "hr_admin_case_events" ON case_events FOR SELECT
USING (EXISTS (
  SELECT 1 FROM user_roles ur JOIN cases c ON c.id = case_events.case_id
  WHERE ur.user_id = auth.uid() AND ur.org_id = c.org_id AND ur.role = 'hr_admin'
));

DROP POLICY IF EXISTS "system_insert_case_events" ON case_events;
CREATE POLICY "system_insert_case_events" ON case_events FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "hr_admin_case_followups" ON case_followups;
CREATE POLICY "hr_admin_case_followups" ON case_followups FOR ALL
USING (EXISTS (
  SELECT 1 FROM user_roles ur JOIN cases c ON c.id = case_followups.case_id
  WHERE ur.user_id = auth.uid() AND ur.org_id = c.org_id AND ur.role = 'hr_admin'
));

DROP POLICY IF EXISTS "hr_admin_case_assignments" ON case_assignments;
CREATE POLICY "hr_admin_case_assignments" ON case_assignments FOR ALL
USING (EXISTS (
  SELECT 1 FROM user_roles ur JOIN cases c ON c.id = case_assignments.case_id
  WHERE ur.user_id = auth.uid() AND ur.org_id = c.org_id AND ur.role = 'hr_admin'
));

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION auto_log_case_creation()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM log_case_event(NEW.id, 'case_created',
    jsonb_build_object('victim_type', NEW.victim_type, 'org_id', NEW.org_id), NULL, 'system');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_new_case_creation ON cases;
CREATE TRIGGER log_new_case_creation
AFTER INSERT ON cases
FOR EACH ROW EXECUTE FUNCTION auto_log_case_creation();

CREATE OR REPLACE FUNCTION auto_log_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM log_case_event(NEW.id, 'status_changed',
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status), auth.uid(), 'user');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_case_status_changes ON cases;
CREATE TRIGGER log_case_status_changes
AFTER UPDATE ON cases
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION auto_log_status_change();

-- =====================================================
-- TEST: Verify setup worked
-- =====================================================

SELECT
  'case_sensitive_identity' as table_name,
  COUNT(*) as row_count
FROM case_sensitive_identity
UNION ALL
SELECT 'case_triage', COUNT(*) FROM case_triage
UNION ALL
SELECT 'case_followups', COUNT(*) FROM case_followups
UNION ALL
SELECT 'case_events', COUNT(*) FROM case_events
UNION ALL
SELECT 'case_assignments', COUNT(*) FROM case_assignments;

-- Test token generation
SELECT generate_public_token() as test_public_token,
       LEFT(generate_secret_token(), 10) || '...' as test_secret_preview;