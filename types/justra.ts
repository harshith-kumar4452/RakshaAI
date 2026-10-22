export type VictimType = "anonymous" | "normal";

export type CaseStatus =
  | "submitted"
  | "triage_complete"
  | "under_review"
  | "inquiry_open"
  | "escalated"
  | "resolved"
  | "withdrawn"
  | "closed";

export type StaffRole = "hr_admin" | "compliance_officer" | "platform_admin";

export interface LegalCitation {
  act: string;
  section: string;
  text: string;
  relevance: number;
}

export interface JustraCase {
  id: string;
  org_id: string;
  token_public: string;
  victim_type: VictimType;
  aadhar_verified: boolean;
  complaint_text_redacted: string | null;
  triage_summary: string | null;
  triage_severity: number | null;
  triage_urgency: "low" | "medium" | "high" | "critical" | null;
  status: CaseStatus;
  pocso_flagged: boolean;
  involves_minor: boolean;
  legal_citations: LegalCitation[] | null;
  created_at: string;
}
