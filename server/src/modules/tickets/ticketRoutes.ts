import { Router } from 'express';
import { z } from 'zod';
import { createFindingSchema, projectKeySchema } from '@identityhub/shared';
import { requireAuth } from '../../middleware/requireAuth.js';
import { ticketService } from './ticketService.js';

/** Session-authed ticket endpoints for the web app. */
export const ticketRouter = Router();

ticketRouter.use(requireAuth);

ticketRouter.post('/', async (req, res) => {
  const input = createFindingSchema.parse(req.body);
  const created = await ticketService.createFinding(req.session.accountId!, input, 'ui');
  res.status(201).json(created);
});

const recentQuerySchema = z.object({
  // The shared schema, not a local "short string" copy: this value is
  // interpolated into JQL downstream (shared/schemas/finding.ts).
  projectKey: projectKeySchema,
});

ticketRouter.get('/recent', async (req, res) => {
  const { projectKey } = recentQuerySchema.parse(req.query);
  res.json(await ticketService.listRecent(req.session.accountId!, projectKey, 10));
});
