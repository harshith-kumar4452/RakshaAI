# JUSTra – AI-Assisted Complaint Triage Platform

JUSTra streamlines workplace harassment complaint intake for HR, compliance, and victim-support teams. Victims can file reports without authentication, receive a unique `JUST-XXXX` case ID, upload evidence, and finish a guided triage chat powered by Groq LLMs. HR and compliance operators get normalized case data, AI-derived severity/urgency scores, and auto-updated Supabase records for downstream dashboards and tools.

## Live Demo :https://raksha-ai-theta.vercel.app/
## Highlights
- **Authentication-free intake** – victims only share a phone number for OTP verification and can remain anonymous thereafter.
- **Smart NLP pre-screening** – [lib/token-utils.js](lib/token-utils.js) computes temporal/location/specificity scores to decide whether triage follow-ups are required.
- **LLM-driven follow-ups** – [app/api/complaints/triage/route.js](app/api/complaints/triage/route.js) enforces strict JSON extraction using Groq `llama-3.3-70b-versatile`, detects contradictions, and persists incremental metadata.
- **Evidence enrichment** – uploaded images are stored under `public/evidence/<CASE_ID>` and summarized/OCR’d through Groq vision models before being inserted into Supabase `evidence` rows.
- **Multi-surface insights** – dashboard experiences under `app/(compliance)` + `components/compliance`, HR admin tooling under `app/(hr-admin)` + `components/hr`, and victim-side experiences under `app/(victim)`.
- **Extensible AI surface area** – Python-based RAG service (`RAG/`) and Telegram bridge (`telegram-bot/`) ship side-by-side for experimentation.

## Architecture at a Glance
```
Victim UI (Next.js app router)
	└── OTP gate + Aadhaar fetch (Supabase RPC)
	└── Report form + timeline builder + evidence uploader
			└── POST /api/complaints/submit (Supabase insert + Groq vision)
					 └── Unique JUST-XXXX token + NLP triad score
			└── Fullscreen triage chat (components/victim/fullscreen-chat.jsx)
					 └── POST /api/complaints/triage (Groq LLM extraction)
								└── Supabase updates + fraud detection

Supporting services
	├── Supabase (database, auth bypassed for victims)
	├── Groq API (text + vision)
	├── Python RAG pipeline (optional, RAG/)
	└── Telegram bot relay (telegram-bot/)
```

## Repository Guide
- `app/` – Next.js App Router surfaces for victim, HR, and compliance personas.
- `components/` – UI primitives plus domain widgets (victim reporting flow, compliance dashboards, HR analytics, Nyaya 3D courtroom widgets, etc.).
- `app/api/complaints` – submission + Groq-driven triage endpoints.
- `lib/` – utility helpers, token generation + triad scoring, Supabase clients.
- `public/evidence` – evidence uploads bucketed by case ID (gitignored).
- `RAG/` – optional Python service for document-grounded answers; see [RAG/READMERAG.md](RAG/READMERAG.md).
- `telegram-bot/` – lightweight bridge for Telegram notifications.

See [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) for a deep dive into the victim flow, scoring thresholds, and follow-up logic.

## Prerequisites
- Node.js 20+ and npm (or pnpm/bun) for the Next.js workspace.
- Python 3.11+ with virtualenv support for the optional RAG service.
- Supabase project with the `complaints`, `evidence`, `aadhaar_identity`, and related tables seeded (see [supabase/](supabase/)).
- Groq API access for both text (`llama-3.3-70b-versatile`) and vision models (`meta-llama/llama-4-scout-17b-16e-instruct` fallback set in code).

## Environment Configuration
Create `.env.local` (the file is gitignored) and populate at least:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<public-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Groq
GROQ_API_KEY=<groq-key>
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct   # optional override

# OTP / identity helpers
OTP_SALT=<random-string>
Aadhaar_API_BASE=<if hooking to real KYC>
```

Optional extras:
- `RAG_OPENAI_API_KEY`, `RAG_SUPABASE_URL`, etc. for the Python pipeline (see [RAG/README](RAG/READMERAG.md)).
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` for `telegram-bot/`.

## Installing & Running
```bash
npm install           # install dependencies
npm run dev           # start Next.js at http://localhost:3000
npm run lint          # lint via eslint-config-next
npm run build && npm start   # production build
```

The dev server currently logs a warning about the deprecated `middleware` convention; migrate to the App Router `proxy` once higher priority items are complete.

### Optional Services
- **RAG service**
	```bash
	cd RAG
	python -m venv .venv && .venv/Scripts/activate
	pip install -r requirements.txt  # or `pip install -e .`
	python main.py                   # add --test for dry runs
	```
