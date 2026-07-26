import { env } from './config/env.js';
import './db/connection.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`IdentityHub API listening on ${env.SERVER_URL}`);
  if (!env.isProd) {
    logger.info(`Web app (Vite dev server): ${env.APP_URL}`);
  }
  if (!env.jiraOAuthConfigured) {
    logger.warn(
      'Atlassian OAuth is not configured yet — Jira features are disabled. ' +
        'See README → "Create your Atlassian OAuth app".',
    );
  }
});
