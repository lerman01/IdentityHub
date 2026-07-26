import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { env, REPO_ROOT } from './config/env.js';
import { apiNotFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { originCheck } from './middleware/originCheck.js';
import { authRouter } from './modules/auth/authRoutes.js';
import { sessionMiddleware } from './session/index.js';

/**
 * Assembles the Express app. Kept separate from index.ts (which listens) so
 * tests can mount the app with supertest without opening a port.
 */
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(sessionMiddleware);
  app.use(originCheck);

  // ── API routes ─────────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  });

  app.use('/api/auth', authRouter);

  // Feature routers still to land:
  //   /api/jira      — OAuth flow, connection, projects (M2/M3)
  //   /api/tickets   — create + recent, session-authed (M3/M4)
  //   /api/api-keys  — key management (M5)
  //   /api/v1        — public API, key-authed (M5)

  app.use('/api', apiNotFoundHandler);

  // ── Static UI (production only; in dev Vite serves the UI on :5173) ────────
  if (env.isProd) {
    const webDist = path.join(REPO_ROOT, 'web', 'dist');
    if (fs.existsSync(webDist)) {
      app.use(express.static(webDist));
      // SPA fallback: any non-API GET renders the app shell.
      app.use((req, res, next) => {
        if (req.method !== 'GET') return next();
        res.sendFile(path.join(webDist, 'index.html'));
      });
    }
  }

  app.use(errorHandler);
  return app;
}
