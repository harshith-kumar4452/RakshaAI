You are a senior full‑stack engineer and architect working on **Justra**, an AI‑powered harassment reporting and case‑management platform.

## Existing context (do NOT rewrite, extend it)
- Framework: Next.js App Router
- UI: React + Tailwind
- Backend: Supabase (Postgres + Auth + RLS), server components + route handlers
- Auth:
  - Victim: token-based access (public+secret token pair), phone hashing already wired in demo
  - Staff: Supabase email/password auth
- Personas:
  - Victim (anonymous / confidential reporter)
  - HR Admin (case manager)
  - Compliance Officer (aggregated analytics only)
  - Platform Admin (multi-tenant governance)
- Key components:
  - Victim report flow: `app/(victim)/report/page.js`, `components/victim/report-flow.jsx`
  - Victim status: `app/(victim)/status/page.js`
  - HR admin dashboards: `app/(hr-admin)/hr-admin/dashboard/page.js`, `.../cases/[id]/page.js`, `.../heatmap/page.js`
  - Compliance dashboard: `app/(compliance)/compliance/dashboard/page.js`
  - Supabase client: `lib/supabase/server.js`
  - NYAYA 3D courtroom: `components/nyaya/*`, `app/(hr-admin)/cases/[id]/nyaya/page.jsx`
- README summary: NYAYA has 4 AI agents (timeline, subject intel, credibility, legal retriever) and outputs a recommendation (severity, SLA days, escalation flags, etc.). For now it uses mock data.

## Product decisions you MUST respect
1. **Reporting modes**
   - Two explicit options for the victim:
     - **Report anonymously** (no login, no phone/email required)
     - **Report with identity** (phone/email auth via Supabase; confidential to ICC/HR)
   - In both modes, victim writes a free-text description (and optional voice note) covering:
     - What happened?
     - When did it happen?
     - Where did it happen?
     - Relationship to the accused
     - Is this ongoing?
     - Optional media uploads (images, videos, documents)
   - There is **no rigid multi-field form** for these Tier‑1 questions; they are encouraged as guidance text above the description.

2. **Tier‑2 follow‑ups**
   - If the initial description is vague or structured fields cannot be reliably extracted, we ask **follow-up questions** as a small form or via chat:
     - More specific location
     - How many times this happened (one-time / repeated)
     - Additional evidence (emails, messages, etc.)
     - Presence of witnesses

3. **Privacy model**
   - PII detection/redaction layer:
     - Raw text is scanned for names, phones, emails, exact addresses.
     - Redacted version stored in `cases` table.
     - Raw text + direct identifiers stored only in a locked **Identity Vault** table accessible only to HR/ICC/ADMIN.
   - Investigators and most staff see only **redacted** case content. Identity access is rare and fully logged in `case_events`.
   - Anonymous mode: `reporter_user_id` is null; confidential mode ties to `auth.users.id`.

4. **AI triage JSON contract**
   - We use an LLM (e.g., Claude/GPT/Groq) with a structured prompt to produce the following JSON for each case:
     {
       "category": one of ["sexual_harassment", "bullying", "cyberbullying", "verbal_abuse", "discrimination", "other"],
       "severity": integer 1-10,
       "urgency": one of ["low", "medium", "high", "critical"],
       "emotion_score": float 0-1,           // distress level
       "detail_score": float 0-1,            // how specific/consistent (formerly “credibility_score”)
       "exaggeration_flags": string[],       // e.g. ["uses absolutes: 'always/never'", "no dates given"]
       "recommended_authority": one of ["ICC", "HR", "legal", "HSE"],
       "summary": string                     // 1-sentence neutral summary
     }
   - “detail_score” is **advisory only**, never used to auto-reject cases.

5. **Out-of-scope for now**
   - No Aadhaar integration or external KYC.
   - No heavy custom CNN/YOLO “violence detection” in the MVP.
   - RAG / law-graph can be mocked by a simple static mapping file of category→relevant POSH/POCSO/BNS sections.

## What I want you to do next

You will:
1. **Design or refine the Supabase schema and RLS policies** to support this flow (if not already present):
   - `cases` (redacted text + structured fields)
   - `case_sensitive_identity` (identity vault)
   - `evidence`
   - `case_triage` (AI output)
   - `case_events` (audit trail)
   - `case_assignments` (who is handling a case)
   - Any helper functions (e.g., `current_role()`), indexes, constraints.

2. **Implement backend route handlers / server actions** for:
   - Submitting a new report (anonymous + with identity):
     - Accepts description + optional Tier‑1 hints + media.
     - Stores raw vs redacted content correctly.
     - Generates public+secret token pair and returns it.
   - Running AI triage:
     - Triggered after case creation (Edge Function / route handler).
     - Calls the LLM API with redacted text + basic precomputed features (absolutes ratio, presence of dates/locations, etc.).
     - Saves JSON output into `case_triage`.
   - Tier‑2 follow-ups:
     - Endpoint to store structured answers (location detail, repetition, witnesses, extra evidence).
   - Case status fetch (by token):
     - Returns safe status + timeline + support messages for victims.

3. **Wire the frontend flows** to these APIs:
   - `(victim)/report`:
     - Two buttons: “Report Anonymously” and “Report With My Identity”.
     - Free-text + optional voice upload, tooltip reminding the 5 Tier‑1 questions.
     - After submit, shows token + simple “what happens next” info.
   - `(victim)/status`:
     - Form to enter token + date → shows status, timeline, and optional gentle wellbeing messages.
   - `(hr-admin)/hr-admin/dashboard` + `cases/[id]`:
     - Display triage results (category, severity, urgency, emotion_score, detail_score, recommended_authority).
     - Link into NYAYA view (we can keep using mock data for now but pass real case summary where possible).

4. **Document clearly in code comments and/or a short README section**:
   - The data flow from victim input → PII redaction → AI triage → HR/admin views.
   - Any environment variables required (e.g., AI API keys).
   - Any assumptions you made.

## Coding style & constraints

- Use idiomatic Next.js App Router patterns (route handlers in `app/api/.../route.js` or server actions where appropriate).
- Use the existing Supabase client in `lib/supabase/server.js` for server-side calls.
- Keep secrets (AI keys, service role) only in server/edge code, never in client components.
- Prefer small, composable functions over giant files.
- Before writing large chunks of code, briefly outline the plan or file-level changes so I can follow.

Now:
1. Start by proposing any necessary adjustments to the database schema in plain English.
2. Then write the actual SQL for Supabase.
3. After that, implement the main report-submission API route and show me the code.
Stop after each major step so I can review and adjust.