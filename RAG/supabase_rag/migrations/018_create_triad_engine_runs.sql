-- Migration 018: Triad Engine run storage for RAG, Deep Research, Timeline, Sentimental tools
-- Idempotent and safe to re-run.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Common helper for updated_at tracking
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.triad_engine_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Case linkage
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  token text NOT NULL,

  -- Run metadata
  run_version integer NOT NULL DEFAULT 1,
  overall_status text NOT NULL DEFAULT 'queued'
    CHECK (overall_status IN ('queued', 'running', 'partial', 'completed', 'failed')),

  -- Snapshot of tool input
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- RAG tool output and lifecycle
  rag_status text NOT NULL DEFAULT 'queued'
    CHECK (rag_status IN ('queued', 'running', 'completed', 'failed')),
  rag_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rag_result jsonb,
  rag_started_at timestamptz,
  rag_completed_at timestamptz,

  -- Deep research output and lifecycle
  deep_research_status text NOT NULL DEFAULT 'queued'
    CHECK (deep_research_status IN ('queued', 'running', 'completed', 'failed')),
  deep_research_result jsonb,
  deep_research_started_at timestamptz,
  deep_research_completed_at timestamptz,

  -- Timeline output and lifecycle
  timeline_status text NOT NULL DEFAULT 'queued'
    CHECK (timeline_status IN ('queued', 'running', 'completed', 'failed')),
  timeline_result jsonb,
  timeline_started_at timestamptz,
  timeline_completed_at timestamptz,

  -- Sentimental output and lifecycle
  sentimental_status text NOT NULL DEFAULT 'queued'
    CHECK (sentimental_status IN ('queued', 'running', 'completed', 'failed')),
  sentimental_result jsonb,
  sentimental_started_at timestamptz,
  sentimental_completed_at timestamptz,

  -- Aggregated dashboard payload after tools run
  dashboard_result jsonb,

  -- Tool/runtime diagnostics
  error_log jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  CONSTRAINT triad_engine_runs_case_version_unique UNIQUE (case_id, run_version)
);

CREATE INDEX IF NOT EXISTS idx_triad_engine_runs_case_id
  ON public.triad_engine_runs(case_id);

CREATE INDEX IF NOT EXISTS idx_triad_engine_runs_token
  ON public.triad_engine_runs(token);

CREATE INDEX IF NOT EXISTS idx_triad_engine_runs_overall_status
  ON public.triad_engine_runs(overall_status);

CREATE INDEX IF NOT EXISTS idx_triad_engine_runs_created_at
  ON public.triad_engine_runs(created_at DESC);

-- JSON query acceleration
CREATE INDEX IF NOT EXISTS idx_triad_engine_runs_rag_result_gin
  ON public.triad_engine_runs USING gin (rag_result);

CREATE INDEX IF NOT EXISTS idx_triad_engine_runs_deep_research_result_gin
  ON public.triad_engine_runs USING gin (deep_research_result);

CREATE INDEX IF NOT EXISTS idx_triad_engine_runs_timeline_result_gin
  ON public.triad_engine_runs USING gin (timeline_result);

CREATE INDEX IF NOT EXISTS idx_triad_engine_runs_sentimental_result_gin
  ON public.triad_engine_runs USING gin (sentimental_result);

CREATE INDEX IF NOT EXISTS idx_triad_engine_runs_dashboard_result_gin
  ON public.triad_engine_runs USING gin (dashboard_result);

DROP TRIGGER IF EXISTS trg_triad_engine_runs_updated_at ON public.triad_engine_runs;
CREATE TRIGGER trg_triad_engine_runs_updated_at
BEFORE UPDATE ON public.triad_engine_runs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE VIEW public.triad_engine_latest AS
SELECT DISTINCT ON (case_id)
  id,
  case_id,
  token,
  run_version,
  overall_status,
  rag_status,
  deep_research_status,
  timeline_status,
  sentimental_status,
  dashboard_result,
  created_at,
  updated_at,
  completed_at
FROM public.triad_engine_runs
ORDER BY case_id, run_version DESC, created_at DESC;

COMMIT;
