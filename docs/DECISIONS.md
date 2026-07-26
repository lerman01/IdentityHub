# Design Decisions

Every consequential choice in this project, with the alternatives considered and the trade-offs accepted. Numbered for reference from the other docs.

---

## 1. Architecture: Express + React SPA monorepo (not Next.js / NestJS)

**Decision:** npm-workspaces monorepo — `server/` (Express 5), `web/` (Vite + React 19), `shared/` (Zod schemas + types).

**Why:** The assignment's first assessment criterion is *clear separation between UI and backend layers*. A physical split makes that separation an artifact of the repo, not a convention inside a framework: the backend is explicit code (session middleware, CSRF checks, OAuth handling) that can be read, tested, and defended line by line.

**Alternatives:** *Next.js* — least setup friction and one process, but the backend becomes route handlers inside the frontend framework, and the security-relevant plumbing (sessions, middleware ordering) moves into framework abstractions. *NestJS* — strong enterprise signal, but heavy for a POC and adds DI magic that would dominate the review.

## 2. One identity: "Sign in with Atlassian" is the only way in

**Decision:** There is no separate app account. Authorizing Atlassian via OAuth 2.0 (3LO) *is* signing up, signing in, and connecting Jira — a single button, a single flow, a single `accounts` table keyed by `atlassian_account_id`. No passwords are stored, hashed, or transmitted; there is no register page and no seeded demo user.

**Why:** with separate app accounts, nothing stopped registering as `alice@corp.com` and then connecting Jira as `bob@personal.com`. The app would record "Alice filed this finding" while Jira recorded "Bob created this issue" — broken provenance, which matters more than usual for a security tool. Collapsing the two identities makes that mismatch unrepresentable rather than merely discouraged.

It also deletes a large amount of security-sensitive surface: no password hashing, no reset flow, no credential stuffing, no account-enumeration concerns, no password column to leak.

**What this costs, accepted:**

- **Every user must have their own Atlassian account.** Fine for a POC where Jira is the only feature, but the production model would be an *organization* tenant with one org-level Jira connection and users authenticating through a real IdP (Okta/Entra/Google via OIDC), because IdentityHub users and Jira-licensed users are not 1:1. See #3.
- **Demonstrating multi-tenancy needs two Atlassian accounts** (both free) rather than two app registrations.
- **Sign-in depends on Atlassian being reachable.** No local fallback credential exists.

**A note on the mechanism:** 3LO issues an *access token*, not an OIDC *ID token*, so identity is derived by calling `/rest/api/3/myself` after the exchange. That is safe here because the server performs the code exchange itself with the client secret after verifying `state` — the token comes from Atlassian, never from the browser. It is nonetheless OAuth pressed into service as authentication rather than the standardised OIDC path, which is what a production version would use.

## 2b. Why OAuth 2.0 (3LO) and not per-user API tokens

**Decision:** Full authorization-code flow with rotating refresh tokens.

**Why:** It is the production-correct model for a multi-tenant SaaS integrating with customers' Jira: no raw credentials collected (Atlassian's guidance explicitly reserves API tokens for scripts, and distributed apps that collect them violate their security requirements), scope-limited access (`read:jira-user read:jira-work write:jira-work offline_access` — each load-bearing), user-revocable, and short-lived tokens shrink the blast radius of any leak.

**Trade-off accepted:** The reviewer must register an Atlassian OAuth app (~5 minutes) before Jira features work. Mitigations: the app boots and clearly explains what is missing without credentials; the README walkthrough covers every click; app-auth features and the public API's error contract are demoable without Jira.

**Alternative:** Per-user Atlassian API tokens (paste email + token). Frictionless to run and fine for scripts, but it makes the platform a vault of long-lived, broadly-scoped credentials — the exact anti-pattern an NHI security product exists to fight.

## 3. Multi-tenancy: tenant = Atlassian account

**Decision:** Each account owns its Jira tokens, chosen site, and API keys. Every owned row carries `account_id`; **every repository query filters on it**; API keys resolve to their owning account; sessions isolate browsers; the client cache is wiped on logout.

**Why:** Satisfies "multiple concurrent users without data interference" with a model small enough to verify — tests assert that one account cannot revoke another's API key, and the `accounts.atlassian_account_id` unique constraint means one Atlassian identity is exactly one tenant.

