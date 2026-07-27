/**
 * The one error type the HTTP layer knows how to render. Services throw
 * AppErrors with end-user-safe messages; anything else becomes a generic 500
 * (details stay in the server log, never in the response).
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}

export const unauthorized = (message = 'You need to sign in to do that.') =>
  new AppError(401, 'UNAUTHENTICATED', message);

export const notFound = (message = 'Not found.') => new AppError(404, 'NOT_FOUND', message);

export const conflict = (code: string, message: string) => new AppError(409, code, message);

export const upstreamError = (code: string, message: string, cause?: unknown) =>
  new AppError(502, code, message, undefined, { cause });
