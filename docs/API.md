# Public REST API

For external systems — scanners, CI/CD pipelines — to file NHI findings programmatically. Versioned under `/api/v1`.

- **Base URL (dev):** `http://localhost:3000` (or `http://localhost:5173` through the Vite proxy — same API)
- **Content type:** `application/json`
- **Authentication:** an IdentityHub API key, created in the web app under **API keys**

```
Authorization: Bearer ihk_xxxxxxxx        # preferred
X-API-Key: ihk_xxxxxxxx                   # also accepted
```

Tickets are filed into the **key owner's** connected Jira workspace — the key is the tenant boundary.

## Error envelope

Every non-2xx response has this shape; `code` is stable and machine-readable, `message` is human-readable:

```json
{
  "error": {
    "code": "JIRA_RECONNECT_REQUIRED",
    "message": "Your Jira authorization expired or was revoked. Please sign in again."
  }
}
```

Validation failures include per-field details:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid or missing.",
    "details": [{ "field": "title", "message": "Title is required" }]
  }
}
```

---

## POST /api/v1/findings

Create an NHI finding ticket in Jira.

### Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectKey` | string | ✅ | Jira project key, e.g. `SEC` (case-insensitive; validated against the connected Jira) |
| `title` | string | ✅ | Issue summary, ≤ 255 chars |
| `description` | string | ✅ | Finding details, ≤ 30,000 chars (newlines preserved) |
| `severity` | enum | — | `low` \| `medium` \| `high` \| `critical` → label `severity:<value>` |
| `identityType` | enum | — | `service-account` \| `api-key` \| `service-principal` \| `certificate` \| `secret` \| `other` → label `nhi:<value>` |
| `foundBy` | string | — | Attribution shown in the ticket, e.g. `nightly-scan` (≤ 100 chars) |

### Responses

| Status | Code | Meaning |
|---|---|---|
| **201** | — | Created. Body: `{ "id", "issueKey", "url" }` |
| 400 | `VALIDATION_ERROR` | Invalid/missing fields (see `details`) |
| 401 | `API_KEY_MISSING` / `API_KEY_INVALID` | No key / unknown or revoked key |
| 403 | `JIRA_FORBIDDEN` | The connected Jira account lacks permission in that project |
| 404 | `NOT_FOUND` | Project not visible in the connected Jira (message names the key) |
| 409 | `JIRA_RECONNECT_REQUIRED` | Jira authorization expired/revoked — sign in again in the app |
| 409 | `JIRA_NO_ISSUE_TYPE` | The project exposes no usable (non-subtask) issue type |
| 409 | `ACCOUNT_NOT_FOUND` | The key's owning account no longer exists |
| 429 | `JIRA_RATE_LIMITED` | Jira is rate-limiting us; retry shortly |
| 502 | `JIRA_UNAVAILABLE` / `JIRA_UNREACHABLE` | Upstream Jira problems |

There is no "Jira not connected" state: signing in *is* authorizing Jira, so every account has exactly one connected site ([DECISIONS #2c](DECISIONS.md)). A connection that has gone bad surfaces as `JIRA_RECONNECT_REQUIRED`.

### Example

```bash
curl -X POST http://localhost:3000/api/v1/findings \
  -H "Authorization: Bearer ihk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "projectKey": "SEC",
    "title": "Stale service account: svc-deploy-prod",
    "description": "No authentication in 94 days; retains admin IAM bindings.\n\nRecommend disabling and rotating credentials.",
    "severity": "high",
    "identityType": "service-account",
    "foundBy": "nightly-scan"
  }'
```

```json
{ "id": "9c9d…", "issueKey": "SEC-42", "url": "https://your-site.atlassian.net/browse/SEC-42" }
```

The created issue carries labels `identityhub`, `severity:high`, `nhi:service-account`, and a metadata footer in the description (severity, identity type, `Reported by: nightly-scan`, source).

---

## GET /api/v1/findings

List recent findings **filed through IdentityHub** in a project (newest first). This is a live JQL query against the key owner's connected Jira for issues labelled `identityhub`, so it always reflects Jira's current state — deleted issues disappear, renamed ones show their current title.

### Query parameters

| Param | Required | Notes |
|---|---|---|
| `projectKey` | ✅ | Jira project key |
| `limit` | — | 1–50, default 10 |

### Example

```bash
curl "http://localhost:3000/api/v1/findings?projectKey=SEC&limit=5" \
  -H "Authorization: Bearer ihk_your_key_here"
```

```json
[
  {
    "id": "9c9d…",
    "projectKey": "SEC",
    "issueKey": "SEC-42",
    "summary": "Stale service account: svc-deploy-prod",
    "jiraUrl": "https://your-site.atlassian.net/browse/SEC-42",
    "source": "api",
    "createdAt": "2026-07-26T09:15:12.331Z"
  }
]
```

`source` is `ui`, `api`, or `digest` — which entry point filed the ticket, read back from the issue's `source:*` label. It is **omitted** when an issue carries the `identityhub` label but no recognised source label (for example, one tagged by hand in Jira).
