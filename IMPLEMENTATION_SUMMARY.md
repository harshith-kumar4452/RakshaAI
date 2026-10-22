# Simplified Victim Complaint Flow

## ✅ Implementation Complete

### **Architecture Overview**

```
User enters description
        ↓
Generate unique Case ID (JUST-XXXX)
        ↓
Calculate NLP Triad Score
        ↓
[If vague] → Fullscreen Chat with AI follow-ups
        ↓
AI asks ONLY what's missing:
  - Temporal: "When did this happen?"
  - Location: "Where did this happen?"
  - Specificity: "Can you provide more details?"
        ↓
Triage complete → Display results
```

## **Key Features**

### 1. **NO Authentication**
- No OTP, no phone, no passwords
- Just description → Case ID

### 2. **Smart Duplicate Prevention**
- Checks database for existing Case IDs
- Retries up to 10 times if collision occurs
- Case ID format: `JUST-XXXX` (4 digits)

### 3. **NLP Triad Analysis**
Analyzes description for:
- **Temporal** (0.0-1.0): Dates, times, timeframes
- **Location** (0.0-1.0): Places, specific locations
- **Specificity** (0.0-1.0): Concrete details, quotes, names

**Threshold**: Any score < 0.4 triggers follow-up questions

### 4. **Fullscreen Conversational Chat**
- Opens immediately after submission
- AI asks ONE question at a time
- Chat history preserved
- Auto-scrolls to latest message
- Clean, focused UI

### 5. **Targeted Follow-ups Only**
AI ONLY asks about missing fields:
```javascript
missingFields: ["temporal", "location"]
→ AI asks: "When did this incident occur?"
→ User answers
→ AI asks: "Where did this take place?"
→ User answers
→ Triage complete!
```

## **File Structure**

```
lib/token-utils.js
├─ generateCaseId()          # Creates JUST-XXXX
└─ calculateNLPTriad()       # Analyzes description

app/api/complaints/
├─ submit/route.js           # POST: Create complaint + Case ID
└─ triage/route.js           # POST: AI follow-ups + triage

components/victim/
├─ report-flow.jsx           # Main flow: description → chat → results
└─ fullscreen-chat.jsx       # Fullscreen conversational UI
```

## **API Endpoints**

### POST `/api/complaints/submit`
**Request:**
```json
{
  "description": "My boss harassed me yesterday"
}
```

**Response:**
```json
{
  "success": true,
  "caseId": "JUST-4829",
  "complaintId": "uuid",
  "needsFollowUp": true,
  "missingFields": ["location", "specificity"]
}
```

### POST `/api/complaints/triage`
**Request:**
```json
{
  "complaintId": "uuid",
  "missingFields": ["location"],
  "messages": [
    {"role": "assistant", "content": "Where did this happen?"},
    {"role": "user", "content": "In the office conference room"}
  ]
}
```

**Response (incomplete):**
```json
{
  "message": "Can you provide more details about what was said?",
  "isComplete": false
}
```

**Response (complete):**
```json
{
  "message": "{...json...}",
  "triageData": {
    "category": "sexual_harassment",
    "severity": 7,
    "urgency": "high",
    "credibility_score": 0.75,
    "recommended_authority": "ICC"
  },
  "isComplete": true
}
```

## **User Flow**

### Step 1: Enter Description
```
User sees: Simple textarea
User enters: "My supervisor harassed me"
User clicks: "Submit Report"
```

### Step 2: Fullscreen Chat Opens
```
AI: "When did this incident occur?"
User: "Last Friday afternoon"

AI: "Where did this take place?"
User: "In the conference room on 3rd floor"

AI: "Can you provide more details about what happened?"
User: "He made inappropriate comments about my appearance"

AI: ✓ Triage Complete
```

### Step 3: Results Display
```
Case ID: JUST-4829
Category: Sexual Harassment
Severity: 7/10
Urgency: High
Routed To: ICC
```

## **Environment Setup**

```bash
# .env.local (already populated with your keys)
GROQ_API_KEY=gsk_Y9iSH7mc...
NEXT_PUBLIC_SUPABASE_URL=https://xhzxdszz...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

## **Testing**

```bash
npm run dev
# Visit: http://localhost:3000/report
```

### Test Cases

**Vague Description (triggers chat):**
```
Input: "Someone harassed me"
Expected: AI asks for when, where, what
```

**Detailed Description (skips to triage):**
```
Input: "On March 20th, 2026, in the office cafeteria during lunch, my colleague John made inappropriate comments about my body."
Expected: Direct triage, minimal follow-ups
```

## **Database Updates**

After triage completes, `complaints` table updated:
```sql
status: 'submitted'
incident_types: ['sexual_harassment']
priority_score: 7
routed_to: 'ICC'
```

## **Next Steps**

1. ✅ Test the flow end-to-end
2. Add case status tracking page
3. Convert complaints → cases table
4. Add PII redaction layer
5. Implement real org_id selection

## **Troubleshooting**

**"GROQ_API_KEY not configured"**
→ Check `.env.local` has `GROQ_API_KEY`

**Chat not opening**
→ Check browser console for API errors

**Duplicate Case ID errors**
→ System auto-retries 10 times, should be rare

**AI asking irrelevant questions**
→ Check `missingFields` in submit response

---

## **Summary**

✅ **NO authentication** - just description
✅ **Unique Case ID** - checked against DB
✅ **Smart NLP analysis** - only asks what's needed
✅ **Fullscreen chat** - clean, focused UX
✅ **Groq LLaMA 3.3 70B** - intelligent follow-ups
✅ **Triage complete** - category, severity, routing

**Total simplification achieved!** 🚀
