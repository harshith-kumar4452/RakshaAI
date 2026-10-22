-- Migration 001: Create organizations table
-- This must be created first as it's referenced by other tables

CREATE TABLE organizations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT NOT NULL,
  org_type        TEXT CHECK (org_type IN ('workplace', 'campus', 'other')),
  sla_duration_days INTEGER DEFAULT 90,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_organizations_org_type ON organizations(org_type);
