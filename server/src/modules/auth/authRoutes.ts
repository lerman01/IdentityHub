import { Router, type Request } from 'express';
import { loginSchema, registerSchema, type UserDto } from '@identityhub/shared';
import { authLimiter } from '../../middleware/rateLimit.js';
import { authService } from './authService.js';

/**
 * Browser auth endpoints. Controllers stay thin: parse with the shared Zod
 * schema, call the service, shape the response. Errors bubble to the central
 * error handler (Zod → 400, AppError → its status).
 * (Express 5 forwards async handler rejections to the error middleware, so no
 * try/catch wrappers are needed.)
 */
export const authRouter = Router();

/** Promotes the session on successful auth. Regenerating defeats session fixation. */
function establishSession(req: Request, user: UserDto): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err instanceof Error ? err : new Error(String(err)));
      req.session.userId = user.id;
      req.session.save((saveErr) => {
        if (saveErr) return reject(saveErr instanceof Error ? saveErr : new Error(String(saveErr)));
        resolve();
      });
    });
  });
}

authRouter.post('/register', authLimiter, async (req, res) => {
  const { email, password } = registerSchema.parse(req.body);
  const user = await authService.register(email, password);
  await establishSession(req, user);
  res.status(201).json({ user });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await authService.login(email, password);
  await establishSession(req, user);
  res.json({ user });
});

authRouter.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('identityhub.sid');
    res.status(204).end();
  });
});

/**
 * Returns { user: null } instead of 401 for anonymous visitors — "who am I"
 * legitimately has a "nobody yet" answer, and it keeps the client's session
 * bootstrap free of error handling.
 */
authRouter.get('/me', (req, res) => {
  res.json({ user: authService.me(req.session.userId) });
});
