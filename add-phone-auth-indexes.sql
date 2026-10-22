-- Ensure phone-based victim lookup is fast and safe.
-- Run this once in Supabase SQL editor.

ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS phone_number text;

CREATE INDEX IF NOT EXISTS idx_complaints_phone_number
ON complaints(phone_number);

CREATE INDEX IF NOT EXISTS idx_complaints_phone_created_at
ON complaints(phone_number, created_at DESC);