**The documented exception:** the Recent Tickets view is scoped by *Jira project*, not by account, because it reads from Jira (#9). Two accounts pointed at the same project see the same list. Credentials never cross.

**Production path:** tenant becomes an *organization* — users belong to orgs, the Jira connection is org-level (one admin authorizes; the team files through it, most without a Jira seat), roles gate actions, and app identity comes from a real IdP rather than from Jira. The scoping pattern is unchanged, keyed by `org_id`.

## 4. Storage: SQLite + hand-written parameterized SQL

**Decision:** `better-sqlite3` with a small repository layer; schema applied idempotently at boot.

**Why:** Zero-configuration for the reviewer (file DB, no server), and no ORM abstraction between the reviewer and the queries — every statement is visible, parameterized (no injection surface), and explainable. Synchronous better-sqlite3 pairs well with a single-process POC.

**Alternatives:** Prisma/Drizzle add type-safe query DSLs and migration tooling at the cost of codegen and magic. **Production path:** Postgres + a migration tool (the repository layer is the seam to swap behind).

## 5. Sessions: server-side store, not the Atlassian token and not a JWT

**Decision:** `express-session` with a custom ~70-line SQLite store; httpOnly SameSite=Lax cookie carrying only a signed session id; rolling 8h expiry; logout destroys the row; **the session id is regenerated at sign-in**.

That last point is load-bearing here rather than boilerplate. This app creates a session for *anonymous* visitors, because the OAuth `state` nonce has to survive the round trip to Atlassian. Without regeneration, an attacker could call `/oauth/start` to obtain a validly-signed session id, plant it in a victim's browser, and inherit the session the moment the victim signed in — textbook session fixation. `regenerate()` also replaces `req.session` with a fresh object, which is why `handleCallback` *returns* the account id for the route to install rather than writing it onto the session itself.

**Why not put the Atlassian access token in the cookie?** It expires in ~1 hour, and its refresh token *rotates* — two tabs refreshing at once would race, one would get `invalid_grant`, and the account's Jira authorization would break. Serializing refreshes requires server-side token storage (see the per-account lock in ARCHITECTURE). The token would also have to be validated against Atlassian on every request (latency, quota, and our uptime coupled to theirs), and the natural fix — caching that validation server-side — *is* a session store. Finally, a stolen session id only grants "act as this account through IdentityHub", which we can revoke instantly; a stolen access token talks to Atlassian directly, bypassing us entirely, and cannot be revoked from our side.

**Why not a stateless signed cookie?** It would drop this table and ~100 lines. It would also drop server-side revocation: "logout" could only clear the browser's copy while the cookie stayed valid until expiry. Given "secure session management" is an explicit requirement, the stronger option is worth the code — this is the one place where simpler means weaker.

*(No password hashing appears anywhere in this codebase — see #2. `lib/crypto.ts` does AES-256-GCM and SHA-256 only.)*

## 7. Jira tokens encrypted at rest: AES-256-GCM

**Decision:** Access + refresh tokens encrypted with AES-256-GCM (fresh IV per encryption, authentication tag detects tampering); key is a 32-byte env secret generated by `npm run setup`. Tokens are never returned to the client and never logged. Even the *pending* tokens parked in the session during multi-site selection are encrypted.

**Production path:** Key from a KMS/secret manager with rotation; envelope encryption per tenant.

## 8. API keys: prefix + SHA-256 + show-once (the GitHub/Stripe model)

**Decision:** `ihk_` + 256 random bits; plaintext shown exactly once; only a SHA-256 hash stored; `ihk_…last4` hint for identification; revocable; `last_used_at` tracked.

**Why no salt/KDF:** Unlike passwords, keys are 256-bit random — there is nothing low-entropy to brute-force, so a fast hash is the correct choice (and enables O(1) lookup by hash). The prefix makes leaked keys identifiable by secret scanners.

## 9. "Created from this app": labels only, Jira is the single store (scope decision)

**Decision:** There is **no local tickets table.** Every issue we create is tagged `identityhub` plus `source:ui` / `source:api` / `source:digest`, and the Recent Tickets view is a live JQL query:

```
project = SEC AND labels = identityhub ORDER BY created DESC
```

**Why:** the alternative — mirroring each created ticket into our own table — is a cache of someone else's data, and it drifts. Delete an issue in Jira and the mirror still lists it, linking to a 404. Rename it and we show a stale title. Move it and our project column is wrong. Keeping Jira as the only store makes those states unrepresentable rather than merely handled: deleted issues stop appearing, renames show the current title, no reconciliation logic exists because there is nothing to reconcile.

**Trade-offs accepted, explicitly:**

- **Labels are user-editable.** Strip `identityhub` in Jira and the issue drops out of the view; add it to an unrelated issue and it appears. A soft marker, not enforced provenance.
- **The view is workspace-wide, not per-app-user.** Two IdentityHub users connected to the same Jira project see the same list, because Jira has no concept of our users. Defensible — they are looking at one shared project — and the boundaries that matter (credentials, connections, API keys) stay strictly per-user. See #3.
- **We lose the audit record.** If someone deletes a finding in Jira, we no longer know it was ever filed. For a security product that is a genuine cost; the production answer is a write-only audit log kept *alongside* Jira reads, not a mirror feeding the UI.
- **Availability and latency coupling.** The panel is a live Jira call, so Jira being down or rate-limiting means an empty panel rather than a stale one.
- **Search-index lag.** Jira's search index is eventually consistent, so a just-created issue can be missing from JQL for a second or two. The UI refetches once more after a short delay so a new ticket never appears to have vanished.

**Implementation note:** `POST /rest/api/3/search/jql` — the older `/rest/api/3/search` now returns 410 Gone, and the replacement returns no issue fields unless `fields` is listed explicitly. The project key is safe to interpolate into JQL because the shared schema constrains it to `/^[A-Za-z][A-Za-z0-9_]*$/`.

## 9b. "Selects / **writes** a Jira project" — existing projects only (interpretation)

**The ambiguity:** the brief says *"User selects / writes a Jira project from their connected workspace."* That reads two ways — either (a) writing is how you *find* an existing project, or (b) writing a key that doesn't exist means we **create** the project.

**Decision: (a).** The picker lists the projects the account can see, typing filters that list, and the selection must come from it.

An earlier revision also let you commit an arbitrary typed key. That was removed: an input that accepts a project which may not exist reads as "create it", and we can't (see below), so the affordance was actively misleading — it deferred the failure to a 404 at submit time instead of preventing it. Constraining the choice to real projects makes the invalid state unreachable rather than merely handled.

**Known limit of that choice:** the picker loads one page of 50 projects, so a workspace with more than 50 won't list them all. The fix is passing the search term to Jira's `project/search?query=` rather than filtering client-side — deliberately not built, since it adds a debounce and a request per keystroke for a case no demo workspace hits.

**Why not (b) — and this is the interesting half:**

- **The grammar points at (a).** *"from their connected workspace"* selects from something that already exists; creating one would read "in their workspace."
- **It needs a scope we deliberately don't request.** `POST /rest/api/3/project` requires `manage:jira-project`; our `write:jira-work` covers creating *issues* only. So project creation would mean asking every customer to grant **project-administration** permission so that a tool can file a ticket. For an NHI platform whose entire pitch is finding over-privileged machine identities, requesting admin scope for a convenience feature is precisely the anti-pattern we exist to flag. Least privilege wins.
- **It would not reliably work anyway.** Atlassian constrains an app to the permissions of the user it acts for, so creation also demands *Administer Jira* global permission. Site owners have it; most members of a security team do not. A feature that 403s for the majority of real users is worse than not having it.
- **Blast radius.** A typo'd key under (b) leaves a permanent, admin-only-removable artifact in a customer's Jira. Under (a) a typo is a 404 and a corrected keystroke.

**The production answer** is not project creation either: it is a setup step where an admin maps IdentityHub to an existing project once, and everyone else files into it — the same shape as the org-level connection in #3.

*(The brief explicitly invites this call: "You have flexibility to determine which Jira projects and field options to support. Document your decisions so we can evaluate your reasoning.")*

## 10. Jira fields: labels, not custom fields (scope decision)

**Decision:** Only Title + Description are required (per the assignment). Optional Severity and Identity Type map to **labels** (`severity:high`, `nhi:service-account`), plus a human-readable metadata line in the description. Issue type is resolved per project: prefer **Task**, else **Bug**, else the first non-subtask type.

**Why:** Custom fields and priority schemes require admin configuration on *each customer's* Jira — a zero-config integration must work on any workspace, team-managed or company-managed, out of the box. Labels do; they're also filterable in JQL (`labels = identityhub`), which is what makes #9 possible.

**Note:** an earlier revision retried the create without labels if a project configuration rejected the field. That was removed when #9 made labels load-bearing — an unlabelled issue would be permanently invisible to the view, so a loud failure is better than a silent ghost ticket.

## 11. Error contract: one envelope, human messages, stable codes

**Decision:** Every non-2xx response is `{ error: { code, message, details? } }`. Codes are stable and machine-readable (`JIRA_NOT_CONNECTED`, `API_KEY_INVALID`, `VALIDATION_ERROR` with per-field details); messages are written for humans and say *what to do next* ("Connect your Jira workspace first", "Check that the client ID/secret and callback URL match your Atlassian app exactly"). Unexpected errors log the stack server-side and return a generic message — internals never leak. Public-API auth runs before routing, so unauthenticated callers cannot enumerate routes.

## 12. Blog digest: same service path, resilient by design (bonus)

**Decisions:**
- **Scraping, not RSS** — the blog has no feed. Selectors are structure-based (`/blog/<slug>` links, `og:title`) rather than styling-class-based, with fallbacks, because marketing sites change CSS far more often than URL structure.
- **AI summary with extractive fallback** — Groq summarizes when `GROQ_API_KEY` is set (model configurable via `DIGEST_MODEL`, default `llama-3.3-70b-versatile`); otherwise, or on any API failure, the first sentences of the post are used. The demo never breaks on a missing key, and the fallback is covered by tests that assert no network call happens.
- **Called with plain `fetch`, not an SDK** — one request, one prompt, and the failure path already exists, so a provider SDK would add a dependency (and another package handling an API key) for no benefit. This also matches how the app talks to Atlassian. Groq's endpoint is OpenAI-compatible, so swapping providers again means changing a URL, a model name, and an env var.
- **Runs as an app user** (`DIGEST_USER_EMAIL`) and calls the same `ticketService` with `source: 'digest'` — the digest is a third ticket source, not a parallel pipeline, so it exercises the same connection, refresh, and labeling logic.
- **Its own entry point, not part of the server.** The assignment notes the digest is external to the UI, so `npm run digest` runs it as a standalone script and nothing in the API imports it. An earlier revision had an in-process `node-cron` scheduler and a `digest_state` idempotency ledger; both were removed as unnecessary weight — scheduling belongs to whatever the host already runs (cron, Task Scheduler, CI), and a manually-invoked script doesn't need a dedupe table. Consequence, accepted: running it twice files two tickets for the same post.

## 13. Validation: shared Zod schemas as the single source of truth

**Decision:** `shared/` exports the schemas; the web form, the session API, and the public API all parse with the same objects. Field messages are written once, human-readable, and identical everywhere — including for *missing* fields on the public API.

## 14. Owning two small pieces instead of patching a broken dependency

**Decision:** `@hookform/resolvers` currently ships a self-conflicting optional-peer graph (valibot ranges) that fails a clean `npm install`. Rather than forcing `--legacy-peer-deps` project-wide, the Zod→react-hook-form resolver is ~25 in-house lines, and the shadcn `form` component (whose registry entry pulls that package) was added by hand. `npm install` is clean, `npm audit` reports zero vulnerabilities, and every line of both pieces is explainable.

## 15. Deliberate POC simplifications (and the production path)

| Simplification | Why it's fine here | Production path |
|---|---|---|
| Server runs via `tsx` (no build step) | One less moving part for the reviewer; typecheck runs separately | `tsc`/esbuild build, node runtime |
| `secure: false` on the session cookie | Demo runs on `http://localhost` | TLS everywhere, `secure: true`, HSTS |
| CSRF = SameSite=Lax + Origin check (no token) | Correct for same-origin SPA + modern browsers | Add per-session CSRF tokens if embedding/legacy browsers matter |
| In-process token-refresh lock | Single-process POC | Redis/Postgres lock |
| No rate limiting | Not in the brief, and a POC on localhost has no abuse surface | A shared limiter at the edge (gateway or Redis-backed), which is where it belongs rather than in app code |
| Schema-at-boot instead of migrations | Schema is stable within the exercise | drizzle-kit / Prisma Migrate / raw SQL migrations |
| Console-based logger | Zero deps; "no secrets logged" is verifiable in one file | pino + structured shipping, request ids |
| Recent-tickets panel is a live Jira query, so it depends on Jira being reachable | No mirror means no drift (#9); an empty panel beats a wrong one | Add a write-only audit log beside it, and cache reads with a short TTL |
| `react-router` pinned to 7.11 | 7.12+ is inside a CSRF advisory range for RSC server actions — a feature this SPA doesn't use; 7.11 predates the vulnerable code entirely and audits clean | Bump to the patched major on the next dependency pass |
| Identity provider is Jira itself | Jira is the only integration in this POC | A real IdP (Okta/Entra/Google via OIDC) with Jira demoted to an integration — see #2 |

---

*Assignment ambiguities resolved along the way — no user directory specified (→ Atlassian is the identity provider, #2), "tickets created from this app" (→ #9), whose Jira the API/digest uses (→ the key owner's / configured account's) — are each covered by the ADR that implements them.*
