# MOTS ShipIt: Build Playbook and Session Log, Stages 1 to 7 (2026-10-08)

**Status:** all seven stages are done. The app is live at https://gen-ai-apps-mots-shipit-ai.netlify.app, 195 automated tests pass, and the last tag is `stage-7-complete`.

**Use this document to build the next app of this kind with Claude.** Part A is the reusable playbook: the pipeline, the questions to settle up front, the standing rules and the runbooks for deploy, testing and security. Part B is the record of this build: what was decided, what broke and how it was fixed, every commit, tag and migration. Part C is the go-live list and the references.

**Repo:** github.com/jvenkitesh/Gen-AI-Apps_MOTS-ShipIt · **App folder:** `mots-shipit-ai/` · **Tests:** `test/` · **Supabase:** project `mots-shipit-ai` (ref `gunsbekosmitvudjpmgg`, us-east-2, free plan) · **Netlify:** project `gen-ai-apps-mots-shipit-ai` · **Sibling project:** ContractIQ (`Gen-AI-Apps_MOTS_contract_scout_ai`), whose session log is the step order this build followed.

*Sources: commit hashes, tags, PR numbers and migration names were read from git, GitHub and Supabase while writing. This document replaces the earlier log "MOTS ShipIt — Session Log: Stage 3 Frontend + Stage 4 System Design and Features 1–4", whose content is included in Part B.*

---

# Part A. The playbook

## A1. The pipeline at a glance

| Stage | Input | Output | Gate |
|---|---|---|---|
| 1 Engineering plan | PRD | `docs/engineering/engineering-doc.md`, `implementation-specs.md` | User approves |
| 2 Implementation specs | Stage 1 docs | `specs/*.md`, `supabase-schema.sql`, `.env.local.example` | User approves; commit, tag `stage-2-complete` |
| 3 Frontend setup | Specs | Next.js 14 app in its own folder (`mots-shipit-ai/`), design tokens, route skeleton, auth middleware | PR, merge, tag `stage-3-complete` |
| 4 System design + features | Specs | Supabase schemas, then one feature at a time | Per feature: build, test live, commit, tag, push (auto mode) |
| 5 Testing | Built features | `test/` suite: unit, live API, browser | All pass; tag `stage-5-complete` |
| 6 Deploy | Passing suite | Live Netlify site, smoke-tested | Tag `stage-6-complete` |
| 7 Security | Live app | `docs/security/security-plan.md`, `supabase/rls-policies.sql`, `lib/security/` | Branch, PR, merge, tag `stage-7-complete` |

Run the whole build in one Claude Code session per stage group if possible. Long sessions get summarized; the memory files and this document carry the decisions across.

## A2. Standing rules (the user's preferences, apply from the first prompt)

1. **Follow the steps in order.** `CLAUDE.md` stages plus the ContractIQ session log are the sequence. Never reorder steps or pull later-stage work forward without asking ("This is the steps we are following. Do not change the steps unless I tell you.").
2. **Stop at every stage gate** and ask the exact question `CLAUDE.md` gives ("Ready to move to Stage N?").
3. **Auto mode for features.** Once a feature plan is agreed, build, test, commit, tag and push without per-step check-ins.
4. **Git process for every milestone:** commit with a "where we are" description, annotated tag `stage-<n>-<what-was-done>` in full words, push the commit, push the tag. Stage gates that change structure (Stage 3, Stage 7) go through a branch, PR and regular merge. If asked to "tag and push" when nothing changed, verify local and GitHub match and say so; never create a duplicate tag.
5. **Ask clarifying questions freely** (AskUserQuestion), with a recommended option first. Batch up to four. If the user rejects the question to clarify, ask in plain text what they want to clarify.
6. **Names in full words:** no abbreviations, no "and" or "&" in schema names (`warehouse_management`, never `wms`).
7. **Mirror the sibling project's structure** (ContractIQ) for layout questions instead of asking.
8. **Secrets:** never print, commit or copy them into chat. Copy keys file to file. If a key is pasted into chat, rotate it (done in Stage 7). To give the user many values for a dashboard, write a private file (mode 600) in the scratchpad and have them run `! pbcopy < file`, then delete the file.
9. **Leave stray files alone** (here: the ContractIQ `.docx`, `docs/.Rhistory`). Never stage them.
10. **UI copy:** every label ends with an ⓘ that explains it; every spinner and in-progress state says "Transmogrifying…". The policy engine is called "Policy engine".
11. **ShipStation is estimate-only.** Never book, confirm or buy a label; report the cheapest total as the best choice. A test enforces this.
12. **Supabase writes need an Accept click** that expires fast. Avoid `DROP`, `DELETE`, `UPDATE` keywords in migrations when an `if not exists` form works; when one is needed, tell the user before the call.

