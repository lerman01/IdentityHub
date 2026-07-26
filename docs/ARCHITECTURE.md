# Architecture

## System overview

```mermaid
flowchart LR
    subgraph Clients
        B[Browser<br/>React SPA]
        S[Scanner / CI<br/>external system]
    end

    subgraph Server["Express 5 API (server/)"]
        R[Routes<br/>thin controllers + zod parsing]
        SV[Services<br/>auth · jira · tickets · apiKeys]
        RP[Repositories<br/>parameterized SQL]
        JC[jiraClient<br/>authed fetch + retry]
    end

    DB[(SQLite)]
    AT[auth.atlassian.com<br/>OAuth token endpoints]
    JA[api.atlassian.com<br/>Jira Cloud REST v3]
    BLOG[oasis.security/blog]
    GROQ[Groq API<br/>optional]

    B -- "session cookie (httpOnly)" --> R
    S -- "API key (Bearer)" --> R
    R --> SV --> RP --> DB
    SV --> JC --> JA
    SV --> AT
    D[Digest job<br/>npm run digest / cron] --> SV
    D --> BLOG
    D --> GROQ
```

Three entry points — browser session, API key, digest script — all converge on the **same service layer**. A ticket is created exactly one way (`ticketService.createFinding`), whatever its origin; only the authentication differs.

