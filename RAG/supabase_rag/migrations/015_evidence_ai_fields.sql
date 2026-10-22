-- Migration 015: Evidence storage + AI analysis fields

BEGIN;

CREATE TABLE IF NOT EXISTS evidence (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_type TEXT CHECK (file_type IN ('screenshot', 'document', 'audio', 'other')),
  file_metadata JSONB,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS ai_description TEXT,
  ADD COLUMN IF NOT EXISTS ai_ocr_text TEXT,
  ADD COLUMN IF NOT EXISTS ai_entities JSONB,
  ADD COLUMN IF NOT EXISTS ai_actions TEXT[];

CREATE INDEX IF NOT EXISTS idx_evidence_case_id ON evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_at ON evidence(uploaded_at DESC);

COMMIT;