## A3. Decision sheet: questions to settle at the start

Answer these in the first prompt next time and most of the build runs without stopping. The answers this project used are in the right column.

### Product and tenancy

| Question | MOTS ShipIt answer |
|---|---|
| Who uses it: one organization, or a broker serving clients? | One organization running its own supply chain. No `organization_id`; the variable dimension is geography. |
| Geography codes? | `NA` North America, `EMEA` Europe, `APLA` Pacific Asia. |
| Domains to plan for now, even if built later? | Six Postgres schemas: `data_foundation`, `master_data_management`, `order_management`, `warehouse_management`, `transportation_shipment`, `operational_excellence_governance`. |
| What belongs where? | Master data: customers, suppliers. Data foundation: users, facilities, items, carriers, geographies. Lanes and locations are warehouse-floor terms (warehouse management). The routing guide stays in transportation. |
| Industry terms to keep as-is? | "Routing guide" (never "routes"); "Policy engine". |
| Meaning of ambiguous data fields? | `weight_lbs` in the routing guide JSON was freight cost in dollars; renamed `freight_cost_dollars` and `weight_break`. |

### Stack and accounts

| Question | Answer |
|---|---|
| App folder name and layout | `mots-shipit-ai/` next to `docs/`, like ContractIQ's `contractiq/`; specs in `mots-shipit-ai/specs/`, SQL in `mots-shipit-ai/supabase/`, env example `mots-shipit-ai/.env.local.example`. |
| Database | Supabase, new project `mots-shipit-ai`, us-east-2, free plan. |
| Language model | OpenAI `gpt-4o-mini`, reusing the ContractIQ key. |
| Hosting | Netlify, new project in the same team as ContractIQ, named `gen-ai-apps-mots-shipit-ai`. Custom domain MOTS-ShipIt.AI later. |
| External APIs | ShipStation v2 sandbox key (`TEST_…`), estimates only. |
| Production database | Same Supabase project as development for the first deploy. |

### Auth and roles

| Question | Answer |
|---|---|
| Roles | `administrator`, `supply_chain_operations_manager` (default), `transportation_planner`, `compliance_analyst`, `viewer`. |
| Who may sign up | Company domain allow-list (domain still to be given) plus listed emails. |
| Email confirmation | Required, except test members (created already confirmed). |
| Password reset | Included. |

### Features and behaviour

| Question | Answer |
|---|---|
| Best estimate choice | Cheapest total between routing-guide cost and ShipStation's cheapest rate. |
| Cache and log sizes | Estimate cache valid 24 hours; enquiry and freight-amount logs keep the newest 200 rows. |
| Outreach provider, carrier contacts, legal sign-off | Not answered; built with defaults: `OUTREACH_MODE=test`, simulated sends or the user's own test email. Real carriers are never contacted until decided. |
| Carrier replies | Pasted by a user until inbound webhooks exist. |
| Compliance | Fail closed: no fresh check (24 h) blocks approval and booking. FMCSA when `FMCSA_WEB_KEY` and a USDOT number exist, otherwise a manual check by an analyst. |
| Seed data | Carriers seeded from the routing guide; a test customer with an active policy. |

### Testing, deploy and security (Stages 5 to 7)

| Question | Answer |
|---|---|
| Test data in a shared database | Labelled data: loads prefixed `E2E-`, one E2E customer, one permanent user per role. Booked loads and audit rows can't be deleted and stay until go-live cleanup. |
| Live external calls in tests | A few tests only (OpenAI, ShipStation sandbox); unit tests stub them. |
| Netlify: new project or reuse | New project in the same team. Reusing the sibling's project would replace that live site. |
| Validation status code | `422 VALIDATION_ERROR` on every route, with the field name. |
| Prompt injection in outside text | User questions: refuse with 400. Carrier replies: never sent to the AI, kept, and held for a person (high-risk exception). |
| Key rotation | Rotate the service-role key during Stage 7. |

