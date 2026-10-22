-- Migration 003: Create cases table (core table - no PII)
-- Token pair IS the victim identity - no auth.users row for victims

CREATE TABLE cases (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              UUID NOT NULL REFERENCES organizations(id),

  -- Token auth (victim identity)
  token_public        TEXT UNIQUE NOT NULL,         -- e.g. JUST-4829
  token_secret_hash   TEXT NOT NULL,                -- bcrypt of secret key
  phone_hash          TEXT NOT NULL,                -- argon2id of phone, never raw

  -- Victim type
  victim_type         TEXT NOT NULL CHECK (victim_type IN ('anonymous', 'normal')),
  aadhar_verified     BOOLEAN DEFAULT FALSE,
  aadhar_vault_ref    UUID REFERENCES identity_vault(id),  -- null for anonymous

  -- Complaint content (redacted version stored here)
  complaint_text_redacted  TEXT,                    -- PII replaced with [PERSON_1] etc.
  complaint_scope     TEXT CHECK (complaint_scope IN ('posh_act', 'internal_policy', 'bns_criminal', 'pocso')),

  -- AI Triage output
  triage_category     TEXT,                         -- sexual_harassment | bullying | cyberbullying | verbal_abuse | other
  triage_severity     INTEGER CHECK (triage_severity BETWEEN 1 AND 10),
  triage_urgency      TEXT CHECK (triage_urgency IN ('low', 'medium', 'high', 'critical')),
  credibility_score   FLOAT CHECK (credibility_score BETWEEN 0 AND 1),
  emotion_score       FLOAT CHECK (emotion_score BETWEEN 0 AND 1),
  exaggeration_flags  TEXT[],                       -- array of flag strings
  recommended_authority TEXT CHECK (recommended_authority IN ('ICC', 'HR', 'legal', 'HSE', 'police')),
  triage_summary      TEXT,                         -- 1 sentence neutral summary
  legal_citations     JSONB,                        -- [{act, section, text, relevance}]

  -- Power imbalance
  power_imbalance_score FLOAT,                      -- 0-1, calculated from victim/accused roles

  -- POCSO flag
  pocso_flagged       BOOLEAN DEFAULT FALSE,
  involves_minor      BOOLEAN DEFAULT FALSE,

  -- Case lifecycle
  status              TEXT DEFAULT 'submitted' CHECK (status IN (
                        'submitted', 'triage_complete', 'under_review',
                        'inquiry_open', 'escalated', 'resolved', 'withdrawn', 'closed'
                      )),
  assigned_to         UUID REFERENCES auth.users(id),  -- hr_admin user
  sla_start_date      TIMESTAMPTZ,
  sla_deadline        TIMESTAMPTZ,                    -- calculated via trigger
  sla_breached        BOOLEAN DEFAULT FALSE,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_cases_org_id ON cases(org_id);
CREATE INDEX idx_cases_token_public ON cases(token_public);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_assigned_to ON cases(assigned_to);
CREATE INDEX idx_cases_pocso_flagged ON cases(pocso_flagged) WHERE pocso_flagged = TRUE;
CREATE INDEX idx_cases_created_at ON cases(created_at DESC);
