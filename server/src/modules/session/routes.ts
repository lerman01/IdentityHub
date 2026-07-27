import { Router } from 'express';
import { SESSION_COOKIE_NAME } from './middleware.js';
import { getSession } from './service.js';

/**
 * The session's own endpoints, mounted at /api/session: reading the current
 * session and ending it. Signing *in* is /api/auth (modules/auth).
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
