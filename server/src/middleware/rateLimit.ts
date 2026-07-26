import { rateLimit, type Options } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';

function limiter(options: Partial<Options> & { message: string }) {
  const { message, ...rest } = options;
  return rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Tests hammer endpoints intentionally; don't rate-limit them.
    skip: () => env.isTest,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({ error: { code: 'RATE_LIMITED', message } });
    },
    ...rest,
  });
}

/** Brute-force protection on credential endpoints. */
export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
});

/** Baseline protection for the machine-facing public API. */
export const publicApiLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 60,
  message: 'Rate limit exceeded: at most 60 requests per minute. Slow down and retry.',
});
