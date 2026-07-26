# Demo Script (~10 minutes)

A suggested walkthrough for presenting the project, with the talking points that map to the assessment criteria.

## Before the demo

- [ ] `npm run dev` running; signed out; browser at `http://localhost:5173`
- [ ] Atlassian OAuth app configured in `.env`; your Jira site reachable
- [ ] A terminal ready for the `curl` + digest steps
- [ ] Optional: `GROQ_API_KEY` + `DIGEST_USER_EMAIL`/`DIGEST_PROJECT_KEY` set for the AI digest finale

## 1. Frame it (30s)

> "IdentityHub customers find identity issues — stale service accounts, over-privileged keys — and want them in Jira where work happens. I built the integration three ways: a UI for humans, a REST API for scanners, and a scheduled digest automation. All three converge on one service path."

## 2–3. Sign in with Atlassian (3 min) — the security centerpiece

One button does authentication *and* Jira access. Talking points while the consent screen loads:

- "There's no separate app account and no password anywhere in this codebase. Your Atlassian identity *is* your IdentityHub identity — which also means the app can't record 'Alice filed this' while Jira records 'Bob created it'. That mismatch is unrepresentable."
- "OAuth 2.0 three-legged flow: the server never sees Atlassian credentials, access is limited to four scopes, and the user can revoke from Atlassian at any time."
- "The `state` parameter is single-use and session-bound — CSRF protection on the flow itself."

Pick a site, approve → you land signed in, with the site shown in the card.

- "Notice Atlassian asked *which site*. That's a resource-level grant — the token can only touch the site you picked, not every Jira you can reach. It's the least-privilege option, so I kept it, and it means the app has no site picker of its own: switching sites re-runs consent, because Atlassian owns that choice."

- "Access tokens live an hour; refresh tokens *rotate* on every use. Refreshes are serialized per account so a race can't burn the rotation. Tokens are AES-256-GCM encrypted at rest and never reach the browser."
- "The session is still server-side and revocable — I deliberately did *not* put the Atlassian token in a cookie. It expires hourly, it can't be revoked from our side, and validating it per request would couple our uptime to Atlassian's."
- "And the session id is regenerated at sign-in. That's not boilerplate here: anonymous sessions exist to carry the OAuth `state`, so without regeneration someone could grab a signed session id from `/oauth/start`, plant it, and inherit your session when you logged in."

## 4. File a finding (2 min) — product thinking

- Pick a project — typing filters the list; the choice comes from it.
  - Be ready for the follow-up *"the brief said select **or write** — did 'write' mean create a project?"*: **"I read writing as how you find a project, and I'd have declined the other reading anyway — creating projects needs `manage:jira-project` scope plus Jira admin rights. Asking every customer for project-administration permission so a tool can file a ticket is the over-privileging this product exists to find. I also dropped an earlier free-text option that let you commit any key: it read as 'create this', which the app can't do, so it just moved the failure to a 404 at submit. DECISIONS #9b."**
- **Fill sample** → realistic NHI finding appears → Create. Success toast with **Open in Jira**.
- In Jira, show: summary, formatted description with metadata footer, labels `identityhub` / `severity:*` / `nhi:*`.
  - "Labels, not custom fields — works on any customer workspace with zero admin setup. Issue type is resolved per project (Task → Bug → first standard), so team-managed and company-managed projects both just work."
- Recent Tickets panel updated — "that panel is a live JQL query on the `identityhub` label, not a local copy. Jira is the only store, so there's no mirror to drift: delete the issue in Jira and it just disappears from the list."
  - If asked about the obvious weakness: *"Labels are user-editable, so it's a soft marker — strip the label and the ticket drops out. I took that over a local mirror because a cache of someone else's data goes stale in four different ways. The production version keeps a write-only audit log beside Jira rather than a mirror feeding the UI."*

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
- "It's a standalone script — the server doesn't import it, since the assignment says the digest is external to the UI. Scheduling it is the host's job: cron, Task Scheduler, a CI cron. I don't need a scheduler inside the app."
- "It runs as a regular app user through the same ticketService — a third source, not a parallel pipeline. Note the **Digest** badge in Recent Tickets."

## 7. Architecture close (1 min)

- Open [ARCHITECTURE.md](ARCHITECTURE.md) — component diagram: three entry points, one service layer, layering rules, tenancy scoping on every query.
- "Sixty-eight tests cover the crypto, the OAuth state machine, tenancy boundaries, JQL-injection rejection, and the API contract. Every trade-off is an ADR in DECISIONS.md."
  - If asked about `npm audit`: **be straight about it** — one high-severity finding against the pinned `react-router` 7.11. The pin was taken to dodge an advisory and has since fallen inside several; the applicable one is an open redirect in `<Link>`/`useNavigate` that this app doesn't expose (it only navigates to fixed internal paths). It needs a bump to ≥ 7.18.0 — DECISIONS #15.

## Likely questions → where the answer lives

| Question | Answer sits in |
|---|---|
| Why no username/password at all? | DECISIONS #2 — one identity means app and Jira provenance can't diverge; also deletes the whole password attack surface |
| Why OAuth over API tokens? | DECISIONS #2b — tokens make us a vault of long-lived credentials, the anti-pattern an NHI product fights |
| Doesn't SSO force every user to have a Jira seat? | Yes — accepted for the POC, and exactly why production is org-level tenancy with a real IdP (DECISIONS #2, #3) |
| Why keep a sessions table if you have OAuth? | DECISIONS #5 — token expiry, rotation races, and revocability |
| Why can't I switch Jira site inside the app? | DECISIONS #2c — resource-level grants scope the token to one site; Atlassian owns the choice |
| Does logout revoke the Atlassian token? | No — 3LO has no revoke endpoint, and revoking would break the user's API keys and digest job. Users revoke in Atlassian → Connected apps |
| What happens when the access token expires mid-request? | [ARCHITECTURE.md](ARCHITECTURE.md) token lifecycle — proactive refresh + 401 retry + per-user lock |
| How is a second user's data isolated? | DECISIONS #3 — `account_id` on every query; tests assert it |
| Why SQLite / no ORM? | DECISIONS #4 |
| What would change for production? | DECISIONS #15 table |
| Does "writes a project" mean creating one? | DECISIONS #9b — read as an input method; creation would need project-admin scope |
| How do you know which tickets your app created? | DECISIONS #9 — the `identityhub` label, queried via JQL |
| Isn't a label editable? What if someone removes it? | DECISIONS #9 — accepted trade-off, weighed against mirror drift |
| Two users on the same Jira project see each other's tickets? | Yes, by design — the view is workspace-scoped; credentials/keys/connections stay per-user |
| What if two requests refresh the token simultaneously? | Rotating refresh tokens make the loser fatal — hence the per-user lock (ARCHITECTURE, token lifecycle) |
| Where do you handle a revoked connection? | `invalid_grant` on refresh → 409 `JIRA_RECONNECT_REQUIRED` with "please sign in again"; the row is kept (deleting it would cascade away the user's API keys) and signing in re-issues both tokens in place — ARCHITECTURE token lifecycle |
