import { Router } from 'express';
import { z } from 'zod';
import { createFindingSchema, projectKeySchema } from '@identityhub/shared';
import { searchProjects } from '../../integrations/jira/client.js';
import { requireAuth } from '../session/requireAuth.js';
import { ticketService } from './service.js';

/** Session-authed ticket endpoints for the web app, mounted at /api/tickets. */
export const ticketRouter = Router();

ticketRouter.use(requireAuth);

/**
 * The ticket form's project picker. It exists only to supply the `projectKey`
 * the endpoints below take, so it lives on the ticket router rather than
 * anywhere Jira-shaped.
 */
ticketRouter.get('/projects', async (req, res) => {
  res.json(await searchProjects(req.session.accountId!));
});

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
