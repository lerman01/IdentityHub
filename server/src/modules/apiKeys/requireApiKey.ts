import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../utils/errors.js';
import { apiKeyService } from './service.js';

/**
 * Authentication for the machine-facing public API. Accepts either header:
 *   Authorization: Bearer ihk_xxx     (preferred)
 *   X-API-Key: ihk_xxx
 */
export function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const headerKey = req.headers['x-api-key'];
  const key = bearer ?? (typeof headerKey === 'string' ? headerKey : undefined);

  if (!key) {
    return next(
      new AppError(
        401,
        'API_KEY_MISSING',
        'Provide an API key: "Authorization: Bearer <key>" or "X-API-Key: <key>". ' +
          'Keys are created in the IdentityHub UI under API keys.',
      ),
    );
  }

  const auth = apiKeyService.verify(key.trim());
  if (!auth) {
    return next(
      new AppError(401, 'API_KEY_INVALID', 'This API key is not valid or has been revoked.'),
    );
  }

  req.apiKeyAuth = auth;
  next();
}