## A4. Stage runbooks

### Stage 1 and 2: plan and specs

- The `skills/*/SKILL.md` files are not slash commands in this environment. Read each one and follow it by hand.
- `engineering-planner` defines only `engineering-doc.md`; produce `implementation-specs.md` with the `implementation-specs` method pointed at one file.
- Keep "As built" sections in each spec up to date as features land.

### Stage 3: frontend

- Next.js 14.2 App Router, TypeScript, Tailwind mapped to `docs/design.md` tokens, Supabase SSR client plus a service-role admin client, TanStack Query, Zod.
- Put the app in its own folder; add a root `netlify.toml` from the start (see the Stage 6 runbook).
- Deliver through a PR.

### Stage 4: system design, then features

1. Design the data model by domain first, as a visual proposal the user can react to (an artifact worked well), then create the schemas.
2. **Expose every custom schema** in Supabase (Integrations → Data API → Settings → Exposed schemas). Symptom when missing: `PGRST106 Invalid schema`, and the header shows the email instead of the name and role.
3. Per feature: read the spec, tell the user the files, build, verify live against Supabase, update the spec's "As built", commit, tag, push.
4. Database patterns that worked:
   - RLS on every table; signed-in users read, the service role writes after the route's role check.
   - `SECURITY DEFINER` functions with `search_path = ''`, execute revoked from `public`, `anon`, `authenticated`.
   - Atomic booking in a Postgres function: row lock, unique idempotency key, partial unique index for one active booking per load.
   - Audit rows written by triggers in the same transaction; the audit table is immutable (no update or delete grant plus guard triggers).
   - Control-plane pauses checked in every write path (`assertNotPaused`).
5. In PL/pgSQL, append to an array with `array_append(arr, 'value')`, never `arr || 'value'` (Postgres reads the bare literal as an array and every update fails with "malformed array literal").
6. Every database CHECK list must include any new value the code sends. The rate limiter fails open, so a rejected value silently means "no limit".

### Stage 5: testing

