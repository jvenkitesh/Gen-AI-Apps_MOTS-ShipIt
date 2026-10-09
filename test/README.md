# MOTS ShipIt Test Suite (Stage 5)

Three layers, in the same structure as ContractIQ's `test/` folder:

- **Unit tests** (Vitest, `unit/*.test.ts`) — the app's business logic imported directly
  (`@/lib/...`). No server, no network: a guard in `unit/setup.ts` lets fetch reach only
  `localhost`, so OpenAI, ShipStation and Supabase are stubbed. Runs in under a second.
- **API integration tests** (Vitest, `*.test.ts` in `auth/`, `loads/`, `negotiation/`,
  `control/`, `exceptions/`, `estimate/`, `audit/`) — live calls to the running app's routes
  and the dev Supabase project (`gunsbekosmitvudjpmgg`).
- **Browser E2E tests** (Playwright, `e2e/*.spec.ts`) — the real rendered UI: login form,
  redirects, the estimate chatbot, outreach from a load page.

Live external calls are kept to a few tests (decided at the start of Stage 5): the real
OpenAI model reads two carrier replies (`negotiation/`) and writes two estimate summaries
(`estimate/`, `e2e/estimate-chat-answers`), and those estimates call the **ShipStation
sandbox for rate estimates only**. Nothing ever books, confirms or buys a label on
ShipStation; `unit/shipstation-never-books.test.ts` fails if any ShipStation endpoint other
than `/v2/rates/estimate` or `/v2/carriers` appears in the app.

## Why a separate package.json

Test-runner dependencies (Vitest, Playwright) stay out of the app. Secrets are **not**
copied: everything reads `mots-shipit-ai/.env.local` (`helpers/env.ts`).

## Prerequisites

1. The app's dev server is running: `cd mots-shipit-ai && npm run dev` (port 3000, or set
   `TEST_APP_URL`). Integration tests stop at once with a clear message if it isn't.
2. `mots-shipit-ai/.env.local` has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `TMS_WEBHOOK_SECRET`, `OPENAI_API_KEY` and the ShipStation
   sandbox key. `OUTREACH_MODE` must stay `test` (it is the default).
3. `npm install` in this folder (first time only).
4. Playwright only: `npx playwright install chromium` (first time only).

## Running

```bash
npm run test:unit         # unit tests only (no server needed)
npm run test:integration  # live API tests
npm run test:e2e          # browser tests
npm run test:all          # everything: unit + integration, then browser
npm test                  # unit + integration

npm run test:negotiation  # one folder (also: auth, loads, control, exceptions, estimate, audit)
npx playwright test e2e/load-outreach-from-load-page.spec.ts   # one browser test
npx playwright show-trace test-results/.../trace.zip           # debug a browser failure
```

### Against the live site (Stage 6 smoke test)

```bash
export TEST_APP_URL=https://gen-ai-apps-mots-shipit-ai.netlify.app
npx vitest run --project integration auth/auth-login auth/auth-roles estimate/ loads/ negotiation/ control/ exceptions/ audit/
npx playwright test
```

Skip `auth/auth-rate-limit` against Netlify: there the limiter keys on Netlify's own client-IP
header, so every request from your machine shares one bucket and the test only locks you out
for a minute. The live site must have the same `TMS_WEBHOOK_SECRET` as `.env.local`.

Integration files run one at a time (`fileParallelism: false`): one shared dev project.
A full `npm run test:all` takes under 2 minutes, mostly the live OpenAI and ShipStation calls.

## Test data: what is created, and what stays

| Data | Created by | After a run |
|---|---|---|
| Role users `mots-shipit.e2e.<role>@example.com` (administrator not used yet; supply-chain-operations-manager, transportation-planner, compliance-analyst, viewer) | `helpers/testUser.ts` `roleUser()` | **Kept**, password replaced every run (none stored). A user who has paused anything can't be deleted (`control_actions.actor_id` is RESTRICT). |
| Throwaway users `mots-shipit.e2e.<label>.<id>@example.com` | `createEphemeralUser()` | Deleted by the test. |
| Allow-list entry for each new test address | `createConfirmedUser()` | Removed straight after the account is created. |
| Customer **E2E Test Customer (automated tests)** and its active policy (TN → any state, dry van/reefer, $100–$10,000, preferred/approved tiers, planners approve up to $800) | `helpers/fixtures.ts` `e2eCustomerId()` | **Kept**, reused. |
| Loads `E2E-<timestamp>-<id>` | TMS webhook (`createE2ELoad()`) | Deleted with their offers, outreach and exceptions — **except booked loads**, which can't be deleted by design (one per golden-path run). |
| Manual compliance checks (note starts with "E2E") | golden path, only if the carrier had no fresh check | Deleted, so the carrier doesn't look verified for 24 hours. |
| Audit events for every E2E load | database triggers | **Kept forever**: the audit log is immutable. |
| Load pauses | `control/` | Always resumed, even when a test fails. |

