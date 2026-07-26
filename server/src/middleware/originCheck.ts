import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense in depth on top of SameSite=Lax cookies: state-changing
 * browser requests must come from our own origin.
 *
 * - Browsers always send Origin on cross-origin requests and on same-origin
 *   POSTs, so a forged cross-site request cannot pass the allowlist.
 * - Requests without an Origin header (curl, server-to-server) pass through:
 *   they don't carry ambient cookie credentials from a victim's browser.
 * - /api/v1/* is exempt — it authenticates with explicit API keys, not
 *   cookies, so CSRF does not apply.
 */
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!req.path.startsWith('/api/') || req.path.startsWith('/api/v1/')) return next();

  const origin = req.headers.origin;
  if (!origin) return next();

  const allowed = new Set([new URL(env.APP_URL).origin, env.SERVER_URL]);
  if (allowed.has(origin)) return next();

  next(
    new AppError(403, 'FORBIDDEN_ORIGIN', 'Request blocked: cross-site requests are not allowed.'),
  );
}
