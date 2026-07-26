import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth.js';
import { apiKeyService } from './apiKeyService.js';

/** Session-authed key management for the web app. */
export const apiKeyRouter = Router();

apiKeyRouter.use(requireAuth);

apiKeyRouter.get('/', (req, res) => {
  res.json(apiKeyService.list(req.session.userId!));
});

const createKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the key a name (e.g. "prod-scanner").')
    .max(60, 'Key names are limited to 60 characters.'),
});

apiKeyRouter.post('/', (req, res) => {
  const { name } = createKeySchema.parse(req.body);
  res.status(201).json(apiKeyService.create(req.session.userId!, name));
});

const keyIdSchema = z.object({ id: z.uuid() });

apiKeyRouter.delete('/:id', (req, res) => {
  const { id } = keyIdSchema.parse(req.params);
  apiKeyService.revoke(req.session.userId!, id);
  res.status(204).end();
});