- **Telegram bot**
	```bash
	cd telegram-bot
	pip install -r requirements.txt
	python app.py
	```

## Core User Journey
1. **OTP gate** – victims verify a phone number via `/api/complaints/verify-phone`. Returning users are pointed to `/status` with their last case ID.
2. **Anonymous vs Identified onboarding** – Aadhaar lookup (`/api/identity/aadhaar`) pre-fills victim metadata when desired.
3. **Report entry** – [components/victim/report-flow.jsx](components/victim/report-flow.jsx) enforces minimum description length, auto-detects timeline entries, captures evidence images, and normalizes data before submission.
4. **Case submission** – `/api/complaints/submit`:
	 - Ensures unique `JUST-XXXX` tokens via `generateCaseId()`.
	 - Inserts complaint rows with NLP triad scores and timeline JSON.
	 - Saves evidence files + AI summaries to `evidence` table.
	 - Returns `needsFollowUp` + `missingFields` back to the UI.
5. **Fullscreen triage** – [components/victim/fullscreen-chat.jsx](components/victim/fullscreen-chat.jsx) opens immediately if any Tier-1 field is missing. Conversations stay in memory and display credibility progress.
6. **AI extraction** – `/api/complaints/triage`:
	 - Streams prior messages + original description into Groq.
	 - Validates strict JSON contract (complete vs follow-up vs fraud).
	 - Applies `buildExtractionUpdate()` to persist partial or final metadata, set severity/urgency, and mark records `submitted` when complete.
7. **Downstream surfaces** – compliance dashboards, HR admin shells, Nyaya courtroom visualizations, and victim status pages consume the normalized Supabase data.

## API Reference (high level)

### `POST /api/complaints/submit`
Payload
```json
{
	"description": "text",
	"phone": "+91...",
	"isAnonymous": true,
	"victimName": "optional",
	"timeline": [{"date": "2026-03-20", "description": ""}],
	"evidenceImages": [<multipart files>]
}
```
Response
```json
{
	"success": true,
	"caseId": "JUST-4829",
	"complaintId": "uuid",
	"needsFollowUp": true,
	"missingFields": ["location", "specificity"],
	"nlpScore": {"temporal": 0.3, "location": 0.1, "specificity": 0.6, "overall": 0.33}
}
```

### `POST /api/complaints/triage`
Payload
```json
{
	"complaintId": "uuid",
	"messages": [
		{"role": "assistant", "content": "Where did this happen?"},
		{"role": "user", "content": "3rd floor conference room"}
	]
}
```
Responses include:
- `extraction_complete: false` → `next_question` plus `current_credibility`.
- `extraction_complete: true` → normalized fields (incident date, location detail, accused role, severity 1‑10, urgency, witness/evidence flags) and complaint status set to `submitted`.
- `fraud_detected: true` → complaint marked `abandoned` and session stopped.

## Evidence Pipeline
1. Attachments arrive as `multipart/form-data` on `/api/complaints/submit`.
2. Files are saved to `public/evidence/<CASE_ID>/<timestamp>.ext` (served statically for reviewers).
3. `analyzeEvidenceWithLLM()` converts buffers to base64 data URLs and queries Groq vision models.
4. AI output (OCR text, entity list, action list, confidence) is stored in Supabase `evidence` rows, enabling downstream HR review tooling.

## Troubleshooting
- **`GROQ_API_KEY not configured`** – both `/submit` evidence analysis and `/triage` follow-ups require the key; set it in `.env.local`.
- **`Failed to generate unique case ID`** – Supabase already holds the randomly generated token; retry submission or purge test data.
- **`Incident date cannot be after the reporting date`** – timeline events are validated client-side; correct the date before re-submitting.
- **Middleware warning** – Next.js 16.2 deprecates the legacy `middleware` file; migrate to the new `proxy` entry point.

## Contributing & Next Steps
1. Create a new branch.
2. Keep environment secrets out of git (all `.env*` files are ignored by default).
3. Run `npm run lint` before pushing.
4. Open a PR with screenshots or short Looms when editing major UX flows.

Planned enhancements:
- Case status portal and notifications for victims.
- Dedicated dashboards for Nyaya council sessions and HR escalations.
- PII redaction layer prior to sending prompts to Groq.
- Real organization scoping and RBAC per tenant.

---

JUSTra is built for rapid experimentation. If you deploy to Vercel or self-host, remember to provision Supabase service role keys securely, rotate Groq keys frequently, and monitor evidence storage quotas under `public/evidence/`.
