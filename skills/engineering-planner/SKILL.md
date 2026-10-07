---
name: engineering-planner
description: >
   Transforms a PRD, product brief, feature request, or project description into a comprehensive Engineering Document (High-Level Design). Trigger when a user asks to create an engineering document, engineering doc, HLD, system architecture, technical design, or wants to convert requirements into a technical plan. The output defines the application architecture, technology stack, core components,data flow, APIs, database design, integrations, security considerations,deployment approach, and implementation roadmap before development begins. The output is a single markdown file `docs/engineering/engineering-doc.md` that serves as the authoritative reference for the engineering team.
---

**Frontend:** Next.js (fixed — do not ask about frontend framework).

---

## Input

A PRD (Product Requirements Document) provided by the user — pasted text, a file path, or an uploaded document.

---

## Steps

1. **Analyze** the PRD — extract functional requirements, non-functional requirements, and gaps.
2. **Generate** `docs/engineering/engineering-doc.md` (high-level architecture doc).

---

## Output: `docs/engineering/engineering-doc.md`

Write this file with these sections in order:

1. **Executive Summary** — project name, business goal, problem statement, target users, success criteria
2. **Product Scope** — in scope / out of scope / future enhancements
3. **User Personas** — user types, responsibilities, permissions, primary workflows
4. **User Flows** — every major journey (signup, login, dashboard, AI chat, file upload, search, payments, admin) using the format:
   ```
   User Action → Frontend Behavior → Backend Processing → Database Interaction → System Response
   ```
5. **Frontend Architecture** — Next.js stack (UI lib, state management, routing strategy), UX states (loading/empty/error/responsive/a11y), page and component hierarchy
6. **Backend Architecture** — stack, core systems (auth, authz, business logic, validation, middleware, error handling), service interaction diagram
7. **Database Design and schema** — per table: purpose, columns + types, relationships, constraints, indexes
8. **AI Architecture** *(only if AI features exist)* — LLM provider, model, prompt strategy, context/memory, token limits, rate limiting, cost controls, fallback
9. **API Specification** — per endpoint: method, path, purpose, auth required, request schema, response schema, validation rules, error responses
10. **Feature Breakdown** — Phase 1 (MVP), Phase 2, Phase 3 — each with: feature description, acceptance criteria, dependencies
11. **Folder Structure** — production-ready directory layout with purpose annotations
12. **Naming Conventions** — files, folders, components, hooks, services, APIs, DB tables, env vars, config files — with examples
13. **Testing Strategy** — unit, integration, and E2E with recommended frameworks and coverage targets
14. **Specs to Implementation Mapping** — for each spec, list the corresponding implementation files and the full flow from spec to code

---

## Requirements

- No vague statements — every section must be concrete and actionable
- Include Mermaid or ASCII diagrams where architecture benefits from visual representation
- `engineering-doc.md` is the authoritative reference; no implementation begins until it is approved

---


