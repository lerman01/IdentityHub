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
{ "error": { "code": "JIRA_NOT_CONNECTED", "message": "Connect your Jira workspace first." } }
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

## Rate limits

60 requests/minute per client on `/api/v1/*`. Exceeding it returns `429 RATE_LIMITED` with standard `RateLimit-*` headers.

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
| 409 | `JIRA_NOT_CONNECTED` | Key owner hasn't connected a Jira workspace |
| 409 | `JIRA_RECONNECT_REQUIRED` | Jira authorization expired/revoked — reconnect in the app |
| 429 | `RATE_LIMITED` / `JIRA_RATE_LIMITED` | Our limit / Jira's limit |
| 502 | `JIRA_UNAVAILABLE` / `JIRA_UNREACHABLE` | Upstream Jira problems |

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

List recent tickets **created through IdentityHub** by the key owner (newest first). This reads the app's own record — it is not a general Jira search.

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

`source` is `ui`, `api`, or `digest` — which entry point filed the ticket.