The digest is a standalone process, not a route: nothing in the API imports it ([DECISIONS #12](DECISIONS.md)).

## Layering rules

```
routes (HTTP: parse input with shared zod schemas, map to services, shape responses)
  └─ services (business logic, error mapping to AppError)
       ├─ repositories (hand-written parameterized SQL against SQLite)
       └─ jiraClient / atlassianOAuth (outbound HTTP to Atlassian)
```

- The web app never talks to Jira — only to our API. Jira credentials never reach the browser.
- Routes never touch the database directly; services never touch `req`/`res`.
- `shared/` holds the Zod schemas and DTO types used by server **and** web — validation logic exists once ([DECISIONS.md #13](DECISIONS.md)).
- Every non-2xx response uses one JSON envelope: `{ "error": { "code", "message", "details?" } }`.

## Sign in with Atlassian — one flow for auth *and* Jira access

```mermaid
sequenceDiagram
    participant U as Browser
    participant A as Express API
    participant AT as auth.atlassian.com
    participant JA as api.atlassian.com

    U->>A: GET /api/jira/oauth/start (no session needed)
    A->>A: state = random, bound to session (single-use)
    A-->>U: 302 to consent screen (scopes + state)
    U->>AT: approve access
    AT-->>U: 302 callback?code&state
    U->>A: GET /api/jira/oauth/callback
    A->>A: verify + consume state (CSRF)
    A->>AT: exchange code (client id + secret)
    AT-->>A: access token (~1h) + rotating refresh token
    A->>JA: GET /oauth/token/accessible-resources
    JA-->>A: sites + cloudIds
    A->>JA: GET /rest/api/3/myself (first site)
    JA-->>A: atlassian accountId + email
    A->>A: upsert account by accountId,<br/>encrypt tokens (AES-256-GCM) → SQLite
    A->>A: session.accountId = account.id
    A-->>U: 302 back to the app (?jira=signed-in | select-site)
```

The Atlassian `accountId` is global across sites, so looking it up via the first accessible site identifies the person regardless of which Jira they end up using. One site is selected automatically; several means the account picks one next (and can switch later).

### Token lifecycle

Atlassian access tokens live ~1 hour; refresh tokens **rotate** — every refresh returns a new pair and kills the old refresh token. That shapes the design:

- **Proactive refresh** when a token is within 60s of expiry, plus a **retry-once on 401** for tokens revoked out-of-band.
- **Per-user lock** around refresh: concurrent requests serialize, so two requests can never both spend the same rotating refresh token (the loser would strand the connection). In-process only — a multi-instance deployment would move this to a shared lock ([DECISIONS.md #15](DECISIONS.md)).
- After a refresh inside the lock, siblings re-read the row and use the new token without refreshing again.
- `invalid_grant` (refresh token expired/revoked) → the connection row is deleted and the API returns `JIRA_RECONNECT_REQUIRED`; the UI shows a clean reconnect card.

## Creating a finding

```mermaid
sequenceDiagram
    participant C as Client (form / API / digest)
    participant T as ticketService
    participant J as Jira Cloud

    C->>T: createFinding(userId, input, source)
    T->>T: connection check (409 if none)
    T->>J: GET /project/{key}?expand=issueTypes
    J-->>T: issue types (also validates the project → 404)
    T->>T: pick type: Task → Bug → first non-subtask
    T->>J: POST /issue (summary, ADF description, labels)
    J-->>T: issue id + key
    T-->>C: { id, issueKey, url }
```

**Jira is the only store for findings.** There is no local mirror: the `identityhub` and `source:*` labels written at create time are what let us recognise our own issues later, and the Recent Tickets view is a live JQL query against them. Nothing can drift out of sync because nothing is duplicated ([DECISIONS.md #9](DECISIONS.md) covers the trade-offs — editable labels, workspace-wide visibility, no audit record).

```mermaid
sequenceDiagram
    participant C as Client
    participant T as ticketService
    participant J as Jira Cloud

    C->>T: listRecent(userId, projectKey, 10)
    T->>J: POST /rest/api/3/search/jql<br/>project = KEY AND labels = identityhub
    J-->>T: issues[] (summary, created, labels)
    T->>T: parse source:* label, build browse URLs
    T-->>C: TicketDto[]
```

## Data model

| Table | Purpose | Notable columns |
|---|---|---|
| `accounts` | Atlassian identity **and** its Jira connection — the tenant | `atlassian_account_id` unique, `email`, `cloud_id`/`site_url` (nullable until a site is picked), `access_token_enc`, `refresh_token_enc` (AES-256-GCM), `access_token_expires_at` |
| `sessions` | Server-side session store | `sid`, JSON `data`, `expires_at` |
| `api_keys` | Public-API credentials | `key_hash` (SHA-256), `key_hint`, `revoked_at`, `last_used_at` |

Note what is *absent*: no `tickets` table (findings live in Jira and nowhere else, #9) and no digest bookkeeping (the digest is a standalone script, #12).

Every user-owned table carries `user_id`, and **every repository query filters on it** — that is the tenancy boundary (verified by tests). The one deliberate exception is the Recent Tickets view, which is scoped by Jira project rather than by app user, because it reads from Jira.

## Security model

| Layer | Mechanism |
|---|---|
| Sign-in | Atlassian OAuth only — no password is stored, hashed, or transmitted, so the entire password attack surface is absent |
| Sessions | httpOnly + SameSite=Lax cookie, server-side SQLite store, session regeneration on login (fixation), rolling 8h expiry |
| CSRF | SameSite=Lax baseline + Origin-check middleware on state-changing routes + single-use OAuth `state`; `/api/v1` exempt (no cookies — API-key auth) |
| Jira tokens | AES-256-GCM at rest (fresh IV per encryption, auth tag); never sent to the client; never logged; pending multi-site tokens encrypted even inside the session |
| API keys | 256-bit random with `ihk_` prefix, stored SHA-256-hashed, shown once, revocable, last-used tracking |
| Public API | Strict shared-schema validation, stable error codes; auth runs before routing (no route enumeration) |
| Transport hardening | helmet headers, 100kb JSON body limit |
| Multi-tenancy | All queries scoped by `user_id`; client cache wiped on logout |

## Production evolution

This is a deliberate POC. The documented path to production — org-level tenancy, KMS-managed keys, distributed locks, migrations, TLS/secure cookies, observability — is in [DECISIONS.md](DECISIONS.md) (#15 and per-ADR notes).
