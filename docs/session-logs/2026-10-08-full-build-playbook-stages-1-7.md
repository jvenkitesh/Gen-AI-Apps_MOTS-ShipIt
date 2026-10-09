# MOTS ShipIt Build Playbook: Final Copy (Stages 1 to 7, 2026-10-08)

**Status:** all seven stages and the close-out are done. MOTS ShipIt is live at https://gen-ai-apps-mots-shipit-ai.netlify.app, 195 automated tests pass, and the last stage tag is `stage-7-complete`.

**What this document is for:** it is the guide for building the next app of this kind with Claude, end to end, without re-inventing the steps. Part 1 is the playbook: the pipeline, the rules, every question with its answer, and step-by-step runbooks for each stage and for the close-out. It covers this build and the ContractIQ build before it (session log of 2026-10-08), so both can be replayed from here. Part 2 is the full record of this build. Part 3 is the reflection. Part 4 is the go-live list and the references.

**Project facts:** repo github.com/jvenkitesh/gen-ai-apps-mots-shipit-ai (renamed from Gen-AI-Apps_MOTS-ShipIt) · laptop folder `gen-ai-apps-mots-shipit-ai/` · app folder `mots-shipit-ai/` · tests `test/` · Supabase project `mots-shipit-ai` (ref `gunsbekosmitvudjpmgg`, us-east-2, free plan) · Netlify project `gen-ai-apps-mots-shipit-ai` · sibling project ContractIQ (`Gen-AI-Apps_MOTS_contract_scout_ai`), whose session log set the step order.

*Sources: commit hashes, tags, PR numbers and migration names were read from git, GitHub and Supabase while writing. This final copy combines the first session log (Stages 1 to 4, Features 1 to 4) with everything after it and replaces both earlier documents.*

# Part 1. The playbook

## 1.1 The pipeline

| Stage | Input | What Claude does | Output | Gate and git |
|---|---|---|---|---|
| 1 Engineering plan | PRD | Reads the PRD, asks the architecture questions, writes the plan | `docs/engineering/engineering-doc.md`, `implementation-specs.md` | User approves |
| 2 Implementation specs | Approved plan | Writes one spec per concern, the database SQL and the env example | `specs/*.md`, `supabase-schema.sql`, `.env.local.example` | User approves; commit; tag `stage-2-complete`; push |
| 3 Frontend setup | Specs | Scaffolds the Next.js app in its own folder | App skeleton, design tokens, auth middleware, `netlify.toml` | Branch, PR, merge; tag `stage-3-complete` |
| 4 System design and features | Specs | Designs the database by domain, then builds one feature at a time | Supabase schemas and migrations; working features | Per feature: verify live, commit, tag, push (auto mode) |
| 5 Testing | Built features | Writes unit, live API and browser tests; fixes what they find | `test/` suite, all passing | Tag `stage-5-complete` |
| 6 Deploy | Passing suite | Builds, guides the Netlify setup, smoke-tests live | Live site | Tag `stage-6-complete` |
| 7 Security | Live app | Audits, asks the security decisions, builds controls, documents | `docs/security/security-plan.md`, `supabase/rls-policies.sql`, `lib/security/` | Branch, PR, merge; tag `stage-7-complete` |
| Close-out | Everything above | Writes the session log and playbook | Google Doc in the project Drive folder; copy in `docs/session-logs/` | Commit; tag; push |

After each stage Claude stops and asks the exact `CLAUDE.md` question, for example "Ready to move to Stage 5 — Testing?".

## 1.2 Standing rules (give these to Claude in the first prompt)

1. **Follow the steps in order.** The `CLAUDE.md` stages plus the ContractIQ session log are the sequence. Never reorder steps or pull later-stage work forward without asking. The user's words: "This is the steps we are following. Do not change the steps unless I tell you."
2. **Stop at every stage gate** and wait for a yes.
3. **Auto mode for features.** Once a feature plan is agreed, build, test, commit, tag and push without checking in at every step.
4. **The git process for every milestone:** commit with a "where we are" description; annotated tag `stage-<n>-<what-was-done>` in full words; push the commit; push the tag. Stage gates that change structure (Stage 3, Stage 7) go through a branch, a PR and a regular merge. If asked to "tag and push" when nothing changed, verify that local and GitHub match and say so; never add a duplicate tag.
5. **Ask clarifying questions freely**, through the question tool, with the recommended option first and up to four questions at a time. If the user answers "I want to clarify", ask in plain words what they want to clarify.
6. **Full names only:** no abbreviations, no "and" or "&" in schema names (`warehouse_management`, never `wms`).
7. **Mirror the sibling project** (ContractIQ) for structure and layout questions instead of asking.
8. **Secrets:** never print, commit or paste them in chat. Copy keys file to file. A key pasted in chat gets rotated. To hand the user many values for a dashboard, write a private file (permissions 600) in the scratchpad, have the user run `! pbcopy < file`, then delete the file.
9. **Leave stray files alone** (here the ContractIQ `.docx` and `docs/.Rhistory`); never stage them.
10. **UI copy:** every label ends with an ⓘ that explains it in plain words; every spinner and in-progress state says "Transmogrifying…"; the policy engine is called "Policy engine".
11. **ShipStation is estimate-only.** Never book, confirm or buy a label; report the cheapest total as the best choice. A test enforces this.
12. **Supabase writes need an Accept click** that expires quickly ("Invalid or expired requestState"). Prefer `if not exists` forms over `DROP`, `DELETE` or `UPDATE`; when one is needed, warn the user just before the call.
13. **Verify before reporting:** read results from git, Supabase and the live site instead of recalling them; say plainly when something was not checked.
14. **Dashboard work is the user's hands, Claude's instructions.** Claude cannot click in Netlify, Supabase or GitHub. Give numbered click-by-click steps, ask for a screenshot or the exact error text when something fails, and never guess from a paraphrase.
15. **Keep a risks log when asked.** ContractIQ kept `risks/NNN-short-title.md` files (status, date, severity, what happened, the fix) at the user's request; offer the same at the start of each build.

## 1.3 Decision sheet: every question asked, with the answer chosen

Fill this in at the start of the next build and most stops disappear. Each row is a question Claude asked during this build and the answer the user gave or approved.

### Product, tenancy and data model

