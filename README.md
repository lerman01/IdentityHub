# IdentityHub — NHI Findings → Jira

A proof-of-concept for an **N**on-**H**uman **I**dentity management platform feature: report identity findings (stale service accounts, over-privileged keys, expiring credentials) straight into your **Jira** workspace — from a web UI, from a REST API for scanners/CI, and from a scheduled blog-digest automation.

**Stack:** Node.js · TypeScript · Express 5 · React 19 (Vite) · SQLite · Jira Cloud OAuth 2.0 (3LO)

| | |
|---|---|
| 🔐 App auth | Login/register, server-side sessions, per-user data isolation |
| 🔗 Jira integration | OAuth 2.0 (3LO) with rotating refresh tokens, encrypted at rest |
| 🎫 Finding tickets | Project picker (select **or** type a key), form → Jira issue with labels |
| 🕙 Recent tickets | Last 10 filed per project, read live from Jira (no local mirror) |
| 🤖 REST API | `POST /api/v1/findings` with per-user API keys (hashed, show-once) |
| 📰 Blog digest (bonus) | Latest [oasis.security/blog](https://www.oasis.security/blog) post → AI summary → Jira ticket |

Deeper docs: [Architecture](docs/ARCHITECTURE.md) · [Design decisions](docs/DECISIONS.md) · [REST API](docs/API.md) · [Demo script](docs/DEMO.md)

---

## Quick start

Requirements: **Node.js 20.19+ / 22.12+ / 24** and npm. (A free [Atlassian account with a Jira Cloud site](https://www.atlassian.com/try) is needed for the Jira features.)

```bash
npm install
npm run setup    # creates .env and generates SESSION_SECRET + ENCRYPTION_KEY
npm run seed     # creates the demo login
npm run dev      # API on :3000, web app on http://localhost:5173
```

Sign in at **http://localhost:5173** with the demo user:

```
demo@identityhub.local / demo-password-123
```

The app runs immediately, but Jira features stay disabled until you register an Atlassian OAuth app (~5 minutes, next section) — the dashboard will tell you exactly that.

---

## Create your Atlassian OAuth app (~5 minutes, one time)

IdentityHub connects to Jira with **OAuth 2.0 (3LO)** — users click *Connect Jira* and approve scoped access on Atlassian's consent screen; the app never sees a password. That requires an app registration in Atlassian's developer console:

1. Open the [Atlassian developer console](https://developer.atlassian.com/console/myapps/) and sign in (any free Atlassian account works — use the same one that owns your Jira site).
2. **Create → OAuth 2.0 integration**. Name it e.g. `IdentityHub (dev)`, accept the terms, **Create**.
3. **Permissions** (left menu) → find **Jira API** → **Add** → **Configure**, then add these three scopes:
   - `read:jira-work` — *View Jira issue data* (list projects)
   - `write:jira-work` — *Create and manage issues* (file findings)
   - `read:jira-user` — *View user profiles* (show who connected)
4. **Authorization** (left menu) → OAuth 2.0 (3LO) → **Add**, and set the callback URL to exactly:
   ```
   http://localhost:3000/api/jira/oauth/callback
   ```
5. **Settings** (left menu) → copy the **Client ID** and **Secret** into your `.env`:
   ```
   ATLASSIAN_CLIENT_ID=...
   ATLASSIAN_CLIENT_SECRET=...
   ```
6. Restart `npm run dev`. The dashboard now shows **Connect Jira**.

Notes:

- The `offline_access` scope (refresh tokens) is requested in the authorize URL automatically — there is nothing to add for it in the console.
- By default a console app can be authorized by **the Atlassian account that owns it**. To connect a *different* Atlassian account (e.g. demoing two isolated users against two Jira accounts), enable **Distribution → Sharing** in the console. Two app users connecting the *same* Atlassian account needs no extra setup.

### Troubleshooting

| Symptom | Fix |
|---|---|
| Atlassian error about `redirect_uri` | The callback URL in the console must match `ATLASSIAN_CALLBACK_URL` **exactly** (scheme, host, port, path). |
| "Atlassian rejected the token exchange" toast | Client ID/secret typo in `.env`, or callback URL mismatch. |
| Consent screen missing scopes / scope error | Re-check step 3 — all three scopes added under **Jira API**. |
| "Your Atlassian account has no Jira sites" | Create a free Jira Cloud site at [atlassian.com/try](https://www.atlassian.com/try) first. |
| Jira features disabled banner | `ATLASSIAN_CLIENT_ID`/`SECRET` missing in `.env`; restart after adding. |

---

## Using the app

1. **Connect Jira** — one click, approve on Atlassian's consent screen. Multi-site accounts get a site picker.
2. **Pick a project** — searchable dropdown of your projects; you can also *type* any project key directly.
3. **Report a finding** — title + description (required), severity + identity type (optional). *Fill sample* autofills a realistic NHI finding. The created issue carries the `identityhub` label plus `severity:*` / `nhi:*` labels.
4. **Recent tickets** — the last 10 findings filed to the selected project *through this app* (UI, API, or digest), each linking into Jira. Read live from Jira via a JQL query on the `identityhub` label, so it always matches reality — there's no local copy to drift ([why](docs/DECISIONS.md)).
5. **API keys** — create a key (shown once, stored hashed), use it from scanners/CI. A ready-to-run `curl` example is shown on creation. Full reference: [docs/API.md](docs/API.md).

### The REST API in 10 seconds

```bash
curl -X POST http://localhost:3000/api/v1/findings \
  -H "Authorization: Bearer ihk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"projectKey":"SEC","title":"Stale service account: svc-ci","description":"No auth in 90 days.","severity":"high","identityType":"service-account","foundBy":"nightly-scan"}'
```

### The blog digest (bonus)

A **standalone script**, external to the UI and to the server process — nothing in the API imports it. Files the newest Oasis Security blog post as a Jira ticket, summarized by Claude when `ANTHROPIC_API_KEY` is set, with an extractive fallback otherwise. Configure in `.env`:

```
DIGEST_USER_EMAIL=demo@identityhub.local   # an app user who has connected Jira
DIGEST_PROJECT_KEY=SEC                     # target Jira project
# ANTHROPIC_API_KEY=sk-ant-...             # optional: AI summaries
```

Then run it:

```bash
npm run digest
```

To put it on a schedule, use whatever the host already has — cron, Task Scheduler, a CI cron job. The app deliberately doesn't ship a scheduler.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run setup` | Create `.env` from `.env.example` with fresh secrets (no-op if `.env` exists) |
| `npm run dev` | Run API (`:3000`) + web dev server (`:5173`) with hot reload |
| `npm run seed` | Create the demo login (idempotent) |
| `npm run digest` | Run the blog digest once (standalone, independent of the server) |
| `npm test` | Run the server test suite (50 tests) |
| `npm run typecheck` | TypeScript across all workspaces |
| `npm run lint` | ESLint across the repo |
| `npm run build` | Build the web app for production |
| `npm start` | Serve API + built web app on `:3000` (run `build` first) |

## Environment variables

All configuration lives in `.env` (see [.env.example](.env.example) for comments). `npm run setup` generates the secrets.

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | ✅ (generated) | Signs the session cookie |
| `ENCRYPTION_KEY` | ✅ (generated) | AES-256-GCM key for Jira tokens at rest |
| `ATLASSIAN_CLIENT_ID` / `ATLASSIAN_CLIENT_SECRET` | for Jira features | Your OAuth app credentials |
| `ATLASSIAN_CALLBACK_URL` | defaulted | Must match the console exactly |
| `PORT`, `APP_URL`, `DATABASE_PATH` | defaulted | Ports/paths |
| `ANTHROPIC_API_KEY`, `DIGEST_MODEL` | optional | AI summaries for the digest |
| `DIGEST_USER_EMAIL`, `DIGEST_PROJECT_KEY` | for the digest | Who files digest tickets, and into which project |

## Project structure

```
shared/   Zod schemas + DTO types used by BOTH server and web (one validation source)
server/   Express 5 API — routes → services → repositories/jiraClient, SQLite storage
  src/modules/     auth · jira (OAuth, client) · tickets · apiKeys
  src/publicApi/   /api/v1 for external systems (API-key auth)
  src/jobs/        blog digest (scraper, summarizer, runner)
  test/            vitest + supertest suite
web/      React 19 SPA — pages → hooks (TanStack Query) → typed api client
```

Design rationale for every major choice — and what would change for production — is in [docs/DECISIONS.md](docs/DECISIONS.md).

---

*Built as a home assignment for Oasis Security. Assumptions and scope decisions are documented in [docs/DECISIONS.md](docs/DECISIONS.md).*
