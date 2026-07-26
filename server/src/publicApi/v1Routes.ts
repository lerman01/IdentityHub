import { Router } from 'express';
import { z } from 'zod';
import { createFindingSchema } from '@identityhub/shared';
import { publicApiLimiter } from '../middleware/rateLimit.js';
import { requireApiKey } from '../middleware/requireApiKey.js';
import { ticketService } from '../modules/tickets/ticketService.js';

/**
 * Public REST API for external systems (scanners, CI/CD).
 *
 * Design (docs/API.md has the full reference):
 * - Auth: per-user API key → tickets go to the key owner's connected Jira
 * - POST /api/v1/findings          → 201 { id, issueKey, url }
 * - GET  /api/v1/findings?projectKey=…&limit=… → recent tickets created here
 * - Errors: shared JSON envelope with stable codes and actionable messages
 *   (400 validation, 401 key, 404 project, 409 no Jira connection,
 *    429 rate limit, 502 Jira upstream)
 */
export const publicApiRouter = Router();

publicApiRouter.use(publicApiLimiter);
publicApiRouter.use(requireApiKey);

publicApiRouter.post('/findings', async (req, res) => {
  const input = createFindingSchema.parse(req.body);
  const created = await ticketService.createFinding(req.apiKeyAuth!.userId, input, 'api');
  res.status(201).json(created);
});

const listQuerySchema = z.object({
  projectKey: z
    .string()
    .trim()
    .min(1, 'projectKey is required')
    .max(50)
    .transform((v) => v.toUpperCase()),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

publicApiRouter.get('/findings', async (req, res) => {
  const { projectKey, limit } = listQuerySchema.parse(req.query);
  res.json(await ticketService.listRecent(req.apiKeyAuth!.userId, projectKey, limit));
});
