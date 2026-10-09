# MOTS ShipIt — Security Plan (Stage 7)

**Date:** 2026-10-08 (PST) · **Branch:** `stage-7-security-foundation` · **Live site:** https://gen-ai-apps-mots-shipit-ai.netlify.app (no custom domain: mots-shipit.ai was not registered and the user chose not to buy it) · **Supabase project:** `gunsbekosmitvudjpmgg`

Method: `skills/security-foundation/SKILL.md`, read and followed by hand (it isn't available as a slash command here), in the same order as the ContractIQ Stage 7 session log: read the docs and specs → audit every route, the middleware and the database → run Supabase's advisors against the live project → build the missing controls → test → document.

Decisions made with the user at the start of Stage 7:
1. Every validation failure answers **422 VALIDATION_ERROR**, on every route including the TMS webhook (freight routes used to answer 400).
2. A carrier reply containing a prompt-injection pattern is **never sent to the AI**; it is kept and a person reads it (high-risk exception). A real carrier quote is never lost.
3. The Supabase **service-role key is rotated now**, in Stage 7 (it was pasted into a chat session during Stage 4).

---

## 1. Audit — what was already in place

| Area | Finding |
|---|---|
| Auth | Supabase email + password. Sign-up limited to an allow-list enforced by a database trigger (also applies to admin-created accounts). Test members skip email confirmation. Server-side `/api/auth/login` and `/api/auth/logout`. |
| Protected routes | `middleware.ts` sends signed-out visitors to `/login` from `/dashboard`, `/loads`, `/exceptions`, `/carriers`, `/policies`, `/estimate`, `/reports`, `/reset-password`; signed-in users on `/login`, `/signup`, `/forgot-password` go to `/dashboard`. Verified live in a browser (Stage 6). |
| API auth | Every API route except the auth routes and the TMS webhook calls `requireAuth()`, which reads the role fresh from `user_profiles` on each request; role lists per route (planners book, operations managers and administrators control, analysts check compliance, viewers read). |
| TMS webhook | Shared secret, compared in constant time. Outbound TMS write-back signed with HMAC-SHA256. |
| Database | All 21 tables have RLS on; anonymous users have no grants; signed-in users can only SELECT; every write goes through the server with the service role after the route's role check. All 9 database functions have a fixed `search_path` and none can be called by anonymous or signed-in users. The audit log can't be changed or deleted (no grant + guard triggers). |
| Secrets | No secret in the browser bundle: the live site's 11 JavaScript files were scanned for the service-role key, OpenAI key, ShipStation key and TMS secret (and the text `service_role`) — 0 matches. Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_APP_URL` are public. `SUPABASE_SERVICE_ROLE_KEY` is only read in `lib/supabase/admin.ts`. Logs record error codes and messages, never keys. |
| AI | System prompts already told the model that questions, glossary text and carrier replies are data, not instructions. Every number in an estimate is computed in code; the model writes only the sentence. The load's target rate and ceiling are never sent to the model or to carriers. |
| ShipStation | Estimate-only (`/v2/rates/estimate`, `/v2/carriers`); a test fails if any booking endpoint appears. |

## 2. Issues found and fixed

| # | Issue | Severity | Fix |
|---|---|---|---|
| 1 | No prompt-injection guard: estimate questions and pasted carrier replies (outside text) went straight to OpenAI. | High | `lib/security/promptInjectionGuard.ts` `sanitizeForLLM()`: strips invisible characters, then detects "ignore previous instructions", "override rules", "reveal system prompt", "show API keys / env variables", "you are now / pretend you are / act as an AI…", "jailbreak / DAN / developer mode", fake `system:` turns. Estimate → `400 PROMPT_INJECTION`, no AI call. Carrier reply → not sent to the AI; reply kept; `suspected_prompt_injection` high-risk exception (5-minute SLA); audit event `offer.injection_suspected`. Prompts also say never to reveal instructions, environment variables, keys or database contents. |
| 2 | Rate limits defined but unused for estimates (30/min) and bookings (5/hour); none on reset-password or carrier replies. | Medium | Wired per `specs/auth-rbac.md`: `estimate` 30/min and `booking` 5/hour per user, `auth` 10/min per IP on reset-password, new `carrier_reply` 30/min per user (each reply is an AI call). |
| 3 | The new `carrier_reply` limit was rejected by the database's allowed-actions check, so the limiter (which fails open) would have silently not limited replies. Caught in testing before shipping. | Medium | Migration `stage7_security_baseline` widens the check; test proves the 31st reply in a minute gets 429. |
| 4 | Validation errors were 400 on freight routes and 422 on auth routes. | Low | All validation goes through `lib/security/inputValidator.ts` (`parseBody`, `validationErrorResponse`): **422 VALIDATION_ERROR** with the field name, on every route. `UNKNOWN_CUSTOMER` and `NO_LOCATION` are 422 too. |
| 5 | Request schemas were written inline in each route. | Low | Centralized in `inputValidator.ts` (auth, estimate, outreach, carrier reply, offer response, booking, compliance, exception, control action; TMS payload re-exported from `loadIntake.ts`). |
| 6 | No anti-framing or referrer headers (clickjacking possible). | Medium | `next.config.mjs`: `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation, payment, usb off), `X-Content-Type-Options: nosniff`, no `X-Powered-By`. Netlify already sends HSTS. |
| 7 | Size limits for AI inputs scattered as literals. | Low | `lib/security/tokenLimiter.ts`: question 500 chars, carrier reply 4,000 chars, summary 200 tokens, extraction 300 tokens, history panel 20 items. |
| 8 | Service-role key was pasted into a chat session (Stage 4). | High | Rotate now (user action, steps in §6). |

Earlier stages already fixed, and Stage 5 tests cover: the audit-trigger bug that broke load updates, and unchecked loads being contactable (fail closed).

## 3. Skill items that don't apply to ShipIt (logged in `CLAUDEchecklist1.md`)

- **Chat security / `chatSecurity.ts`:** ShipIt has no chat sessions or per-user documents. Data belongs to one organization; access is by role (`requireAuth(roles)`), and estimate history is limited to its owner by RLS.
- **File upload security:** ShipIt has no file uploads.
- **`MAX_CHAT_HISTORY`:** no conversation history is ever sent to the model (one question or one reply per call); the variable is unused and the example file says so.
- **Protected-route list** (`/contracts`, `/chat`, `/settings`, `/profile`): those pages don't exist here; ShipIt's own pages are protected (table above).

## 4. Files

**Created:** `mots-shipit-ai/lib/security/promptInjectionGuard.ts`, `mots-shipit-ai/lib/security/tokenLimiter.ts`, `mots-shipit-ai/supabase/rls-policies.sql`, `docs/security/security-plan.md`, `test/unit/prompt-injection-guard.test.ts`, `test/security/security-controls.test.ts`.

**Changed:** `lib/security/inputValidator.ts`, `lib/security/rateLimiter.ts`, every API route that takes a body (`auth/*`, `estimate`, `loads/[id]/{outreach,replies,book}`, `offers/[id]/respond`, `carriers/[id]/compliance`, `exceptions/[id]/resolve`, `control`, `loads/webhook`), `estimate/history`, `lib/freight/negotiation.ts`, `lib/freight/exceptions.ts`, `lib/freight/audit.ts`, `lib/ai/offerExtractor.ts`, `lib/ai/estimateComposer.ts`, `next.config.mjs`, `supabase/rate_limit_events.sql`, `.env.local.example`, tests that asserted 400.

## 5. SQL

`mots-shipit-ai/supabase/rls-policies.sql` — idempotent paste-and-run baseline: RLS on every table, no anonymous access, service-role-only tables, the rate-limit action list, audit log write revokes, function execute revokes. **Already applied** to `gunsbekosmitvudjpmgg` as migration `stage7_security_baseline`; run it again on any new environment.

## 6. Environment variables and dashboard settings

No new variables. Actions for the user:

1. **Rotate the service-role key** (Supabase → Project Settings → API Keys → roll the `service_role` / secret key). Then put the new value in `mots-shipit-ai/.env.local` and in Netlify (`SUPABASE_SERVICE_ROLE_KEY`), and redeploy. Never paste it into a chat.
2. **Enable leaked-password protection** (Supabase → Authentication → Policies/Passwords): the only WARN left on the security advisor.
3. **Check Auth settings:** email confirmation on; redirect URL `https://gen-ai-apps-mots-shipit-ai.netlify.app/**` allowed, Site URL `https://gen-ai-apps-mots-shipit-ai.netlify.app`; refresh-token rotation on (default).
4. **Netlify:** `NEXT_PUBLIC_APP_URL` must be `https://gen-ai-apps-mots-shipit-ai.netlify.app` (never `localhost`).

## 7. Verification

- Unit: 103 passing (guard: 15 attack patterns caught, 8 normal freight texts allowed, invisible-character bypass caught).
- Live API: all integration tests passing, including `security/security-controls` (headers, injected estimate refused before any AI call, injected carrier reply held for a person with no offer created, estimate / booking / carrier-reply limits answering 429).
- Supabase security advisor after the migration: only the expected INFO (3 service-role-only tables with no policies, by design) and the leaked-password WARN (dashboard setting, item 6.2).

## 8. Outstanding (not fixed here, tracked)

- Webhook rate limit: none until a real TMS is chosen (spec).
- Rate limiter fails open if Supabase is unreachable, by design (an outage must not lock everyone out); errors are logged.
- On Netlify, all users behind one office IP share the 10/min auth bucket.
- Performance advisor (INFO only): 22 unindexed foreign keys, 9 unused indexes — a later performance pass.
- Signed-in users can read carrier contacts (email/phone): fine for one organization; revisit if outside users get accounts.
- Go-live: remove E2E/TEST data and test users; switch `OUTREACH_MODE` only after the provider and legal decisions; inbound reply webhooks will need their own signature checks.
