# AI-Powered Complaint Triage System

## Overview

The Justra platform uses Groq's LLaMA 3.3 70B model via Vercel AI SDK to intelligently process harassment complaints with conversational follow-up questions.

## Architecture

### Flow

```
User submits description
      ↓
[/api/complaints/submit]
 - Generates token pair (JUST-XXXX + secret)
 - Hashes phone number (Argon2id)
 - Calculates NLP triad score
 - Stores in complaints table
      ↓
[/api/complaints/triage]
 - Groq analyzes description
 - Asks follow-up questions if vague
 - Generates structured triage JSON
      ↓
Updates complaints table
 - incident_types, priority_score, routed_to
      ↓
Case ready for HR review
```

## Database Schema

### complaints table
```sql
- id: UUID (primary key)
- token: text (public case ID, e.g., JUST-1234)
- token_secret_hash: text (bcrypt hash of secret key)
- phone_hash: text (argon2id hash, never stores raw phone)
- org_id: UUID (references organizations)
- description: text (user's initial description)
- incident_types: text[] (from AI triage)
- status: text (draft → submitted → converted_to_case)
- priority_score: int (1-10, from AI severity)
- routed_to: text (ICC | HR | legal | HSE)
- case_id: UUID (links to cases table when converted)
```

## AI Triage System

### NLP Triad Score
Analyzes description for:
- **Temporal details** (dates, times, duration)
- **Location specifics** (where it happened)
- **Specificity** (quotes, names, concrete details)

Score < 0.4 → triggers follow-up questions

### Groq LLM Processing

**Model**: `llama-3.3-70b-versatile`

**System Prompt**:
- Analyzes complaint for structured data
- Asks clarifying questions for vague reports
- Generates triage JSON when sufficient info collected

**Output JSON**:
```json
{
  "triage_complete": true,
  "category": "sexual_harassment",
  "severity": 8,
  "urgency": "high",
  "emotion_score": 0.85,
  "credibility_score": 0.75,
  "exaggeration_flags": ["uses absolutes"],
  "recommended_authority": "ICC",
  "summary": "Workplace harassment allegation involving supervisor"
}
```

### Credibility Scoring
- **High (0.8-1.0)**: Specific dates, locations, quotes, witnesses
- **Medium (0.4-0.7)**: Some specifics, missing key details
- **Low (0.0-0.3)**: Vague, no verifiable details

**Note**: Low credibility is advisory only, never auto-rejects reports.

## API Endpoints

### POST /api/complaints/submit
**Request**:
```json
{
  "description": "string (min 10 chars)",
  "phoneNumber": "string (optional)",
  "orgId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "complaintId": "uuid",
  "publicToken": "JUST-1234",
  "secretToken": "abc123xyz",
  "needsFollowUp": true,
  "nlpScore": {
    "temporal": 0.5,
    "location": 0.3,
    "specificity": 0.6,
    "overall": 0.47
  }
}
```

### POST /api/complaints/triage
**Request**:
```json
{
  "complaintId": "uuid",
  "messages": [
    {"role": "user", "content": "answer to AI question"}
  ]
}
```

**Response** (follow-up):
```json
{
  "message": "Where did this incident occur?",
  "isComplete": false
}
```

**Response** (complete):
```json
{
  "message": "{...json...}",
  "triageData": { /* triage object */ },
  "isComplete": true
}
```

## UI Components

### VictimReportFlow
**Location**: `components/victim/report-flow.jsx`

**Features**:
1. Optional phone verification (OTP demo)
2. Free-text incident description
3. Token generation & display
4. Conversational AI follow-up
5. Final triage summary

**States**:
- `otpVerified`: Phone verification status
- `complaintId`: Complaint UUID
- `publicToken` / `secretToken`: Token pair
- `messages`: Conversation history with AI
- `triageComplete`: Final triage status

## Environment Variables

Create `.env.local` from `.env.local.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
GROQ_API_KEY=gsk_xxx
```

Get Groq API key: https://console.groq.com/keys

## Security

### Token System
- **Public token**: Case ID (JUST-XXXX) - shareable
- **Secret token**: 16-char random key - user must save!
- Secret stored as bcrypt hash in DB

### Phone Privacy
- Raw phone numbers NEVER stored
- Argon2id hash (memory-hard, resistant to GPU cracking)
- Hash params: 64MB memory, 3 iterations, parallelism=4

### PII Protection
- Initial description stored as-is in complaints table
- Future: PII redaction layer for cases table
- Identity vault for sensitive data

## Next Steps

1. **Real OTP Implementation**
   - Supabase Phone Auth
   - SMS provider integration

2. **PII Redaction**
   - Use NLP to detect names, phones, emails
   - Replace with [PERSON_1], [EMAIL_1], etc.
   - Store redacted version in cases table

3. **Convert to Case**
   - Create function to convert complaint → case
   - Transfer triage data
   - Link via case_id

4. **Status Tracking**
   - `/status` page for victims
   - Token authentication
   - Timeline view

## Troubleshooting

### "GROQ_API_KEY not configured"
Add `GROQ_API_KEY` to `.env.local`

### "Complaint not found"
Ensure complaint ID passed to triage endpoint is valid

### AI not asking follow-ups
Check NLP triad score - may be above 0.4 threshold

### Conversation loops
AI may need more specific answers - provide concrete details

## Testing

**Manual Test Flow**:
1. Go to `/report`
2. Click "Continue" (skip OTP)
3. Enter: "My boss harassed me yesterday"
4. AI should ask: "Where did this occur?"
5. Answer: "In the conference room on 3rd floor"
6. AI continues until sufficient detail collected
7. Triage JSON returned with category, severity, etc.

**Expected tokens**:
- Public: `JUST-1234` (4 digits, varies)
- Secret: 16-char alphanumeric (save it!)
