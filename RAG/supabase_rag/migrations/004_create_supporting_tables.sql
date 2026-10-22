-- Migration 004-010: Create supporting tables

-- Case messages (double-blind chat)
CREATE TABLE case_messages (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('victim', 'hr_admin')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_case_messages_case_id ON case_messages(case_id);
CREATE INDEX idx_case_messages_created_at ON case_messages(created_at);

-- Case notes (internal - never visible to victim)
CREATE TABLE case_notes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES auth.users(id),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_case_notes_case_id ON case_notes(case_id);
CREATE INDEX idx_case_notes_author_id ON case_notes(author_id);

-- Evidence (victim_normal only)
CREATE TABLE evidence (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,                    -- Supabase Storage
  file_type       TEXT CHECK (file_type IN ('screenshot', 'document', 'audio', 'other')),
  file_metadata   JSONB,                            -- size, timestamp, mime_type
  uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_evidence_case_id ON evidence(case_id);

-- User roles (for authenticated staff)
CREATE TABLE user_roles (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizations(id),
  role        TEXT NOT NULL CHECK (role IN ('hr_admin', 'compliance_officer', 'platform_admin')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_org_id ON user_roles(org_id);

-- Audit logs
CREATE TABLE audit_logs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id        UUID REFERENCES auth.users(id),
  action          TEXT NOT NULL,                    -- e.g. 'vault_access', 'pocso_escalation'
  target_case_id  UUID REFERENCES cases(id),
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Compliance reports
CREATE TABLE compliance_reports (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES organizations(id),
  year            INTEGER NOT NULL,
  generated_by    UUID REFERENCES auth.users(id),
  report_data     JSONB,
  pdf_path        TEXT,
  generated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compliance_reports_org_id ON compliance_reports(org_id);
CREATE INDEX idx_compliance_reports_year ON compliance_reports(year);

-- Legal chunks (for RAG - pgvector)
-- Note: Skip if already exists from JustRAG project
CREATE EXTENSION IF NOT EXISTS vector;

-- Only create if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'legal_chunks') THEN
    CREATE TABLE legal_chunks (
      id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      act_name    TEXT NOT NULL,                        -- 'BNS' | 'POSH Act' | 'IT Act' | 'POCSO Act'
      section_no  TEXT,
      section_title TEXT,
      chunk_text  TEXT NOT NULL,
      embedding   vector(768),                          -- nomic-embed-text dimension
      metadata    JSONB,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    
    CREATE INDEX idx_legal_chunks_act_name ON legal_chunks(act_name);
    CREATE INDEX ON legal_chunks USING ivfflat (embedding vector_cosine_ops);
    
    RAISE NOTICE 'Created legal_chunks table';
  ELSE
    RAISE NOTICE 'legal_chunks table already exists, skipping creation';
  END IF;
END $$;
