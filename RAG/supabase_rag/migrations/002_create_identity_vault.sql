-- Migration 002: Create identity_vault table
-- Stores encrypted Aadhaar data for victim_normal
-- NO DIRECT ACCESS - only via Edge Function with audit logging

CREATE TABLE identity_vault (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  aadhar_number_encrypted TEXT NOT NULL,            -- encrypted at app level before insert
  aadhar_image_path       TEXT,                     -- Supabase Storage path
  verified_at             TIMESTAMPTZ DEFAULT NOW(),
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_identity_vault_created_at ON identity_vault(created_at);
