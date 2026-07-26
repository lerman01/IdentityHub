import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@identityhub/shared';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

function send(res: Response, status: number, code: string, message: string, details?: unknown) {
  const body: ApiErrorBody = { error: { code, message, ...(details ? { details } : {}) } };
  res.status(status).json(body);
}

/** Terminal 404 for unknown /api paths, so clients always get the JSON envelope. */
export function apiNotFoundHandler(req: Request, res: Response) {
  send(res, 404, 'NOT_FOUND', `No route for ${req.method} ${req.path}.`);
}

/**
 * Last middleware in the chain. Maps the three shapes we throw on purpose
 * (AppError, ZodError, everything else) onto the shared error envelope.
 */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    return send(res, 400, 'VALIDATION_ERROR', 'Some fields are invalid or missing.', details);
  }

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error(`${err.code}: ${err.message}`, { path: req.path, cause: String(err.cause ?? '') });
    }
    return send(res, err.status, err.code, err.message, err.details);
  }

  // Unexpected: log the real error, return a generic message (no internals leak).
  logger.error('Unhandled error', {
    path: req.path,
    error: err instanceof Error ? (err.stack ?? err.message) : String(err),
  });
  return send(res, 500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.');
}