Remove the kept E2E data (booked `E2E-` loads, the E2E customer, the role users) together
with TEST-LOAD-0001/0002 and the demo customer before go-live. Audit rows stay.

## Test index

### `unit/` (no network)

| Test | Covers |
|---|---|
| `policy-engine` | Every eligibility gate; an empty or missing policy fails closed; all failing gates reported |
| `carrier-ranking` | Each exclusion reason; score weights; 30/90-day booking history; ties; duplicates |
| `estimate-parse-query` | Zip/state reading, question type, weight, glossary term, plain errors |
| `shipstation-estimate` | Total = shipping + insurance + confirmation + other; cheapest priced rate; error/timeout handling; request body |
| `shipstation-never-books` | Only the estimate and carrier-list endpoints exist in the app |
| `offer-extractor` | Rounding, evidence must be verbatim, confidence clamp, model failure → null (OpenAI stubbed) |
| `tms-adapter` | HMAC-SHA256 signature, idempotency key, TMS errors recorded never thrown |
| `control-plane` | Latest pause/resume wins; every scope blocks; other scopes don't |
| `outreach-message` | Disclosure first, UTC times, target rate and ceiling never sent; test mode by default |
| `input-validation` | Auth schemas and the TMS load payload, with their messages |
| `audit-describe` | Plain-language audit lines |
| `security-helpers` | Client IP precedence (Netlify header first), 429 shape, error responses never leak details |

### API integration (live)

| Test | Covers | Priority |
|---|---|---|
| `auth/auth-login` | Login sets the session cookie; same generic 401 for wrong password and unknown account; logout | **P0** |
| `auth/auth-signup` | Validation; an address not on the allow-list gets 403 and no account | **P0** |
| `auth/auth-rate-limit` | 10 attempts a minute per address, then 429 + Retry-After | P1 |
| `auth/auth-roles-and-protected-routes` | Every API route answers 401 without a session; role checks answer 403 | **P0** |
| `loads/loads-webhook-intake` | Webhook secret, validation, unknown customer, create / unchanged / new version, policy exception raised then superseded | **P0** |
| `loads/loads-unevaluated-fail-closed` | A load the Policy engine never checked can't be ranked or contacted; a TMS retry fixes it | **P0** |
| `negotiation/negotiation-booking-golden-path` | Ranking → test-mode outreach → batch wait → live AI reads replies → ceiling block → approval limit → fresh compliance (fail closed) → atomic booking, idempotent retry, no double booking → audit trail | **P0** |
| `control/control-pause-blocks-outreach` | Validation; a load pause blocks outreach (409 PAUSED); resume restores it | **P0** |
| `exceptions/exceptions-queue` | 4-hour SLA, soonest first, breached kept, escalate, resolve once | **P0** |
| `estimate/estimate-chatbot` | Validation; live answer picks the cheaper of routing guide and ShipStation | **P0** |
| `audit/audit-log-immutable` | No update or delete, even for the service role; events outlive their load; users read but can't write; Reports page shows the log | **P0** |

### `e2e/` (Playwright)

| Test | Covers | Priority |
|---|---|---|
| `unauthenticated-redirect` | Five pages redirect to /login when signed out | **P0** |
| `auth-login-redirects-to-dashboard` | Real login form → dashboard; wrong password message | **P0** |
| `estimate-chat-answers` | Ask a question, see the answer card and an ⓘ definition tooltip | **P0** |
| `load-outreach-from-load-page` | Planner contacts a carrier from the load page (test mode), sees the result and the audit trail | **P0** |

## What Stage 5 found and fixed

1. **Audit trigger broke every load status/version change** (Feature 9 regression):
   `malformed array literal: "status_changed"` on outreach, booking and new load versions.
   Fixed by migration `fix_audit_row_change_array_append`.
2. **An unchecked load could be contacted**: if saving the Policy engine result failed, the
   load stayed `sourcing` and could be ranked and contacted. Ranking and outreach now refuse
   loads with no `evaluated_at` (`loads-unevaluated-fail-closed`).