| Question | Answer |
|---|---|
| Who uses the product: one organization or a broker serving many clients? | One organization running its own supply chain. No `organization_id`. |
| What varies inside that organization? | Geography: `NA` North America, `EMEA` Europe, `APLA` Pacific Asia. Every routing-guide row has a `geography` column; this build loaded `NA`. |
| Design only for load estimates, or for the larger product? | The larger supply chain product: order management, warehouse management, shipment and more, laid out now and built later. |
| Which domains, and what are they called? | One Postgres schema each, full names: `data_foundation`, `master_data_management`, `order_management`, `warehouse_management`, `transportation_shipment`, `operational_excellence_governance`. |
| Rename "Governance & Control"? | Yes: Operational Excellence and Governance. "Core and Reference Data" merged into Data Foundation. |
| Where do carriers live? | Data Foundation (a small master for transportation). Customers and suppliers live in Master Data Management. |
| Where do lanes and locations live? | Warehouse Management: they are warehouse-floor terms (bins, staging and pick lanes). Addressed sites are "facilities". |
| Rename the routing guide to "routes"? | No. "Routing guide" is the industry term: ship-to points and the carriers enabled for each facility, with weight breaks. It stays in Transportation and Shipment. |
| What does `weight_lbs` in `Routing_Guide.json` mean? | Freight cost in dollars. Keys renamed to `freight_cost_dollars` and `weight_break`. |
| Keep the routing guide as JSON or a table? | A Supabase table `transportation_shipment.routing_guide`, loaded from the JSON. |
| How should future routing-guide growth work? | Upsert: new entries are added, existing ones updated, nothing deleted; a safeguard rolls back if fewer than 52 NA rows remain. |
| What to store from each ShipStation estimate? | One row per enquiry in `load_transit_freight_amount`: the cheapest rate, all returned rates and a copy of the matching routing-guide row; newest 200 kept (first in, first out). Answers cached in `load_estimate_cache` (24 hours); every question logged in `load_estimate_enquiries` (newest 200). |
| Which ShipStation rate is "best"? | The cheapest total (shipping + insurance + confirmation + other). |
| Does ShipIt ever confirm or book with ShipStation? | Never. Estimates only; the best choice is reported to the user. |

### Stack, accounts and structure

| Question | Answer |
|---|---|
| Folder layout? | Mirror ContractIQ: app in `mots-shipit-ai/`, specs in `mots-shipit-ai/specs/`, SQL in `mots-shipit-ai/supabase/`, env example `mots-shipit-ai/.env.local.example`, data in `mots-shipit-ai/data/`, root `netlify.toml`. |
| Create the Supabase project? Name, region, cost? | Yes, after confirming: `mots-shipit-ai`, us-east-2, free plan. The user asked to be asked at every step and named the schemas and tables. |
| Language model? | OpenAI `gpt-4o-mini`, reusing the ContractIQ key (copied file to file, never printed). Anthropic was the first plan and was replaced. |
| ShipStation account? | Sandbox key (`TEST_…`), same base URL as production; sandbox offers UPS, FedEx and USPS. |
| Production URL? | Asked for https://MOTS-ShipIt.AI (that is, `mots-shipit.ai`). The domain was never registered (`whois`: "Domain not found"; DNS: NXDOMAIN). On 2026-10-08 the user decided not to buy it, so the live address is https://gen-ai-apps-mots-shipit-ai.netlify.app. |
| Names for the GitHub repo, laptop folder and Netlify project? | All three `gen-ai-apps-mots-shipit-ai` (lowercase, hyphens). The repo and folder were first created as `Gen-AI-Apps_MOTS-ShipIt` and renamed at the end; see 2.13. |
| Hosting? | Netlify: a new project in the same team as ContractIQ, named `gen-ai-apps-mots-shipit-ai`. |
| Production database for the first deploy? | The same Supabase project as development. |
| Deploy target: Netlify or Vercel? | Netlify (the course lesson deploys to Netlify; ContractIQ checklist item 6). |
| Is it safe to put the service-role and OpenAI keys in Netlify? | Yes. Netlify stores them encrypted and gives them only to the server functions, never to the browser. Only `NEXT_PUBLIC_*` values reach the browser. |
| Tag naming convention? | ShipIt: `stage-<n>-<what-was-done>`. ContractIQ: `Project-<app>-deploy-<repo>-ProductURL-<brand>[-stage7-…]`. Pick one at kickoff. |
| Stage order when `CLAUDE.md` and the course differ? | The course scaffolds the frontend before writing specs; this build kept the `CLAUDE.md` order. Ask once at kickoff. |
| Where does the session log go? | A new Google Doc in Drive folder `185RHM9qVwdFtlRkloZ7_ShBB4uuQ52zF`, plus a copy in `docs/session-logs/`, committed and tagged. |
| Keep a risks log? | ContractIQ: yes (`risks/`). ShipIt: not requested; offer it. |

### Auth, roles and access

| Question | Answer |
|---|---|
| Roles? | `administrator`, `supply_chain_operations_manager` (default for new users), `transportation_planner`, `compliance_analyst`, `viewer`. |
| Who may sign up? | Company domain only (domain still to be provided), plus one listed email, enforced by a database trigger. |
| Email confirmation? | Required, except test members, whose accounts are created already confirmed. |
| Password reset now or later? | Now. |
| Keep the auth rate limit that was pulled forward from Stage 7? | Yes, keep it. |

### Features and behaviour

| Question | Answer |
|---|---|
| Feature build order? | Engineering-doc Phase 1 order: login, estimate chatbot, load intake and Policy engine, carrier ranking, outreach, negotiation and compliance, booking and TMS write-back, exceptions and control plane, audit log. |
| Rename the Policy engine to "Logistics engine"? | Asked, then reversed: "Policy engine remains". Fully reverted. |
| Seed data? | Carriers seeded from the routing guide (7); a test customer with an active sourcing policy. |
| Messaging provider, carrier contacts, legal sign-off for outreach? | Not answered. Built with safe defaults: `OUTREACH_MODE=test`, messages simulated or sent only to the user's test email. |
| Expose the custom schemas in Supabase? | Yes; the user did it in the dashboard with step-by-step instructions. |

### Testing, deploy and security

| Question | Answer |
|---|---|
| How should tests handle data in a shared database whose audit log is permanent? | Labelled test data: one E2E customer, loads prefixed `E2E-`, one permanent user per role; delete what can be deleted; booked loads and audit rows stay until go-live cleanup. |
| Should tests call OpenAI and the ShipStation sandbox? | A few live tests only; unit tests stub them. |
| Is there already a Netlify project for this repo? | A new project, in the same team as ContractIQ. Pointing at ContractIQ's project meant "reuse its setup", not "deploy into it". |
| Netlify project name? | `gen-ai-apps-mots-shipit-ai`. |
| Validation error code? | `422 VALIDATION_ERROR` on every route, with the field name (freight routes and the webhook used 400 before). |
| Prompt injection in outside text? | Estimate questions: refuse with `400 PROMPT_INJECTION` before any AI call. Carrier replies: never sent to the AI; the reply is kept and a person reads it (high-risk exception). |
| When to rotate the service-role key that was pasted in chat? | During Stage 7. |

