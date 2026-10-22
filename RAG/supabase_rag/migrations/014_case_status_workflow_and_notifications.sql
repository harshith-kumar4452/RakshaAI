-- Migration 014: Case status workflow + status notifications

BEGIN;

CREATE TABLE IF NOT EXISTS case_status_workflow (
  status TEXT PRIMARY KEY,
  step_order INTEGER NOT NULL UNIQUE,
  next_status TEXT,
  default_eta_days INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO case_status_workflow (status, step_order, next_status, default_eta_days, label)
VALUES
  ('submitted', 1, 'assigned', 1, 'Submitted'),
  ('assigned', 2, 'in_progress', 2, 'Assigned'),
  ('in_progress', 3, 'escalated', 5, 'In Progress'),
  ('escalated', 4, 'resolved', 7, 'Escalated'),
  ('resolved', 5, 'closed', 2, 'Resolved'),
  ('closed', 6, NULL, 0, 'Closed')
ON CONFLICT (status) DO UPDATE
SET
  step_order = EXCLUDED.step_order,
  next_status = EXCLUDED.next_status,
  default_eta_days = EXCLUDED.default_eta_days,
  label = EXCLUDED.label,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS case_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL CHECK (new_status IN ('submitted', 'assigned', 'in_progress', 'escalated', 'resolved', 'closed')),
  routed_to TEXT,
  eta_days INTEGER,
  note TEXT,
  changed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_status_history_case_id ON case_status_history(case_id);
CREATE INDEX IF NOT EXISTS idx_case_status_history_created_at ON case_status_history(created_at DESC);

CREATE TABLE IF NOT EXISTS case_status_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  case_status TEXT NOT NULL CHECK (case_status IN ('submitted', 'assigned', 'in_progress', 'escalated', 'resolved', 'closed')),
  recipient_phone TEXT,
  channel TEXT NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'whatsapp', 'email', 'in_app')),
  message TEXT NOT NULL,
  send_state TEXT NOT NULL DEFAULT 'sent' CHECK (send_state IN ('queued', 'sent', 'failed')),
  provider_response JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_status_notifications_case_id ON case_status_notifications(case_id);
CREATE INDEX IF NOT EXISTS idx_case_status_notifications_sent_at ON case_status_notifications(sent_at DESC);

COMMIT;
