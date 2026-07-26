import { Router } from 'express';
import { z } from 'zod';
import { createFindingSchema } from '@identityhub/shared';
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
  projectKey: z.string().trim().min(1, 'projectKey is required').max(50),
});

ticketRouter.get('/recent', async (req, res) => {
  const { projectKey } = recentQuerySchema.parse(req.query);
  res.json(await ticketService.listRecent(req.session.accountId!, projectKey.toUpperCase(), 10));
});
