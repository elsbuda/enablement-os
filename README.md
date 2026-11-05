# Enablement OS

Annual-subscription business software for owner-led South African companies (10–100 staff).
Four connected workspaces: Business Health Check, Strategy and Growth Plan, 90 Day Execution, CEO Scorecard.

## Status (5 November 2026)

| Part | State |
|---|---|
| Database schema (17 tables) and row-level security | Done, proven by `npm run db:test` (17 checks on real Postgres) |
| Template catalogue with publication guard | Done; unconfirmed templates cannot be published (database constraint) |
| Scoring engine (declarative rules, Health Check) | Done, `npm test` (9 tests) |
| Sign-in / create account (Supabase Auth) | Built; needs a Supabase project to run |
| Company context (versioned) | Built |
| Business Health Check (48 statements, 8 areas, results, history) | Built |
| Strategy and Growth Plan, 90 Day Execution, CEO Scorecard, quarterly review | Not started |
| Paystack billing | Not started (trial subscription is created on sign-up) |

Nothing here is production-ready until it has run against a real Supabase project with a real user.

## Stack (pinned, verified 5 Nov 2026)

Next.js 16.4.3 · React 19.3.1 · TypeScript 5.9.3 · @supabase/supabase-js 2.118.0 · @supabase/ssr 0.12.7 · zod 4.1.12 · vitest 3.2.4

## Set up

1. Create a Supabase project (region: closest available to Johannesburg). In **Authentication → Providers**, keep Email enabled.
2. In the SQL editor run `supabase/migrations/0001_schema.sql`, then `0002_rls.sql`.
3. Copy `.env.example` to `.env.local` and fill in the project URL, anon key and service role key (Settings → API).
4. `npm install`
5. `npm run templates:seed` — publishes Health Check v1 (original) and stores Priorities and Targets v1 in **review** (toolkit-derived; blocked from publishing until a licence reference is filed).
6. `npm run dev` and open http://localhost:3000. Create an account, create the company, run the Health Check.

## Checks

- `npm run db:test` — isolation and guard checks against local Postgres (`DATABASE_URL`).
- `npm test` — engine unit tests.
- `npm run typecheck`, `npm run build`.

## Rules the code enforces

- Every customer table carries `company_id`; RLS allows reads to accepted members only and writes to editor/admin/owner, and only while the subscription is `trial` or `active` (lapsed = read-only).
- Seat limit: accepted non-viewer memberships cannot exceed the package's seats (trigger).
- Templates: `publication_status = published` requires `permission_status = original`, or `licensed_confirmed` with a `licence_reference`. Rules may only use `sum, avg, min, max, count_if, band, diff, ratio, map`. No code from uploaded files is ever executed.
- Source toolkit files are never served to customers; `downloadable_source` defaults to false.

## Layout

```
app/(auth)/sign-in        sign in / create account (server actions)
app/(app)/setup           company context, versioned
app/(app)/health-check    questionnaire by area; results; history
app/(app)/home            dashboard
lib/engine/rules.ts       declarative rules runner
lib/engine/health-check.ts scoring and suggested priorities
lib/templates/            tool definitions (TS source + exported JSON)
lib/supabase/server.ts    per-request client (RLS) and service client (staff)
proxy.ts                  session refresh and sign-in redirect
supabase/migrations/      schema and RLS
scripts/                  db-test, seed-templates, export-templates
```
