import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../../utils/errors.js';

/** Gate for browser-session routes. Public-API routes use requireApiKey instead. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.session.accountId) {
    return next(unauthorized('Your session has expired. Please sign in again.'));
  }
  next();
}
