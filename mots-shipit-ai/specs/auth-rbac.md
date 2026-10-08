# Spec — Auth & RBAC (cross-cutting)

## User flow

1. Console users authenticate via Supabase Auth (email/password + OAuth).
2. On first login, a Supabase trigger (`handle_new_user`) auto-provisions a `profiles` row with a default role (`sales_rep`).
3. Every API route is wrapped in `requireAuth()`, which resolves the session and the caller's `profiles.role`.
4. RLS policies independently enforce the same role scoping at the database level — a defense-in-depth layer, not a replacement for the in-route check.

## Module interface

```ts
// lib/security/authGuard.ts
export async function requireAuth(
  req: Request, allowedRoles?: UserRole[]
): Promise<{ userId: string; role: UserRole } | Response>;
// Returns the session info on success, or a Response (401/403) to return
// directly from the route handler on failure -- callers do:
//   const auth = await requireAuth(req, ['admin']);
//   if (auth instanceof Response) return auth;
```

## Role model

| Role | Access |
|---|---|
| `admin` | Full access to all routes, including `/api/control/*` and policy management |
| `ops_manager` | Read access to loads/offers/exceptions/customers/policies; no booking/control actions |
| `sales_rep` | Read/respond on assigned loads and offers; booking within approval threshold |
| `compliance` | Read access to compliance snapshots and exceptions; no booking/control actions |

## Rate limiting (carried over from the ContractIQ playbook's caught design flaw)

```ts
// lib/security/rateLimiter.ts
export async function checkRateLimit(
  identifier: string,  // "user:<uuid>" post-auth OR "ip:<address>" pre-auth -- NEVER
                        // a strict user_id foreign key, because the single most
                        // important case to rate-limit (brute-force login against
                        // a nonexistent email) has no user_id at all
  action: 'auth' | 'estimate' | 'booking' | 'webhook'
): Promise<{ allowed: boolean; retryAfterSeconds?: number }>;
```

Sliding-window limits: `auth` 10/min (keyed by IP, pre-auth), `estimate` 30/min (keyed by user), `booking` 5/hour (keyed by user), `webhook` per-TMS-secret limit TBD once a real TMS is chosen (generic adapter has no fixed limit at MVP).

This is a direct, deliberate carry-over from a real bug caught in the sibling ContractIQ build: its first draft keyed `rate_limit_events` by `user_id`, which cannot represent pre-auth brute-force attempts. Don't repeat that mistake here.

## Edge cases

- First login (no `profiles` row yet) → `handle_new_user()` trigger provisions one automatically; `requireAuth()` must never assume the row already exists without this trigger having run
- A role is changed (e.g. promoted to `admin`) while the user has an active session → the next request re-reads `profiles.role` fresh (no role caching in the session token itself), so the change takes effect on the very next request, not on next login
- `handle_new_user()` is `SECURITY DEFINER` — its public RPC execute permission is explicitly revoked (see `supabase-schema.sql`), closing the exact finding the sibling project's live Supabase advisor caught (an unrelated app could otherwise call it directly via `/rest/v1/rpc/handle_new_user`)
