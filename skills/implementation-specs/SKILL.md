---
name: implementation-specs
description: >
  Takes the engineering plan document produced by the engineering-planner skill
  (docs/engineering-plan.md) and expands it into a full set of granular, runnable
  implementation specification files. Use this skill after engineering-planner has
  finished — it is the second step before any coding begins. Trigger when the user
  says things like "generate implementation specs", "create detailed specs from the
  plan", "I need the Supabase SQL schema", "give me the auth flow spec", "break down
  the engineering plan into buildable specs", or "what do I need to start building".
---

## Input

The engineering plan document that will be shared by the user
---

## Steps

1. **Read** the engineering plan that the user has provided in full.
2. **Identify** every distinct concern in the plan — features, integrations, user roles, data models, flows, infrastructure decisions, etc.
3. **Decide** what spec files are needed based on what the plan contains. Do not use a fixed list — derive the right set of files from the plan itself.
4. **Generate** each spec file inside `docs/specs/`. Name each file clearly after what it specifies.
5. **Do not** ask clarifying questions — all decisions are already captured in the plan.

---

## Principles for generating specs

Each spec file you create must be:

- **Self-contained** — a developer can read it alone and know exactly what to build
- **Concrete** — no vague statements, no "TBD", no "as needed"
- **Runnable where applicable** — SQL must execute, API contracts must be precise, env vars must be real

Use your judgment on how to split concerns. Some features may warrant their own file; others may combine naturally. The goal is that every meaningful concern in the engineering plan has a corresponding spec that makes it unambiguous to implement.

---

## Always include: `docs/specs/supabase-schema.sql`

Regardless of what other specs you generate, always produce this file. It must be a single SQL file that can be pasted directly into the **Supabase SQL Editor** and run on a fresh project without errors.

The SQL must cover everything the plan specifies:
- Extensions
- Custom enums and types
- All tables (in dependency order) with columns, types, constraints, and defaults
- Foreign keys
- Indexes
- `updated_at` auto-update triggers for every table that has that column
- Row Level Security enabled on every table + all RLS policies derived from the auth and role decisions in the plan
- Storage bucket creation and policies (if the plan includes file storage)

---

## Always include: `.env.example`

Regardless of what other specs you generate, always produce this file at the project root.

It must list every environment variable the app needs — derived from all integrations, services, and infrastructure decisions in the plan. For each variable include an inline comment explaining what it is and where to get it.

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=           # Supabase project URL — Settings > API
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # Supabase anon/public key — Settings > API
SUPABASE_SERVICE_ROLE_KEY=          # Supabase service role key — Settings > API (never expose to client)

# Add every other variable the plan requires (LLM provider, storage, email, payments, etc.)
```

Rules:
- Values must be empty (this is `.env.example`, not `.env`)
- Group variables by service with a `# ServiceName` comment header
- Mark variables that must never be exposed to the browser with a `# SERVER ONLY` comment
- Cover every service mentioned in the engineering plan — nothing omitted

---

## After generating all files

Print a summary listing:
- Each file created with its path
- One sentence describing what it specifies
