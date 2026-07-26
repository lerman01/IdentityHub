import { env } from './config/env.js';
import './db/connection.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';

const app = createApp();

// Configuration is validated at import time (config/env.ts): a missing or
// malformed value prints what's wrong and exits before we reach this point.
app.listen(env.PORT, () => {
  logger.info(`IdentityHub API listening on ${env.SERVER_URL}`);
  if (!env.isProd) {
    logger.info(`Web app (Vite dev server): ${env.APP_URL}`);
  }
});