## 1.4 Stage runbooks (step by step)

### Stage 1: engineering plan

1. Read `CLAUDE.md`, the PRD, `docs/design.md` and the ContractIQ playbook (`CLAUDEchecklist1.md` and session log in the sibling repo).
2. Confirm the names and the address exactly, and write them into the decision sheet: GitHub repo name, laptop folder name, Netlify project name, and the live URL. If the URL is a custom domain, check now that it is registered (`whois <domain>`, `dig +short NS <domain> @8.8.8.8`); "Domain not found" or NXDOMAIN means it must be bought before Stage 6, which costs money and needs the user's decision.
3. Note that the `skills/*/SKILL.md` files are not slash commands here. Read `skills/engineering-planner/SKILL.md` and follow it by hand.
4. Ask the architecture questions in one batch: auth, database, language model, roles, hosting, tenancy.
5. Write `docs/engineering/engineering-doc.md`. The skill defines only this file; write `implementation-specs.md` using the `implementation-specs` method pointed at one consolidated file.
6. Show both files and ask: "Both engineering documents are ready… let me know when you're happy to move to Stage 2."

### Stage 2: implementation specs

1. Write one spec per concern (this build had nine), each with flow, data, API, edge cases.
2. Write `supabase-schema.sql` and `.env.local.example` with every variable, grouped by service.
3. Commit, tag `stage-2-complete`, push, and ask to continue.

### Stage 3: frontend setup

1. Ask where the project goes; mirror the sibling layout without asking further.
2. Scaffold Next.js 14.2 App Router with TypeScript, Tailwind mapped to `docs/design.md` tokens, the Supabase SSR client plus a service-role admin client, TanStack Query and Zod.
3. Add placeholder pages for every console route and the auth middleware.
4. Add the root `netlify.toml` now (contents in Stage 6, step 3).
5. Branch, PR, merge, tag `stage-3-complete`, push.

### Stage 4: system design

1. Present the data model as a visual artifact grouped by domain and iterate with the user until they approve names and placement.
2. Create the Supabase project only after confirming name, region and cost.
3. Create one schema per domain. Then expose every custom schema: Supabase → Integrations → Data API → Settings → Exposed schemas. Symptom when this is missing: `PGRST106 Invalid schema`, and the header shows the email instead of the name and role.
4. Load reference data from files with a generator script that upserts in one transaction and rolls back if the row count is wrong. Test-run it.
5. For any log table, keep it bounded (here, newest 200 rows) and test the trim (this build tested with 205 rows).
6. Commit and tag each design step (`stage-4-routing-guide-knowledge-base`, `stage-4-system-design-complete`).

### Stage 4: features (repeat for each)

1. Read the feature's spec and tell the user which files will change.
2. Write the migration; apply it through the Supabase connector (warn about the Accept click when the SQL contains `DROP`, `DELETE` or `UPDATE`).
3. Build the library code, the API route with its role check, and the page.
4. Verify live against Supabase: real webhook calls, real sign-ins, real rows.
5. Run the Supabase security advisor after every DDL change.
6. Update the spec's "As built" section.
7. Commit, tag `stage-4-feature-<n>-<name>`, push the commit and the tag.

Database patterns that worked:

- Row-level security on every table; signed-in users read; the server writes with the service role after the route checks the role.
- `SECURITY DEFINER` functions with `search_path = ''` and execute revoked from `public`, `anon` and `authenticated`.
- Atomic booking inside one Postgres function: a row lock, a unique idempotency key and a partial unique index allowing one active booking per load.
- Audit rows written by triggers in the same transaction; the audit table cannot be changed (no update or delete grant, plus guard triggers).
- Control-plane pauses checked in every write path.
- In PL/pgSQL append with `array_append(arr, 'value')`, never `arr || 'value'`.
- Every CHECK list in the database must include each new value the code sends.

### Stage 5: testing

1. Ask the two test-data questions (shared database, live external calls).
2. Create a sibling `test/` folder with its own `package.json`: Vitest 5.0.3, Playwright 1.64.0, `@supabase/ssr` 0.5.2, `@supabase/supabase-js` 2.117.3, dotenv. Secrets are read from `mots-shipit-ai/.env.local`, never copied.
3. Unit tests in `unit/` import app modules through the `@/` alias; a setup file blocks every network call except localhost.
4. Live API tests, one folder per feature, run one file at a time against the dev server.
5. Browser tests in `e2e/` with Playwright.
6. Test users: the sign-up allow-list trigger also blocks admin-created users, so the helper allow-lists the address only while creating it. Sign in through `@supabase/ssr` with an in-memory cookie jar instead of the login route (the login route allows 10 attempts a minute).
7. A user who created a control action can't be deleted (foreign key RESTRICT): use permanent role users for those tests.
8. For every bug found, write a regression test and prove it fails without the fix (stash the fix, rerun, restore).
9. Run everything with `npm run test:all`, fix failures, rerun until green; commit, tag, push.

### Stage 6: deploy to Netlify

1. Before anything else, re-check the live address from the decision sheet. If it is a custom domain, run `whois` and `dig` again: registered and owned by the user means attach it in this stage (Netlify → Domain management → Add a domain, then `NEXT_PUBLIC_APP_URL`, Supabase Site URL and redirect URLs); not registered means stop and ask the user to buy it or choose the netlify.app address. Never defer it silently.
2. Stop the dev server, run `npm run build` (both use `.next`), restart the dev server.
3. Commit a root `netlify.toml`: `base` = app folder, `command = "npm run build"`, `publish = ".next"`, plugin `@netlify/plugin-nextjs` (also a devDependency). Without the plugin every route is a 404.
4. Add `SECRETS_SCAN_OMIT_KEYS` for public and non-secret settings whose values appear in the repo (`NEXT_PUBLIC_*`, model name, origin zip, outreach mode, numeric limits). Keep real secrets scanned.
5. In Netlify, open the same team as the sibling project. Click **Add new project → Import an existing project → GitHub**. Never use drag-and-drop: that uploads static files with no server functions.
6. If the repo is not listed, click **Configure the Netlify app on GitHub**, add the repo under Repository access, Save, and reload Netlify. Access alone does not create a project; import it.
7. Set the project name and branch `main`; leave build fields to `netlify.toml`.
8. Environment variables: **Add a variable → Import from a .env file**, all scopes. Set `NEXT_PUBLIC_APP_URL` to the live address (an import of `.env.local` brings `localhost`). Skip empty variables.
9. **Deploys → Trigger deploy** after every variable change; variables apply only to builds started after they are saved.
10. If the project is **Private**, click **Make public**.
11. Supabase → Authentication → URL Configuration → Redirect URLs: add `https://<site>.netlify.app/**`.
12. Smoke test: curl every page and API gate, then run the live API and browser tests with `TEST_APP_URL=<site>`. Skip the IP rate-limit test on Netlify.
13. Commit, tag `stage-6-complete`, push.

