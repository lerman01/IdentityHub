import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import {
  disconnect,
  getStatus,
  handleCallback,
  selectSite,
  startOAuth,
  type CallbackResult,
} from './jiraConnectionService.js';

export const jiraRouter = Router();

/** Dashboard URL with a status flag the UI turns into a toast. */
function appRedirect(flag: string, reason?: string): string {
  const url = new URL('/', env.APP_URL);
  url.searchParams.set('jira', flag);
  if (reason) url.searchParams.set('reason', reason);
  return url.toString();
}

/**
 * Browser NAVIGATION endpoints (not fetch calls): failures redirect back into
 * the app instead of rendering JSON to a lost user.
 */
jiraRouter.get('/oauth/start', (req, res, next) => {
  if (!req.session.userId) return res.redirect(new URL('/login', env.APP_URL).toString());
  if (!env.jiraOAuthConfigured) return res.redirect(appRedirect('error', 'not-configured'));

  const authorizeUrl = startOAuth(req.session);
  // Persist the state nonce before leaving for Atlassian.
  req.session.save((err) => (err ? next(err) : res.redirect(authorizeUrl)));
});

jiraRouter.get('/oauth/callback', async (req, res) => {
  if (!req.session.userId) return res.redirect(new URL('/login', env.APP_URL).toString());

  const q = req.query;
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

  let result: CallbackResult;
  try {
    result = await handleCallback(req.session, req.session.userId, {
      code: str(q.code),
      state: str(q.state),
      error: str(q.error),
    });
  } catch (err) {
    const reason = err instanceof AppError ? err.code.toLowerCase() : 'unknown';
    logger.error('OAuth callback failed', {
      reason,
      error: err instanceof Error ? err.message : String(err),
    });
    result = { kind: 'error', reason };
  }

  const target =
    result.kind === 'error' ? appRedirect('error', result.reason) : appRedirect(result.kind);

  // The callback mutated the session (state consumed, maybe pending sites) —
  // make sure that's on disk before the browser moves on.
  req.session.save(() => res.redirect(target));
});

// ── JSON endpoints for the app ────────────────────────────────────────────────

jiraRouter.get('/connection', requireAuth, (req, res) => {
  res.json(getStatus(req.session, req.session.userId!));
});

const selectSiteSchema = z.object({ cloudId: z.string().min(1).max(200) });

jiraRouter.post('/site', requireAuth, async (req, res) => {
  const { cloudId } = selectSiteSchema.parse(req.body);
  await selectSite(req.session, req.session.userId!, cloudId);
  res.json(getStatus(req.session, req.session.userId!));
});

jiraRouter.delete('/connection', requireAuth, (req, res) => {
  disconnect(req.session.userId!);
  res.status(204).end();
});
