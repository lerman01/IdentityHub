import { Router } from 'express';
import { getSession } from '../modules/jira/jiraConnectionService.js';
import { SESSION_COOKIE_NAME } from './index.js';

/**
 * The session's own endpoints, mounted at /api/auth.
 *
 * Signing *in* is not here: authorizing Atlassian is what creates the session,
 * so it lives in the Jira module (docs/DECISIONS.md #2). What remains is
 * reading the current session and ending it — which is why this sits beside
 * the store and the middleware rather than in a module of its own.
 */
export const sessionRouter = Router();

/**
 * Returns { account: null } rather than 401 for anonymous visitors — "who am
 * I" legitimately has a "nobody yet" answer, and it keeps the client's session
 * bootstrap free of error handling.
 */
sessionRouter.get('/me', (req, res) => {
  res.json(getSession(req.session.accountId));
});

sessionRouter.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(SESSION_COOKIE_NAME);
    res.status(204).end();
  });
});