Notes from both builds:

- Netlify's dashboard build fields can show "Not set" even when `netlify.toml` exists; the committed file is what counts.
- Confirm a protected page with curl without following redirects: it must answer 307 to `/login`, not 200.
- Netlify Functions stop after about 10 seconds by default. Keep AI and third-party calls short (ShipIt uses 10-15 second timeouts with fallbacks) and track longer jobs as a risk (ContractIQ's 30-second extraction is one).
- Netlify's "AI explain" panel on a failed deploy can confirm a diagnosis, but check which deploy it is explaining.

| Symptom | Cause | Fix |
|---|---|---|
| Netlify "Site not found" | No project at that address | Create it (or check the name) |
| 401 "Login Redirect" on every page | Project is Private | Make public |
| 404 on every route | Next.js runtime plugin missing | `netlify.toml` plugin |
| 500 "Your project's URL and Key are required…" | `NEXT_PUBLIC_SUPABASE_*` missing at build time | Add variables, redeploy |
| Webhook 503 `NOT_CONFIGURED` | `TMS_WEBHOOK_SECRET` or service key missing at runtime | Add, include the Functions scope, redeploy |
| "Exposed secrets detected" | A non-secret value appears in the repo | `SECRETS_SCAN_OMIT_KEYS` |
| "Deployed" but nothing changed | No new deploy published | Compare the response header `age` with the publish time |
| Custom domain doesn't load at all (NXDOMAIN) | The domain was never registered | Buy it and attach it, or keep the netlify.app address (decide with the user) |

### Stage 7: security

1. Read `skills/security-foundation/SKILL.md` and follow it by hand.
2. Audit: every API route (session check, role list, validation, rate limit), the middleware's protected pages, every table's RLS and grants, every function's `search_path` and execute grants, Supabase security and performance advisors, the live site's JavaScript for leaked keys, and response headers.
3. Ask the user the security decisions (validation code, injection handling, key rotation).
4. Build: prompt-injection guard, rate limits from the spec, shared validation with 422, security headers, token limits, `supabase/rls-policies.sql`.
5. Test each control, including that each rate limit really answers 429.
6. Write `docs/security/security-plan.md` and log skill gaps in `CLAUDEchecklist1.md` (the skill assumes a chat-and-upload app).
7. Branch, PR, merge, tag `stage-7-complete`, push the tag, watch the deploy go live, run the live smoke test.
8. Hand the user the dashboard-only items: rotate the service-role key, enable leaked-password protection, check email confirmation, the password-reset flow and refresh-token rotation in Supabase Auth.

What the Supabase advisors flagged in these two builds, and the fix:

| Finding | Fix |
|---|---|
| Function with a mutable `search_path` (WARN) | `set search_path = ''` on the function |
| `SECURITY DEFINER` function callable through `/rest/v1/rpc/...` by `anon` or `authenticated` (WARN) | `revoke execute ... from public, anon, authenticated` |
| A project-level helper (ContractIQ: `rls_auto_enable()`) exposed through the public API | Revoke the execute grant only; keep what it does |
| RLS enabled, no policies (INFO) | Intended for service-role-only tables; document it |
| Leaked-password protection off (WARN) | Dashboard switch (may need a paid plan) |
| RLS policies call `auth.uid()` per row (performance) | Rewrite as `(select auth.uid())` in a later performance pass |
| Unindexed foreign keys, unused indexes (INFO) | Later performance pass |

Security design points carried from ContractIQ to ShipIt:

- Rate-limit rows are keyed by an identifier, `ip:<address>` before sign-in and `user:<uuid>` after, never by a `user_id` foreign key: brute-force logins against accounts that don't exist have no user id (ContractIQ risk 001).
- Middleware sends signed-in users away from `/login` and `/signup` to the dashboard.
- System prompts say the user's or carrier's text is data, never instructions, and never to reveal the prompt, environment variables or keys.
- Security limits use the app's own approved values, not the skill's example numbers.
- When the schema SQL is kept in two places (ContractIQ: `database.sql` and `specs/supabase-schema.sql`), change both and diff them.

### Close-out: session log and playbook

1. Gather facts from the source, not memory: `git log`, `git tag`, `gh pr list`, Supabase `list_migrations`, test counts from the last run.
2. Read the previous session log (Google Doc) and the sibling project's log, so the new document includes everything in them.
3. Write the document in this order: status; the playbook (pipeline, rules, decision sheet, runbooks, kickoff prompt); the build record (timeline, features, bugs, deploy, security, migrations, environment variables); reflection; go-live list; references. Include the questions asked with their answers and any changes to `CLAUDE.md` or the checklist.
4. Save the Markdown copy in `docs/session-logs/`.
5. Convert to HTML and upload with Google Drive `create_file` (`contentMimeType: text/html`) into the project folder. Do not use `<hr>` (it shows as `-----`), do not nest a list inside a numbered list (numbering restarts), and escape `<` and `>` in text such as `stage-<n>`.
6. Read the Doc back with Drive `read_file_content` and check headings, tables, numbering and links.
7. The Drive connector can only create, read, rename, move and trash files; editing a Doc in place needs a Google Docs editing connector, which was not available. A corrected version is therefore a new Doc: rename the old one "SUPERSEDED (see Final Copy) …" and trash it only when the user asks (trash keeps it for 30 days).
8. Commit the repo copy, add an annotated tag, push both.

### Renaming the GitHub repo and the laptop folder (if names don't match)

1. GitHub: `gh repo rename <new-name> -R <owner>/<old-name> --yes`, then `git remote set-url origin https://github.com/<owner>/<new-name>.git` and `git fetch`. GitHub redirects the old name.
2. Push one commit and confirm Netlify still deploys from the renamed repo: the response header `age` resets to a few seconds when the new deploy publishes. (It did here: about two minutes after the push.)
3. Update the names in `README.md`, `docs/engineering/engineering-doc.md` (folder tree), the security plan and `test/README.md`. The app code reads its own address from `NEXT_PUBLIC_APP_URL`, so no code change is needed.
4. Run the full test suite locally and against the live site.
5. Rename the laptop folder last, because Claude Code runs inside it: stop the dev server, `mv` the folder, copy Claude's project memory folder to the new path's name under `~/.claude/projects/`, then reopen Claude Code in the new folder.

## 1.5 Kickoff prompt for the next build

Paste into a new Claude Code session in the new repo, with the brackets filled in:

> Build [product] from [PRD path] using this repo's CLAUDE.md 7-stage workflow. Names: GitHub repo [name], laptop folder [name], Netlify project [name], live URL [URL; say whether the domain is already registered]. Follow the MOTS ShipIt build playbook (final copy) and the ContractIQ session log; do not reorder steps. Here are my answers to the decision sheet: [answers]. Standing rules: [section 1.2]. Ask me questions only for what the sheet doesn't cover, recommended option first. Stop after each stage and ask to continue. In Stage 4 build features in auto mode; after each feature verify live, commit, add an annotated tag stage-4-feature-<n>-<name>, push the commit and the tag. Never print or commit secrets. ShipStation (or any external booking API) is estimate-only unless I say otherwise.

# Part 2. The record of this build

## 2.1 Timeline (2026-10-08, Pacific time)

| Time | Milestone | Commit | Tag |
|---|---|---|---|
| 08:15 | Stages 1 and 2 committed | 1c06f27 | stage-2-complete |
| 08:46 | Stage 3 scaffold (PR #2) | 14d54d1 / 63c0d27 | stage-3-complete |
| 11:12 | Routing guide table | 8f98885 | stage-4-routing-guide-knowledge-base |
| 11:27 | Geography on the routing guide; fail-safe SQL script | 29eaaa4 | |
| 11:56 | Load-estimate tables | 02a37e0 | stage-4-system-design-complete |
| 12:16 | Feature 1 login, sign-up, password reset | 0eb1e6f | stage-4-feature-1-login-signup |
| 12:29 | Feature 2 load-estimate chatbot | 50c8329 | stage-4-feature-2-load-estimate-chatbot |
| 12:51 | Feature 3 load intake and Policy engine | 8be8194 | stage-4-feature-3-load-intake-policy-engine |
| 13:19 | Feature 4 carrier ranking | 9a290fd | stage-4-feature-4-carrier-ranking |
| 13:22 | Test members skip confirmation | 2795144 | stage-4-feature-1-test-members-skip-confirmation |
| 13:38 | Stale exceptions closed on a new load version | cc535a8 | stage-4-feature-3-supersede-stale-exceptions |
| 13:47 | First session log | 1a1bdcc | stage-4-session-log-2026-10-08 |
| 16:05 | Feature 5 carrier outreach | 4be5ebc | stage-4-feature-5-carrier-outreach |
| 16:15 | ShipStation aligned with the Rate Shopping guide | cc0746c | stage-4-feature-2-shipstation-rate-shopping-alignment |
| 16:22 | Feature 6 negotiation and compliance | e8b2b96 | stage-4-feature-6-negotiation-compliance |
| 16:27 | Feature 7 atomic booking and TMS write-back | e65ab4f | stage-4-feature-7-atomic-booking-tms |
| 16:32 | Feature 8 exception queue and control plane | bd87f2d | stage-4-feature-8-exceptions-control-plane |
| 16:37 | Feature 9 audit log | 0f25324 | stage-4-feature-9-audit-log, stage-4-complete |
| 17:03 | Stage 5 test suite and two fixes | 3d4e591 | stage-5-complete |
| 17:31 | Netlify secrets-scan settings | 27e8101 | |
| 19:09 | Stage 6 deployed and smoke-tested | d24fbca | stage-6-complete |
| 19:29 | Stage 7 security (PR #3) | dfbb4c5, merge b628e9f | stage-7-complete |
| 19:51 | Playbook copy in the repo | 7aa77d9 | stage-7-session-log-playbook-2026-10-08 |
| 20:13 | Playbook final copy | 035ab99 | stage-7-playbook-final-copy-2026-10-08 |
| 20:23 | Playbook verified against ContractIQ log | febb9cd | stage-7-playbook-final-copy-verified-2026-10-08 |
| 20:29 | GitHub repo renamed to gen-ai-apps-mots-shipit-ai; docs updated | 765cdaf | |
| 20:48 | Live address kept on netlify.app; defects documented | 7fcb60d | stage-7-renames-and-defects-documented-2026-10-08 |

Pull requests: #1 file-name standardization, #2 Stage 3 scaffold, #3 Stage 7 security. All merged.

## 2.2 What the ContractIQ build added to this playbook (sibling project, earlier on 2026-10-08)

- Netlify 404 on every route: no `netlify.toml` and no `@netlify/plugin-nextjs`, so Netlify served the raw `.next` output; the dashboard build fields were a red herring. Fixed by committing the config file (risk 002).
- Netlify 500 "URL and Key are required": variables saved but no new deploy; later, three of five variables were simply missing. Fix: add all, then trigger a deploy.
- "Exposed secrets detected": Netlify scans every configured variable's value, including public `NEXT_PUBLIC_*` ones, and matched them in `.env.local.example` and `node_modules` docs. Fix: `SECRETS_SCAN_OMIT_KEYS` with names only.
- The project was Private until "Make public" was clicked.
- A stray `.Rhistory` file was swept into a commit; untracked and added to `.gitignore`.
- Stage 7: the security skill was not a slash command; no `src/` folder existed, so files went to `contractiq/lib/security/`; the rate-limit table was redesigned from `user_id` to an identifier before shipping; advisors found mutable search paths and an RPC-exposed `SECURITY DEFINER` function; both prompts were hardened; the work went through PR #1 with a regular merge, migration `stage7_security_foundation`, a fresh advisor run and a post-merge smoke test.
- Its ".ai" ("MOTS_contract_scout.ai") was a brand name in the page title and in the git tag labels (`…-ProductURL-MOTS_contract_scout.ai`), not a web address: the site was only ever reachable at `gen-ai-apps-mots-contract-scout-ai.netlify.app`, underscores are not allowed in domain names, and no matching `.ai` domain is registered.
- Open items it left: an old PDF library that fails on some modern PDFs, the Netlify 10-second function limit versus a 30-second extraction, and Supabase Auth dashboard settings to verify.

## 2.3 Stages 1 to 3

- Product: MOTS ShipIt, an agentic freight sourcing and booking platform, defined by `docs/MOTS ShipIt.docx_PRD_OLD.pdf` (current despite the name).
- Stage 1 (earlier session) chose Supabase Auth and database, Netlify hosting, a generic TMS adapter, and deferred voice. Stage 2 produced nine spec files, `supabase-schema.sql` and the env example.
- Stage 3 mirrored ContractIQ: the app in `mots-shipit-ai/`; specs moved to `mots-shipit-ai/specs/`; `.env.example` became `mots-shipit-ai/.env.local.example`; `Routing_Guide.json` moved to `mots-shipit-ai/data/`; a root `netlify.toml`. Next.js 14.2.35 App Router, TypeScript, Tailwind on design tokens, Supabase SSR helpers, TanStack Query, Zod, placeholder pages and auth middleware. Delivered through PR #2.

## 2.4 Stage 4 system design

- Supabase project `mots-shipit-ai` created in us-east-2 under the user's free-plan organization after confirming name, region and cost.
- Data model: six domain schemas; renames and placements as in the decision sheet; the "ShipIt Data Domains" artifact was the review surface across several rounds.
- Routing guide: `transportation_shipment.routing_guide` with 52 North America entries (50 states, 7 carriers, $675.40 total freight cost), plus `data_foundation.geographies`. `scripts/generate-routing-guide-sql.mjs` regenerates `supabase/routing_guide.sql`; it runs in one transaction, upserts and rolls back if fewer than 52 NA rows remain. Test-run end to end.
- `load_transit_freight_amount`: one row per enquiry with the cheapest ShipStation rate, all rates and a copy of the routing-guide entry; newest 200 kept; tested with 205 rows.
- `load_estimate_cache`: latest answer per geography, zip or state and question type, valid 24 hours. `load_estimate_enquiries`: every question, newest 200; users read only their own.

## 2.5 Stage 4 features

**Feature 1: login, sign-up, password reset.** Supabase email and password with confirmation, forgot and reset pages, sign-out, a header with name and role. Roles as in the decision sheet. Sign-up limited by an allow-list trigger (company domains, empty until provided, plus jyotis.sqa@gmail.com). Test members skip confirmation (the server creates them confirmed). Auth rate limit 10 a minute per IP, keyed `ip:` or `user:` (ContractIQ risk 001). Verified: the user signed up, confirmed by email and reached the dashboard; blocked domains create no user; the 11th wrong login returns 429.

**Feature 2: load-estimate chatbot.** The `/estimate` page answers freight cost and transit questions for any US zip or state from three sources: the routing guide (ship-to, carrier, weight break, freight cost), a ShipStation rate estimate (cheapest total) and the Unisco freight glossary. The best choice is the cheaper of the two costs; every number is computed in code and OpenAI writes only the sentence, with a template fallback. Fixed after testing: the cache ignored weight (weight-specific questions now always recalculate); Unisco returns a generic blurb for unknown terms (only verified glossary pages are used). Later aligned with ShipStation's Rate Shopping guide: `carrier_ids` always sent (from the env or `GET /v2/carriers`, cached an hour); total = shipping + insurance + confirmation + other. Live sandbox results: 10 lb gave USPS Priority $9.92; 150 lb gave FedEx Ground $534.21.

**Feature 3: load intake and Policy engine.** `POST /api/loads/webhook` receives loads from the TMS (shared secret, constant-time check). A new load is version 1; changed terms make a new version; identical repeats change nothing. The Policy engine checks lanes, equipment and rate range against the customer's active policy; passing loads become "sourcing", failing loads become "exception" with a reason and a 4-hour deadline; an empty or missing policy never means "no limits". Live verification with TEST-LOAD-0001 (Memphis 38103 to Atlanta 30303, dry van): v1 eligible; identical repeat unchanged; ceiling $12,000 gave v2 as an exception (`RATE_CEILING_ABOVE_MAXIMUM`); back within policy gave v3; v4 closed the stale v2 exception ("Superseded by load version N"). Wrong secret 401; unknown customer 400 (422 after Stage 7).

**Feature 4: carrier ranking.** Carrier master seeded from the routing guide: BNSF, CSX, FedEx, Norfolk Southern, Trax, UPS and Union Pacific (tier approved; USDOT/MC numbers and trailer types not on file). Deterministic score from 0 to 1 (lane, origin hub, tier, trailer type, recent bookings); every excluded carrier listed with its reason; zero candidates raises an exception. Test customer "Test Customer (demo)" with an active policy (Tennessee to any state, dry van and reefer, preferred or approved carriers, $100 to $10,000). Carriers page.

**Feature 5: carrier outreach.** Contacts the next N ranked carriers by email or SMS with a disclosure line and STOP opt-out; 30-minute wait between batches; per-contact daily cap; target rate and ceiling never shared. Built in test mode because provider, contacts and legal sign-off were not decided: messages are simulated or go to the user's test email. Fixed: message times shown in UTC; the batch wait counts only messages actually sent.

**Feature 6: negotiation and compliance.** A carrier reply (pasted until inbound webhooks exist) is read by OpenAI into an offer with the quoted evidence; confidence under 0.8 raises a 5-minute exception. The ceiling is enforced in code: above it, the offer is blocked and an exception raised. Approve, counter or reject; planners can approve up to the policy's limit. Compliance fails closed: no check in the last 24 hours blocks approval and booking; FMCSA is used when a web key and USDOT number exist, otherwise an analyst records a manual check. New load versions expire open offers.

**Feature 7: atomic booking and TMS write-back.** `commit_booking()` locks the load, enforces a unique idempotency key and one active booking per load; a retry with the same key returns the same booking. The booking is written to the TMS with an HMAC-signed webhook; if the TMS fails, the booking stands and can be retried. Verified: two simultaneous requests gave one booking and one `BOOKING_ALREADY_BOOKED`. TEST-LOAD-0001 was booked with Norfolk Southern at $1,050 and synced to a mock TMS.

**Feature 8: exception queue and control plane.** A queue sorted by deadline with a live countdown; breached exceptions stay visible; resolve or escalate with a note. Pause, resume, override and cancel by scope (global, customer, load, lane, agent, channel), enforced in every write path. Dashboard and policies pages.

**Feature 9: audit log.** `operational_excellence_governance.audit_events`, written by triggers in the same transaction for loads, offers, compliance checks, bookings, exceptions and control actions, plus events for bookings blocked by stale compliance and for which AI model read a reply. Nobody can change or delete an event. Audit trail on each load page and across all loads on Reports.

## 2.6 Configuration done in dashboards

- Supabase Data API exposed schemas: `data_foundation`, `transportation_shipment`, `operational_excellence_governance`, `master_data_management`.
- `mots-shipit-ai/.env.local` (git-ignored): Supabase URL, anon and service keys, OpenAI key and model, ShipStation sandbox key and origin zip 38103, a generated TMS webhook secret, outreach in test mode with the test email.
- Netlify project `gen-ai-apps-mots-shipit-ai`: public, variables imported, redeployed.
- Supabase redirect URL for the live site (the user was asked to add it).

## 2.7 Stage 5 testing

- 164 tests at the end of Stage 5 (79 unit, 76 live API, 9 browser); 195 after Stage 7 (103 unit, 83 live API, 9 browser).
- Bug found, from Feature 9: the audit trigger used `events || 'status_changed'`, so every load status or version change failed with "malformed array literal". Outreach, booking and new load versions had been broken since Feature 9. Fixed with `array_append` (migration `fix_audit_row_change_array_append`).
- Bug found: intake saved the load as "sourcing" before saving the Policy engine result; if that second write failed, an unchecked load could be ranked and contacted. Ranking and outreach now refuse unchecked loads (409); a TMS retry re-checks them.
- At the user's reminder, a test now fails if any ShipStation booking endpoint appears in the app.

## 2.8 Stage 6 deploy (what happened)

1. Production build passed; `netlify.toml` extended with the scan exclusions before the first deploy.
2. The user linked ContractIQ's Netlify project; a clarification established that ShipIt needs its own project in the same team. Name chosen: `gen-ai-apps-mots-shipit-ai`.
3. "Site not found": the project didn't exist yet; the repo had to be added to the Netlify GitHub app, then imported.
4. 401 "Login Redirect": the project was Private; made public.
5. 500 on every login-protected page: no variables. Imported, redeployed.
6. Webhook 503: `TMS_WEBHOOK_SECRET` took effect only after one more deploy; the `age` header showed when a deploy had not published.
7. Smoke test passed: pages, auth gates, 73 live API tests, 9 browser tests.

## 2.9 Stage 7 security (what happened)

- Audit baseline: 21 tables with RLS, no anonymous access, signed-in users read-only; 9 functions pinned and not callable by users; no key in the 11 live JavaScript files.
- Built: prompt-injection guard; rate limits (estimate 30 a minute, booking 5 an hour, carrier reply 30 a minute per user; reset-password 10 a minute per IP); 422 everywhere through shared schemas; anti-framing, referrer and permissions headers; token limits; `rls-policies.sql` applied as migration `stage7_security_baseline`; security plan; checklist items 13 to 19.
- Caught before shipping: the database rejected the new `carrier_reply` rate-limit action; because the limiter fails open, replies would have had no limit. Fixed in the same migration; a test proves 429.
- After merge the new build went live in about 105 seconds; 80 live API and 9 browser tests passed.

## 2.10 Supabase migrations (18)

create_transportation_shipment_routing_guide · seed_transportation_shipment_routing_guide · add_geography_to_routing_guide · create_load_transit_freight_amount · create_load_estimate_cache_and_enquiries · create_user_profiles_and_signup_access · create_rate_limit_events · create_loads_customers_policies_exceptions · create_carriers_seeded_from_routing_guide · seed_test_customer · add_test_member_flag_to_allowed_signup_emails · create_carrier_interactions · create_carrier_offers_and_compliance_checks · create_carrier_bookings · create_control_actions · create_audit_events · fix_audit_row_change_array_append · stage7_security_baseline

## 2.11 Environment variables

| Variable | Kind | Value or note |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY | Public | Baked in at build time |
| NEXT_PUBLIC_APP_URL | Public | https://gen-ai-apps-mots-shipit-ai.netlify.app in Netlify; localhost locally |
| SUPABASE_SERVICE_ROLE_KEY | Secret | Used only in `lib/supabase/admin.ts`; rotate |
| OPENAI_API_KEY, OPENAI_MODEL | Secret, setting | gpt-4o-mini |
| SHIPSTATION_API_KEY, SHIPSTATION_FROM_POSTAL_CODE, SHIPSTATION_CARRIER_IDS | Secret, settings | Sandbox key; 38103; carrier IDs optional |
| TMS_WEBHOOK_SECRET, TMS_BOOKING_WEBHOOK_URL | Secret, setting | URL empty until a TMS is chosen |
| OUTREACH_MODE, OUTREACH_TEST_EMAIL, OUTREACH_TEST_PHONE, limits | Settings | test |
| RESEND_API_KEY, OUTREACH_FROM_EMAIL, TWILIO_* | Secrets | Empty; outreach simulated |
| FMCSA_WEB_KEY, COMPLIANCE_FRESHNESS_HOURS, OFFER_MIN_CONFIDENCE | Secret, settings | Optional; 24; 0.8 |
| ESTIMATE_DEFAULT_WEIGHT_POUNDS | Setting | 10 |
| MAX_CHAT_HISTORY | Unused | No conversation history is sent to the model |

## 2.12 Close-out (what happened)

- The first playbook Doc was uploaded from HTML; a horizontal-line tag and a list nested inside a numbered list rendered badly, and the Docs editing connector was not available to fix it in place.
- The user asked for a final copy with very detailed steps, every question answered and a reflection; it was uploaded as a new Doc, the draft was renamed superseded and then trashed at the user's request.
- The user then asked to verify the final copy against this session and the ContractIQ log; ten missing items were added (close-out runbook, risks log, Netlify function time limit, advisor findings table, course lab mapping and stage-order note, dashboard working mode, secrets-in-Netlify answer, tag naming, middleware and prompt details, Drive upload rules).
- A side note the user sent with /btw could not be seen from this session; /btw messages are not shared with the main conversation, so paste such notes into the chat.

## 2.13 Last-minute defects (found by the user after the playbook was written)

| Defect | What was asked | What was built | Cause | Resolution |
|---|---|---|---|---|
| Live address | https://MOTS-ShipIt.AI (asked during Stage 4) | https://gen-ai-apps-mots-shipit-ai.netlify.app | The domain was never registered. In Stage 6 Claude asked once; the user didn't answer and Claude chose "attach later" without saying this blocked the requested address. Nobody checked registration until the end. | Checked: `whois` "Domain not found", DNS NXDOMAIN. The user decided not to buy it; the netlify.app address is the live URL. |
| GitHub repo name | `gen-ai-apps-mots-shipit-ai` | `Gen-AI-Apps_MOTS-ShipIt` | The repo kept the starter repo's naming; names were never confirmed against the request. | Renamed with `gh repo rename`; remote updated; Netlify kept deploying (verified by a new deploy after a push). |
| Laptop folder name | `gen-ai-apps-mots-shipit-ai` | `Gen-AI-Apps_MOTS-ShipIt` | Same as the repo. | Renamed at the very end (Claude Code runs inside it); project memory copied to the new path. |
| Netlify project name | `gen-ai-apps-mots-shipit-ai` | `gen-ai-apps-mots-shipit-ai` | Correct. | None needed. |

After the rename all tests passed again: 195 locally (186 Vitest, 9 browser) and, against the live site, 80 live API and 9 browser tests.

# Part 3. Reflection

**Planning.** The 7-stage `CLAUDE.md` order plus the sibling's session log gave a fixed sequence, and stopping at each gate kept the user in control. What cost time was deciding things mid-stream: tenancy, domain names, the Netlify project and the security choices each paused the build. A decision sheet answered up front removes most of those pauses.

**Investigating.** The most useful habit was reading the real system before changing it: the ContractIQ repo for structure, Supabase grants and functions before writing SQL, the live site's headers and JavaScript before the security work. Reading the error text closely (for example "Site not found" versus 401 versus 500) told us exactly which Netlify step was missing.

**Comparison.** Every structural choice was checked against ContractIQ: folder layout, test package, `netlify.toml`, the Stage 7 order. Where the skills or `CLAUDE.md` didn't fit this product (chat ownership, uploads, `src/` paths), the difference was logged in `CLAUDEchecklist1.md` instead of being forced in.

**Verification.** Every feature was checked live against Supabase, and every stage ended with numbers read from git, Supabase or the live site. Verification also failed once: Feature 9 was checked on one table only, which hid a trigger bug that broke four features until Stage 5 tests found it. Regression tests are now proved by making them fail without the fix.

**Conflict resolution.** Disagreements were settled by asking, not assuming: the Policy engine rename was reverted when the user changed their mind; Stage 7 work pulled into Feature 1 was offered back and the user kept it; the user's Netlify link was clarified twice before anything was deployed. When the user restated a rule (ShipStation never books), it became a test.

**Final synthesis.** The product is live and tested, with security controls documented and the remaining go-live items listed. The reusable outcome is this playbook: a fixed pipeline, a filled-in decision sheet, runbooks with the failure table, and a kickoff prompt that lets the next build start from Stage 1 with most questions already answered.

**Lessons learned.** Confirm names and the live URL exactly as the user wrote them, at kickoff and again before deploying; when a question about something the user asked for goes unanswered, say plainly what the default blocks instead of choosing quietly. Test every write path after adding a database trigger. Add the database CHECK value in the same change as the code that sends it. Prove that fail-open code actually limits. Make two-step writes fail closed. In Netlify, create the project, add variables, then deploy, and confirm a new deploy published before re-testing. Never deploy into a sibling project's site.

**New enhancements.** For the process: a GitHub Actions workflow that runs the unit tests on every PR; a Netlify deploy token so Claude can create the project, set variables and deploy without dashboard steps; a separate staging Supabase project for tests; scripts that seed and remove all test data; the decision sheet saved as a template file in the repo; a `risks/` log from day one; the Google Docs connector so logs update in place. For the product: admin screens for customers, policies and carriers; inbound reply webhooks; a real TMS connection; touchless-booking and compliance reports; the warehouse and order-management domains.

# Part 4. Go-live list and references

## 4.1 Before go-live

1. Rotate the Supabase service-role key; update `.env.local` and Netlify; redeploy; rerun the tests.
2. Enable leaked-password protection in Supabase Auth.
3. Confirm `NEXT_PUBLIC_APP_URL` in Netlify is https://gen-ai-apps-mots-shipit-ai.netlify.app, and set the Supabase Site URL to it with the redirect URL `https://gen-ai-apps-mots-shipit-ai.netlify.app/**`.
4. Custom domain: dropped by the user's decision (2026-10-08); the live address stays https://gen-ai-apps-mots-shipit-ai.netlify.app. If a domain is bought later: Netlify → Domain management → Add a domain, then update `NEXT_PUBLIC_APP_URL`, the Supabase Site URL and redirect URLs, redeploy and rerun the live tests.
5. Provide the company email domain for sign-up; confirm the origin zip 38103 and the full names for EMEA and APLA.
6. Load real carrier data: USDOT and MC numbers, trailer types, contacts.
7. Choose the outreach provider (Resend, Twilio), get legal sign-off, then switch `OUTREACH_MODE` to live; add inbound reply webhooks with signature checks.
8. Choose the TMS and connect both directions.
9. Build admin screens for customers, sourcing policies and carriers.
10. Review the routing guide's freight costs (40 lb to Atlanta at $1.50 always beats ShipStation).
11. Remove test data: `E2E-` loads, TEST-LOAD-0001/0002, "Test Customer (demo)", "E2E Test Customer (automated tests)", the `mots-shipit.e2e.*` users. Audit rows stay by design.
12. Optional: a performance pass on 22 unindexed foreign keys and 9 unused indexes.

## 4.2 References

- Repo: `CLAUDE.md`, `CLAUDEchecklist1.md` (19 gaps), `docs/engineering/`, `mots-shipit-ai/specs/`, `docs/security/security-plan.md`, `test/README.md`, `mots-shipit-ai/supabase/`, this file in `docs/session-logs/`.
- PRD: `docs/MOTS ShipIt.docx_PRD_OLD.pdf`.
- Data model artifact: https://claude.ai/artifact/ESXXRkukHeGbUgkBDeA887
- ShipStation: https://docs.shipstation.com/rate-shopping and https://docs.shipstation.com/apis/shipengine/docs/rates/rates
- Sibling project: `Gen-AI-Apps_MOTS_contract_scout_ai`, its session log and checklist.
- Course: https://github.com/initmahesh/MLAI-community-labs/tree/main/Cohort-Labs/cohort-10/week-5/5.1-ai-app-development-with-claude-and-azure (labs: `01-Planning-and-Architecture-Lab` for Stages 1 and 2, `02-Building-the-Application-Lab` for Stages 3 and 4, `03-Security-and-Deployment-Lab` for Stages 6 and 7, `04-integration-of-your-app-with-azureagent` not used).
- Starter repo: https://github.com/sachin0034-tech/dev-os
