-- Migration 005: Create analytics views and functions

-- Analytics view: incident trends (no individual case data)
CREATE VIEW analytics_incident_trends AS
SELECT
  org_id,
  DATE_TRUNC('month', created_at) AS month,
  triage_category,
  triage_urgency,
  COUNT(*) AS incident_count,
  AVG(credibility_score) AS avg_credibility,
  AVG(triage_severity) AS avg_severity
FROM cases
GROUP BY org_id, month, triage_category, triage_urgency;

-- SLA breach alerts
CREATE VIEW sla_alerts AS
SELECT
  id AS case_id,
  org_id,
  status,
  sla_deadline,
  sla_breached,
  EXTRACT(DAY FROM (sla_deadline - NOW())) AS days_remaining
FROM cases
WHERE sla_start_date IS NOT NULL
  AND status NOT IN ('resolved', 'closed', 'withdrawn');

-- Reporting courage index
CREATE VIEW reporting_courage_index AS
SELECT
  org_id,
  COUNT(*) AS total_reports,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS reports_last_30_days
FROM cases
GROUP BY org_id;

-- RAG similarity search function
-- Note: Skip if already exists from JustRAG project
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'match_legal_sections' 
    AND pg_catalog.pg_function_is_visible(oid)
  ) THEN
    CREATE FUNCTION match_legal_sections(
      query_embedding vector(768),
      match_count INT DEFAULT 3
    )
    RETURNS TABLE (
      act_name TEXT,
      section_no TEXT,
      section_title TEXT,
      chunk_text TEXT,
      similarity FLOAT
    )
    LANGUAGE SQL STABLE
    AS $func$
      SELECT
        act_name,
        section_num as section_no,
        section_title,
        chunk_text,
        1 - (embedding <=> query_embedding) AS similarity
      FROM legal_chunks
      ORDER BY embedding <=> query_embedding
      LIMIT match_count;
    $func$;
    
    RAISE NOTICE 'Created match_legal_sections function';
  ELSE
    RAISE NOTICE 'match_legal_sections function already exists, skipping creation';
  END IF;
END $$;

-- Auto-update updated_at on cases
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cases_updated_at
BEFORE UPDATE ON cases
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-calculate SLA deadline and check for breach
CREATE OR REPLACE FUNCTION manage_sla()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate sla_deadline when sla_start_date is set
  IF NEW.sla_start_date IS NOT NULL THEN
    NEW.sla_deadline = NEW.sla_start_date + INTERVAL '90 days';
  END IF;
  
  -- Check for SLA breach
  IF NEW.sla_deadline IS NOT NULL 
     AND NEW.sla_deadline < NOW() 
     AND NEW.status NOT IN ('resolved', 'closed', 'withdrawn') THEN
    NEW.sla_breached = TRUE;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cases_manage_sla
BEFORE INSERT OR UPDATE ON cases
FOR EACH ROW EXECUTE FUNCTION manage_sla();
