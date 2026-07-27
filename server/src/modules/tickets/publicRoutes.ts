import { Router } from 'express';
import { z } from 'zod';
import { createFindingSchema, projectKeySchema } from '@identityhub/shared';
import { requireApiKey } from '../apiKeys/requireApiKey.js';
import { ticketService } from './service.js';

/**
 * Public REST API for external systems (scanners, CI/CD).
 *
 * Design (docs/API.md has the full reference):
 * - Auth: per-user API key → tickets go to the key owner's connected Jira
 * - POST /api/v1/findings          → 201 { id, issueKey, url }
 * - GET  /api/v1/findings?projectKey=…&limit=… → recent tickets created here
 * - Errors: shared JSON envelope with stable codes and actionable messages
 *   (400 validation, 401 key, 404 project, 409 no Jira site, 502 Jira upstream)
 */
export const publicApiRouter = Router();

publicApiRouter.use(requireApiKey);

publicApiRouter.post('/findings', async (req, res) => {
  const input = createFindingSchema.parse(req.body);
  const created = await ticketService.createFinding(req.apiKeyAuth!.accountId, input, 'api');
  res.status(201).json(created);
});

const listQuerySchema = z.object({
  // The shared schema, not a local "short string" copy: this value is
  // interpolated into JQL downstream (shared/schemas/finding.ts).
  projectKey: projectKeySchema,
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

publicApiRouter.get('/findings', async (req, res) => {
  const { projectKey, limit } = listQuerySchema.parse(req.query);
  res.json(await ticketService.listRecent(req.apiKeyAuth!.accountId, projectKey, limit));
});
