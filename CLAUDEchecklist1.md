# MOTS ShipIt — CLAUDE.md / skills vs. reality checklist

Gaps found between this repo's `CLAUDE.md` / `skills/*/SKILL.md` and what the build actually needed, with the workaround used. Same convention as the sibling ContractIQ repo (`Gen-AI-Apps_MOTS_contract_scout_ai/CLAUDEchecklist1.md`). Log new gaps here instead of patching them silently.

| # | Stage | Gap | What we did |
|---|---|---|---|
| 1 | All | `skills/*/SKILL.md` are not invocable as slash commands (`/engineering-planner`, `/frontend-setup`, …). | Read each `SKILL.md` directly and followed it manually. |
| 2 | 1 | `engineering-planner` only defines `engineering-doc.md`; `CLAUDE.md` also expects `implementation-specs.md`. | Generated it with the `implementation-specs` skill's method pointed at one consolidated file (ContractIQ checklist item 1). |
| 3 | 2 / 3 | `CLAUDE.md` puts specs in `docs/specs/` and `.env.example` at the root. | Mirrored ContractIQ: `mots-shipit-ai/specs/` and `mots-shipit-ai/.env.local.example`. |
| 4 | 3 | `frontend-setup` scaffolds a bare `nextjs-app/` with a generic purple landing page and Segoe UI. | App lives in `mots-shipit-ai/` (like `contractiq/`), with Tailwind mapped to `docs/design.md` tokens and the full route structure. |
| 5 | 2 / 4 | Stage 2 `specs/supabase-schema.sql` puts 15 tables in `public`. | Superseded by one Postgres schema per domain (full names, no abbreviations) and per-feature SQL files in `mots-shipit-ai/supabase/`. Domain plan: ShipIt Data Domains artifact. |
| 6 | 1 | The PRD frames ShipIt for freight brokers serving clients. | User clarified: one organization running its own supply chain, split by geography (NA, EMEA, APLA). No `organization_id`; roles renamed to supply chain roles. |
| 7 | 4 | No skill mentions Supabase **Exposed schemas**. Custom schemas return `PGRST106 Invalid schema` until added in Dashboard → Project Settings → API. | Dashboard step for the user: expose `data_foundation`, `transportation_shipment`, `operational_excellence_governance`. Symptom before that: header shows email instead of name and role. |
| 8 | 4 | `CLAUDE.md` places `lib/security/` work in Stage 7, but login (Stage 4) already needs `requireAuth`, input validation and auth rate limiting. | Built `lib/security/authGuard.ts`, `inputValidator.ts`, `rateLimiter.ts` in Feature 1 (path is `mots-shipit-ai/lib/security/`; there is no `src/`). Stage 7 extends them. |
| 9 | 4 | Rate limiting keyed by `user_id` can't limit pre-sign-in brute force (ContractIQ risk 001). | `rate_limit_events.identifier` is `ip:<address>` or `user:<uuid>`; only the service role can call `check_rate_limit`. |
| 10 | 4 | Supabase MCP write approvals expire; a late Accept shows as `Invalid or expired requestState`. | Accept the prompt promptly; retrying the same (idempotent) migration is safe. |
| 11 | 4 | Supabase dashboard-only auth settings are not code-changeable. | User sets: Redirect URLs (`http://localhost:3000/**`, later the Netlify URL), leaked-password protection (advisor WARN; may need a paid plan). |
| 12 | All | Stray `.Rhistory` file (ContractIQ committed one by accident). | Added `.Rhistory` to `.gitignore`; file left in place. |
