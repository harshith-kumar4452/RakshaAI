export interface AgentSection {
  agent: "timeline" | "subject" | "credibility" | "legal"
  task: string
  content: string
  flags: string[]
}

export interface CollectiveSignals {
  recommended_action: string
  overall_severity: string
  sla_days: number
  mandatory_escalation: boolean
  tension_flags: string[]
}

export interface NyayaReport {
  case_id: string
  sections: AgentSection[]
  collective_signals: CollectiveSignals
}
