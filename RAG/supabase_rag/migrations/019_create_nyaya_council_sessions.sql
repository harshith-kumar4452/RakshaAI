-- Migration 019: Persist Nyaya council findings and HR-in-council discussions

CREATE TABLE IF NOT EXISTS public.nyaya_council_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  case_token text,
  triad_run_id uuid REFERENCES public.triad_engine_runs(id) ON DELETE SET NULL,

  -- auto_council = standard Nyaya run, hr_question = HR interactive prompt session
  session_mode text NOT NULL CHECK (session_mode IN ('auto_council', 'hr_question')),
  hr_question text,

  -- Full structured outputs
  findings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  chat_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  conclusion_json jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_nyaya_council_sessions_case_id
  ON public.nyaya_council_sessions(case_id);

CREATE INDEX IF NOT EXISTS idx_nyaya_council_sessions_mode
  ON public.nyaya_council_sessions(session_mode);

CREATE INDEX IF NOT EXISTS idx_nyaya_council_sessions_created_at
  ON public.nyaya_council_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nyaya_council_sessions_findings_gin
  ON public.nyaya_council_sessions USING gin (findings_json);

CREATE INDEX IF NOT EXISTS idx_nyaya_council_sessions_chat_gin
  ON public.nyaya_council_sessions USING gin (chat_json);

CREATE INDEX IF NOT EXISTS idx_nyaya_council_sessions_conclusion_gin
  ON public.nyaya_council_sessions USING gin (conclusion_json);

CREATE OR REPLACE FUNCTION public.set_nyaya_council_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_nyaya_council_sessions_updated_at ON public.nyaya_council_sessions;
CREATE TRIGGER trg_set_nyaya_council_sessions_updated_at
BEFORE UPDATE ON public.nyaya_council_sessions
FOR EACH ROW
EXECUTE FUNCTION public.set_nyaya_council_sessions_updated_at();
