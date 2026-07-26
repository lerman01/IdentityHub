import { Router } from 'express';
import { SESSION_COOKIE_NAME } from '../../session/index.js';
import { getSession } from '../jira/jiraConnectionService.js';

/**
 * Sign-in itself lives in the Jira router, because authorizing Atlassian is
 * what creates the session (docs/DECISIONS.md #2). What remains here is the
 * session's other two verbs.
 */
export const authRouter = Router();

/**
 * Returns { account: null } rather than 401 for anonymous visitors — "who am
 * I" legitimately has a "nobody yet" answer, and it lets the login page learn
 * whether the server has Atlassian credentials configured at the same time.
 */
authRouter.get('/me', (req, res) => {
  res.json(getSession(req.session.accountId));
});

authRouter.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(SESSION_COOKIE_NAME);
    res.status(204).end();
  });
});
