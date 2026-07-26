# Demo Script (~10 minutes)

A suggested walkthrough for presenting the project, with the talking points that map to the assessment criteria.

## Before the demo

- [ ] `npm run dev` running; signed out; browser at `http://localhost:5173`
- [ ] Atlassian OAuth app configured in `.env`; your Jira site reachable
- [ ] A terminal ready for the `curl` + digest steps
- [ ] Optional: `ANTHROPIC_API_KEY` + `DIGEST_USER_EMAIL`/`DIGEST_PROJECT_KEY` set for the AI digest finale

## 1. Frame it (30s)

> "IdentityHub customers find identity issues — stale service accounts, over-privileged keys — and want them in Jira where work happens. I built the integration three ways: a UI for humans, a REST API for scanners, and a scheduled digest automation. All three converge on one service path."

## 2. App auth + tenancy (1 min)

- Register a fresh user (or sign in as demo). Point out: session cookie is httpOnly/SameSite=Lax, server-side store, scrypt hashing with no dependencies.
- Mention: wrong password and unknown email return the *same* error with comparable timing — no account enumeration.

## 3. Connect Jira via OAuth (2 min) — the security centerpiece

- Click **Connect Jira** → Atlassian consent screen. Talking points while it loads:
  - "OAuth 2.0 three-legged flow — we never see the password; access is limited to three scopes; the user can revoke from Atlassian at any time."
  - "The `state` parameter is single-use and session-bound — CSRF protection on the flow itself."
- Approve → back in the app, connected card shows site + account.
  - "Access tokens live an hour; refresh tokens *rotate* on every use. Refreshes are serialized per user so a race can't burn the rotation. Tokens are AES-256-GCM encrypted at rest and never reach the browser."

## 4. File a finding (2 min) — product thinking

- Pick a project (searchable; note you can also *type* a key — 'select or write' from the brief).
- **Fill sample** → realistic NHI finding appears → Create. Success toast with **Open in Jira**.
- In Jira, show: summary, formatted description with metadata footer, labels `identityhub` / `severity:*` / `nhi:*`.
  - "Labels, not custom fields — works on any customer workspace with zero admin setup. Issue type is resolved per project (Task → Bug → first standard), so team-managed and company-managed projects both just work."
- Recent Tickets panel updated — "backed by our own table, because Jira can't answer 'which issues did this app create'; the label is traceability, the table is truth."

## 5. The REST API (2 min)

- API keys page → create `demo-scanner` → show-once dialog. "Hashed at rest, prefix + last 4 for identification — the GitHub/Stripe model."
- Paste the provided curl → 201 with issue key. Refresh Recent Tickets → the new row has the **API** badge.
- Show the error contract quickly:
  ```bash
  curl -X POST localhost:3000/api/v1/findings -H "Content-Type: application/json" -d "{}"
  # 401 API_KEY_MISSING with a message that says how to authenticate
  ```
  and with the key but `-d "{}"` → 400 with per-field messages. "Same Zod schemas validate the web form and the API — one source of truth."
- Revoke the key → the curl now 401s. (Optional beat.)

## 6. Blog digest bonus (1.5 min)

- `npm run digest` → creates "NHI Blog Digest: …" ticket (AI summary if key set, extractive otherwise — "the AI is an enhancement, not a dependency").
- Run it again → `Skipped: already filed as …` — "idempotent by post URL, safe on any schedule; DIGEST_CRON runs it in-process."
- "It runs as a regular app user through the same ticketService — a third source, not a parallel pipeline. Note the **Digest** badge in Recent Tickets."

## 7. Architecture close (1 min)

- Open [ARCHITECTURE.md](ARCHITECTURE.md) — component diagram: three entry points, one service layer, layering rules, tenancy scoping on every query.
- "Fifty tests cover the crypto, the OAuth state machine, tenancy boundaries, and the API contract. Zero npm audit findings. Every trade-off is an ADR in DECISIONS.md."

## Likely questions → where the answer lives

| Question | Answer sits in |
|---|---|
| Why OAuth over API tokens? | [DECISIONS.md #2](DECISIONS.md) — plus: tokens make us a vault of long-lived credentials, the anti-pattern an NHI product fights |
| What happens when the access token expires mid-request? | [ARCHITECTURE.md](ARCHITECTURE.md) token lifecycle — proactive refresh + 401 retry + per-user lock |
| How is a second user's data isolated? | DECISIONS #3 — `user_id` on every query; tests assert it |
| Why SQLite / no ORM? | DECISIONS #4 |
| What would change for production? | DECISIONS #15 table |
| Why can't Jira tell you which tickets you created? | DECISIONS #9 |
| What if two requests refresh the token simultaneously? | Rotating refresh tokens make the loser fatal — hence the per-user lock (ARCHITECTURE, token lifecycle) |
| Where do you handle a revoked connection? | `invalid_grant` → connection dropped → `JIRA_RECONNECT_REQUIRED` → reconnect card |
