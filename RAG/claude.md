# Justra Platform Implementation Progress

**Started:** 2026-03-24 13:53:59 IST  
**Project:** AI-powered anonymous harassment reporting platform for Indian workplaces/campuses

---

## Implementation Checklist

### Phase 1: Database Setup ✅

- [x] 1.1 Create organizations table
- [x] 1.2 Create identity_vault table
- [x] 1.3 Create cases table (core)
- [x] 1.4 Create case_messages table
- [x] 1.5 Create case_notes table
- [x] 1.6 Create evidence table
- [x] 1.7 Create user_roles table
- [x] 1.8 Create audit_logs table
- [x] 1.9 Create compliance_reports table
- [x] 1.10 Create legal_chunks table with pgvector

### Phase 2: Views & Functions ✅

- [x] 2.1 Create analytics_incident_trends view
- [x] 2.2 Create sla_alerts view
- [x] 2.3 Create reporting_courage_index view
- [x] 2.4 Create match_legal_sections() function
- [x] 2.5 Create update_updated_at() trigger
- [x] 2.6 Create check_sla_breach() trigger

### Phase 3: RLS Policies ✅

- [x] 3.1 Enable RLS on all tables
- [x] 3.2 Create hr_admin_select_cases policy
- [x] 3.3 Create hr_admin_update_cases policy
- [x] 3.4 Create hr_admin_messages policy
- [x] 3.5 Create hr_admin_notes policy
- [x] 3.6 Create compliance_officer_reports policy
- [x] 3.7 Verify identity_vault has NO policies (Edge Function only)

### Phase 4: Next.js Setup

- [x] 4.1 Install required npm packages
- [x] 4.2 Create /lib/supabase/client.ts
- [x] 4.3 Create /lib/supabase/server.ts
- [x] 4.4 Create /lib/supabase/middleware.ts
- [x] 4.5 Generate TypeScript types
- [x] 4.6 Create custom types (/types/justra.ts)

### Phase 5: Folder Structure

- [x] 5.1 Create /(victim) route group
- [x] 5.2 Create /(hr-admin) route group
- [x] 5.3 Create /(compliance) route group
- [x] 5.4 Create middleware.ts for route protection
- [x] 5.5 Create /supabase/migrations directory
- [x] 5.6 Create /supabase/functions directory
- [x] 5.7 Resolve App Router path collision between HR and Compliance dashboards

### Phase 6: Edge Functions

- [x] 6.1 Create triage Edge Function
- [x] 6.2 Create vault-access Edge Function
- [x] 6.3 Create token-auth Edge Function

### Phase 7: Testing & Seeding

- [ ] 7.1 Seed test organization
- [ ] 7.2 Create test hr_admin user
- [ ] 7.3 Verify RLS policies work
- [ ] 7.4 Test token-based victim auth
- [ ] 7.5 Test Aadhaar vault access logging

---

## Key Architecture Decisions

### Personas
1. **victim_anonymous**: Phone OTP only, text-only complaints
2. **victim_normal**: Phone OTP + Aadhaar, can upload evidence
3. **hr_admin**: Email + Password + MFA, full case management
4. **compliance_officer**: Read-only aggregated analytics

### Security Rules
- ✅ Phone numbers NEVER stored raw (Argon2id hash only)
- ✅ Aadhaar data isolated in encrypted identity_vault
- ✅ Victims have NO auth.users row (token pair = identity)
- ✅ identity_vault has ZERO direct access (Edge Function only)
- ✅ Compliance officer sees ZERO individual cases
- ✅ POCSO flag = mandatory police escalation

### Token System
- `token_public`: 8-char alphanumeric (e.g., JUST-4829) - shareable
- `token_secret`: 32-char hex - victim saves privately
- `token_secret_hash`: bcrypt stored in DB

---

## Technical Stack

- **Frontend**: Next.js with App Router
- **Backend**: Supabase (Auth, DB, Storage, Edge Functions)
- **DB**: PostgreSQL with pgvector extension
- **Auth**: Supabase Auth (Phone OTP + Email/Password + MFA)
- **Encryption**: Argon2id (phone), bcrypt (token), AES-256 (Aadhaar)
- **RAG**: Ollama + nomic-embed-text (768d) + BM25 hybrid
- **Package Managers**: npm (Next.js), uv (Python)

---

## Current Status

**Phase:** Phase 1-6 Complete ✅ + routing conflict hotfix applied  
**Next Action:** Seed test users and wire live Supabase dashboard queries  
**Blockers:** None (resolved: App Router route-group collision)

### Recent Update (2026-03-24)
- Fixed Next.js route collision causing `GET / 500` by moving dashboard pages to unique URL segments.
- Active staff routes are now explicitly namespaced and stable:
  - `/hr-admin/dashboard`
  - `/hr-admin/heatmap`
  - `/hr-admin/cases/[id]`
  - `/compliance/dashboard`
- Verified with production build: `npm run build` succeeds with all routes generated.

**Migration Files Created:**
- ✅ 001_create_organizations.sql
- ✅ 002_create_identity_vault.sql
- ✅ 003_create_cases.sql
- ✅ 004_create_supporting_tables.sql
- ✅ 005_create_views_functions.sql
- ✅ 006_enable_rls_policies.sql

---

## Notes & Decisions

### Migration Execution Order
1. Run migrations 001-006 in order in Supabase SQL Editor
2. Each migration is idempotent and can be run multiple times safely
3. Identity vault has ZERO RLS policies - access only via Edge Functions

### Next Steps
1. Seed one test organization and one hr_admin user
2. Add compliance_officer user and role row
3. Wire `/hr-admin/dashboard` and `/compliance/dashboard` to real Supabase queries
4. Implement victim OTP + token edge flow end-to-end
5. Enforce POCSO mandatory escalation in update APIs
6. Enable MFA for staff users in Supabase Auth settings