- Same layout as ContractIQ: a sibling `test/` folder with its own `package.json` (Vitest 5.0.3, Playwright 1.64.0, `@supabase/ssr` 0.5.2, `@supabase/supabase-js` 2.117.3, dotenv), reading secrets from `mots-shipit-ai/.env.local`.
- Three layers: `unit/` (app modules via the `@/` alias; a fetch guard allows only localhost), live API tests per feature folder, `e2e/` Playwright specs.
- Test users: the sign-up allow-list trigger also applies to admin-created users, so the helper adds the address to the allow-list for the moment of creation and removes it. Sign in through `@supabase/ssr` with an in-memory cookie jar to avoid the 10-per-minute login limit.
- A user who has created a control action can't be deleted (foreign key RESTRICT), so use permanent role users and throwaway users only where safe.
- For each bug found, write a regression test and prove it fails without the fix (temporarily stash the fix and rerun).
- Run against the live site with `TEST_APP_URL=…`; skip the IP rate-limit test there (Netlify's client-IP header puts all your requests in one bucket).

### Stage 6: deploy to Netlify (click-by-click)

1. Run `npm run build` locally (stop the dev server first: both use `.next`).
2. Commit a root `netlify.toml`: `base` = app folder, `command = "npm run build"`, `publish = ".next"`, plugin `@netlify/plugin-nextjs` (also a devDependency). Without the plugin every route returns 404.
3. List non-secret settings in `SECRETS_SCAN_OMIT_KEYS` (values like `test`, `10`, `gpt-4o-mini`, a zip code appear in the repo and fail the build with "Exposed secrets detected"). Keep real secrets scanned.
4. In Netlify: same team as the sibling project → **Add new project** → **Import an existing project** → **GitHub**. Do not use drag-and-drop (static upload; no server functions).
5. If the repo is missing from the list: **Configure the Netlify app on GitHub** → Repository access → add the repo → Save → reload Netlify. Giving access does not create the project; you still import it.
6. Set the project name, branch `main`, leave build fields to `netlify.toml`.
7. Environment variables: **Add a variable → Import from a .env file**, all scopes. Set `NEXT_PUBLIC_APP_URL` to the live address (a raw `.env.local` import brings `localhost`). Skip empty variables.
8. **Trigger deploy** after any variable change (variables apply only to builds started after they're saved). Use "Clear cache and deploy" when in doubt.
9. If the project shows **Private**, click **Make public** (otherwise every page is a 401 "Login Redirect").
10. Supabase → Authentication → URL Configuration → Redirect URLs: add `https://<site>.netlify.app/**`.
11. Smoke test with curl and the test suite against the live URL.

**Deploy failures and their meaning (all seen on this build or ContractIQ's):**

| Symptom | Cause | Fix |
|---|---|---|
| Netlify "Site not found" | No project at that address (not created, or a different name) | Create or rename the project |
| 401 "Login Redirect" on every page | Project is Private | Make public |
| 404 on every route | Next.js runtime plugin missing | `netlify.toml` plugin |
| 500 "Your project's URL and Key are required…" | `NEXT_PUBLIC_SUPABASE_*` missing at build time | Add variables, redeploy |
| Webhook 503 `NOT_CONFIGURED` | `TMS_WEBHOOK_SECRET` or service key missing at runtime | Add, check Functions scope, redeploy |
| "Exposed secrets detected" build failure | A non-secret value appears in the repo | `SECRETS_SCAN_OMIT_KEYS` |
| Fix "deployed" but nothing changed | No new deploy published | Check the response header `age` (seconds since the cached build); compare with the publish time |

### Stage 7: security

Follow `skills/security-foundation/SKILL.md` by hand, in this order: audit (every route, middleware, database grants and functions, Supabase security and performance advisors, the live browser bundle for leaked keys, response headers) → ask the user the decisions in A3 → build → test → document → branch, PR, merge, tag → watch the deploy → live smoke test.

The skill is written for a chat-and-upload app; log what doesn't apply (chat ownership, uploads, `MAX_CHAT_HISTORY`, its route list) in `CLAUDEchecklist1.md` instead of building it.

## A5. Kickoff prompt for the next build

Paste into a new Claude Code session in the new repo (adjust the bracketed parts):

> Build [product] from [PRD path] using this repo's CLAUDE.md 7-stage workflow. Follow the playbook in [this Google Doc / docs/session-logs/2026-10-08-full-build-playbook-stages-1-7.md] and the ContractIQ and MOTS ShipIt session logs; do not reorder steps. Pre-answered decisions: [paste the A3 tables with your answers]. Standing rules: [A2]. Ask me AskUserQuestion questions for anything not covered, recommended option first. After each stage, stop and ask to continue. In Stage 4 build features in auto mode: for each feature build, test live, commit, annotated tag `stage-4-feature-<n>-<name>`, push commit and tag. Never print or commit secrets.

---

# Part B. What happened on this build

## B1. Timeline (2026-10-08, Pacific time)

| Time | Milestone | Commit | Tag |
|---|---|---|---|
| 08:15 | Stages 1 and 2 committed | 1c06f27 | stage-2-complete |
| 08:46 | Stage 3 scaffold (PR #2) | 14d54d1 / 63c0d27 | stage-3-complete |
| 11:12–11:56 | Routing guide table, geography, load-estimate tables | 8f98885, 29eaaa4, 02a37e0 | stage-4-routing-guide-knowledge-base, stage-4-system-design-complete |
| 12:16 | Feature 1 login, sign-up, password reset | 0eb1e6f | stage-4-feature-1-login-signup |
| 12:29 | Feature 2 load-estimate chatbot | 50c8329 | stage-4-feature-2-load-estimate-chatbot |
| 12:51 | Feature 3 load intake and Policy engine | 8be8194 | stage-4-feature-3-load-intake-policy-engine |
| 13:19 | Feature 4 carrier ranking | 9a290fd | stage-4-feature-4-carrier-ranking |
| 13:22 | Test members skip confirmation | 2795144 | stage-4-feature-1-test-members-skip-confirmation |
| 13:38 | Close stale exceptions on a new load version | cc535a8 | stage-4-feature-3-supersede-stale-exceptions |
| 13:47 | First session log | 1a1bdcc | stage-4-session-log-2026-10-08 |
| 16:05 | Feature 5 carrier outreach | 4be5ebc | stage-4-feature-5-carrier-outreach |
| 16:15 | ShipStation aligned with the Rate Shopping guide | cc0746c | stage-4-feature-2-shipstation-rate-shopping-alignment |
| 16:22 | Feature 6 negotiation and compliance | e8b2b96 | stage-4-feature-6-negotiation-compliance |
| 16:27 | Feature 7 atomic booking and TMS write-back | e65ab4f | stage-4-feature-7-atomic-booking-tms |
| 16:32 | Feature 8 exception queue and control plane | bd87f2d | stage-4-feature-8-exceptions-control-plane |
| 16:37 | Feature 9 audit log | 0f25324 | stage-4-feature-9-audit-log, stage-4-complete |
| 17:03 | Stage 5 test suite and two fixes | 3d4e591 | stage-5-complete |
| 17:31 | Netlify secrets-scan settings | 27e8101 | — |
| 19:09 | Stage 6 deployed and smoke-tested | d24fbca | stage-6-complete |
| 19:29 | Stage 7 security (PR #3) | dfbb4c5, merge b628e9f | stage-7-complete |

## B2. Stages 1 to 3

- Product: MOTS ShipIt, agentic freight sourcing and booking, defined by `docs/MOTS ShipIt.docx_PRD_OLD.pdf` (current despite the name).
- Stage 1 decided Supabase Auth and database, Netlify hosting, a generic TMS adapter, voice deferred. Stage 2 produced nine spec files, `supabase-schema.sql` and the env example.
- Stage 3 mirrored ContractIQ: the app in `mots-shipit-ai/`, specs and data inside it, a root `netlify.toml`. Next.js 14.2.35, Tailwind on design tokens, placeholder pages for every console route, auth middleware.

## B3. Stage 4 system design

- The user asked to design for a larger supply chain product, not only load estimates. The "ShipIt Data Domains" artifact went through several rounds: domain renames ("Governance & Control" became Operational Excellence and Governance; core reference data merged into Data Foundation), full names only, carriers in Data Foundation, lanes and locations in Warehouse Management, routing guide in Transportation.
- Routing guide table: 52 North America entries, 50 states, 7 carriers; a generator script upserts from the JSON in one transaction and rolls back if fewer than 52 entries remain.
- Load-estimate tables: `load_transit_freight_amount` (ShipStation rates plus the matching routing-guide entry; newest 200), `load_estimate_cache` (24 h), `load_estimate_enquiries` (newest 200, users read their own).

## B4. Stage 4 features

| Feature | What it does | Notable decisions and fixes |
|---|---|---|
| 1 Login, sign-up, reset | Supabase email/password, roles, allow-list trigger, test members, auth rate limit 10/min per IP | Rate limit keyed `ip:`/`user:` (ContractIQ risk 001). Pulled forward from Stage 7; the user kept it. |
| 2 Load-estimate chatbot | Routing guide + ShipStation estimate + Unisco glossary; cheapest total wins; OpenAI writes only the sentence | Switched from Anthropic to OpenAI. Fixed: cache ignored weight; glossary returned a generic blurb. Later aligned with the Rate Shopping guide: `carrier_ids` always sent (from env or `GET /v2/carriers`, cached 1 h), total = shipping + insurance + confirmation + other; sandbox key `TEST_…` uses the same base URL and offers UPS, FedEx and USPS. Live: 10 lb gave USPS Priority $9.92; 150 lb gave FedEx Ground $534.21. |
| 3 Load intake + Policy engine | TMS webhook (shared secret, constant-time), versions, policy check, exceptions with 4-hour SLA | Rename to "Logistics engine" reverted at the user's request. Fixed: new version closes stale exceptions. |
| 4 Carrier ranking | Carriers seeded from the routing guide; deterministic score; every excluded carrier listed with a reason | Test customer "Test Customer (demo)" with an active policy. |
| 5 Outreach | Contact the next N ranked carriers by email/SMS; batch wait 30 min; frequency cap; disclosure text; STOP opt-out | Provider, contacts and legal questions unanswered, so built in test mode (simulated or the user's test email). Fixed: UTC times in messages; batch wait counts only sent messages. |
| 6 Negotiation + compliance | Pasted carrier replies read by OpenAI into offers; ceiling enforced in code; approve/counter/reject; FMCSA or manual compliance, fail closed | Low-confidence reading (<0.8) raises a 5-minute exception. Target rate and ceiling never sent to the model or carriers. |
| 7 Atomic booking + TMS | `commit_booking()` with lock, idempotency key and one-active-booking index; HMAC-signed TMS write-back; booking stands if the TMS fails | Two simultaneous requests: one booking, one `BOOKING_ALREADY_BOOKED`. |
| 8 Exceptions + control plane | Queue with SLA countdown, breached kept; pause/resume/override/cancel by scope (global, customer, load, lane, agent, channel) | Pauses enforced in every write path. |
| 9 Audit log | Immutable `audit_events`, written by triggers; extra events for stale-compliance blocks and which model read a reply; trail on load pages and Reports | Trigger bug found in Stage 5 (B5). |

## B5. Stage 5 testing

- Decisions: labelled E2E test data in the shared database; live OpenAI and ShipStation in a few tests.
- Result at the end of Stage 5: 164 tests passing (79 unit, 76 live API, 9 browser).
- **Bug 1, from Feature 9:** the audit trigger used `events || 'status_changed'`, so every load status or version change failed with "malformed array literal". Outreach, booking and new load versions had been broken since Feature 9; the Feature 9 check had only tried a control-action insert. Fixed with `array_append` (migration `fix_audit_row_change_array_append`).
- **Bug 2:** intake saves the load as `sourcing` before saving the Policy engine result; if that second write failed, an unchecked load could be ranked and contacted. Ranking and outreach now refuse loads with no `evaluated_at` (409); a TMS retry re-checks and unblocks them. The regression test fails without the fix.
- Guard added during Stage 5 at the user's reminder: ShipStation is estimate-only, enforced by `unit/shipstation-never-books.test.ts`.

## B6. Stage 6 deploy

What happened, in order, and what to do faster next time:

1. Production build passed locally; `netlify.toml` extended with non-secret keys in `SECRETS_SCAN_OMIT_KEYS` before the first deploy (prevented ContractIQ's "Exposed secrets" failure).
2. Clarifications: the user pointed at ContractIQ's Netlify project meaning "reuse its setup"; the answer was a new project in the same team. Name chosen: `gen-ai-apps-mots-shipit-ai`.
3. The project didn't exist at first ("Site not found"): the repo needed adding to the Netlify GitHub app's repository access, then importing.
4. First deploy was Private (401 Login Redirect) → made public.
5. Pages 500 with the Supabase URL/key error: variables weren't set. The user imported `.env.local` and redeployed.
6. Webhook 503 `NOT_CONFIGURED`: `TMS_WEBHOOK_SECRET` took effect only after another deploy. The response header `age` showed when no new deploy had published.
7. Smoke test passed: pages, auth gates, 29 + 44 live API tests, 9 browser tests.

## B7. Stage 7 security

- Audit baseline was good: 21 tables with RLS, no anonymous grants, signed-in users read-only, all 9 functions pinned and not callable by users, no secret in the 11 live JavaScript files.
- Built: prompt-injection guard (estimate 400; carrier reply held for a person), rate limits (estimate 30/min, booking 5/hour, carrier reply 30/min per user; reset-password 10/min per IP), 422 everywhere via shared schemas, anti-framing and referrer headers, `tokenLimiter.ts`, `rls-policies.sql` (migration `stage7_security_baseline`), `docs/security/security-plan.md`, checklist items 13 to 19.
- **Caught before shipping:** the database rejected the new `carrier_reply` rate-limit action; the limiter fails open, so replies would have had no limit. The migration widened the allowed list; a test proves 429.
- Tests: 195 passing (103 unit, 83 live API, 9 browser); live after merge: 80 API and 9 browser tests passed.
- Still for the user: rotate the service-role key; enable leaked-password protection.

## B8. Supabase migrations (18, in order)

1. create_transportation_shipment_routing_guide
2. seed_transportation_shipment_routing_guide
3. add_geography_to_routing_guide
4. create_load_transit_freight_amount
5. create_load_estimate_cache_and_enquiries
6. create_user_profiles_and_signup_access
7. create_rate_limit_events
8. create_loads_customers_policies_exceptions
9. create_carriers_seeded_from_routing_guide
10. seed_test_customer
11. add_test_member_flag_to_allowed_signup_emails
12. create_carrier_interactions
13. create_carrier_offers_and_compliance_checks
14. create_carrier_bookings
15. create_control_actions
16. create_audit_events
17. fix_audit_row_change_array_append
18. stage7_security_baseline

## B9. Environment variables

| Variable | Kind | Note |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY | Public | Baked in at build time |
| NEXT_PUBLIC_APP_URL | Public | Live address in Netlify, localhost locally |
| SUPABASE_SERVICE_ROLE_KEY | Secret | Only in `lib/supabase/admin.ts`; rotate |
| OPENAI_API_KEY, OPENAI_MODEL | Secret, setting | gpt-4o-mini |
| SHIPSTATION_API_KEY, SHIPSTATION_FROM_POSTAL_CODE, SHIPSTATION_CARRIER_IDS | Secret, settings | Sandbox key; 38103 Memphis; carrier IDs optional |
| TMS_WEBHOOK_SECRET, TMS_BOOKING_WEBHOOK_URL | Secret, setting | URL empty until a TMS is chosen |
| OUTREACH_MODE, OUTREACH_TEST_EMAIL, OUTREACH_TEST_PHONE, limits | Settings | `test` until provider and legal decisions |
| RESEND_API_KEY, OUTREACH_FROM_EMAIL, TWILIO_* | Secrets | Empty; outreach simulated |
| FMCSA_WEB_KEY, COMPLIANCE_FRESHNESS_HOURS, OFFER_MIN_CONFIDENCE | Secret, settings | FMCSA optional; 24 h; 0.8 |
| ESTIMATE_DEFAULT_WEIGHT_POUNDS | Setting | 10 |
| MAX_CHAT_HISTORY | Unused | No conversation history is sent to the model |

## B10. Lessons that change how the next build should run

1. Test every write path after adding a database trigger, not one table. A trigger on loads broke four features silently.
2. A new value in code needs the matching database CHECK value in the same change.
3. Fail-open code (the rate limiter) needs a test that proves it actually limits.
4. Intake that writes in two steps must fail closed on the second step.
5. Netlify: create the project, set variables, then deploy, in that order; confirm a new deploy published before re-testing.
6. Keep the sibling project's live site out of reach: never deploy into its Netlify project.
7. Answer the A3 decision sheet up front; most stops in this build were for those questions.

---

# Part C. Go-live list and references

## C1. Before go-live

- Rotate the Supabase service-role key; update `.env.local` and Netlify; redeploy; rerun the tests.
- Enable leaked-password protection in Supabase Auth.
- Confirm `NEXT_PUBLIC_APP_URL` in Netlify is the live address and the Supabase redirect URL is allowed.
- Attach the custom domain MOTS-ShipIt.AI (DNS records from Netlify), then update `NEXT_PUBLIC_APP_URL`, the Supabase Site URL and redirect URLs.
- Provide the company email domain for sign-up.
- Real carrier data: USDOT and MC numbers, trailer types, contacts.
- Outreach provider (Resend, Twilio) and legal sign-off before `OUTREACH_MODE=live`; inbound reply webhooks with signature checks.
- Choose the TMS and connect the webhook in both directions.
- Admin screens for customers, sourcing policies and carriers.
- Review the routing guide's freight costs (40 lb to Atlanta at $1.50 always beats ShipStation).
- Remove test data: `E2E-` loads, TEST-LOAD-0001/0002, "Test Customer (demo)", "E2E Test Customer (automated tests)", the `mots-shipit.e2e.*` users. Audit rows stay.
- Optional performance pass: 22 unindexed foreign keys, 9 unused indexes (advisor INFO).

## C2. Reference sources

- Repo files: `CLAUDE.md`, `CLAUDEchecklist1.md` (19 gaps logged), `docs/engineering/`, `mots-shipit-ai/specs/`, `docs/security/security-plan.md`, `test/README.md`, `mots-shipit-ai/supabase/`.
- PRD: `docs/MOTS ShipIt.docx_PRD_OLD.pdf`.
- Data model proposal: "ShipIt Data Domains" artifact, https://claude.ai/artifact/ESXXRkukHeGbUgkBDeA887
- ShipStation: https://docs.shipstation.com/rate-shopping and https://docs.shipstation.com/apis/shipengine/docs/rates/rates
- Sibling project: `Gen-AI-Apps_MOTS_contract_scout_ai`, its session log and checklist.
- Course: https://github.com/initmahesh/MLAI-community-labs/tree/main/Cohort-Labs/cohort-10/week-5/5.1-ai-app-development-with-claude-and-azure
- Starter repo: https://github.com/sachin0034-tech/dev-os
