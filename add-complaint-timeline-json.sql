-- Timeline JSON storage for incident chronology
ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS timeline jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_complaints_timeline_gin
ON complaints USING gin (timeline);
