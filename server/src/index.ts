import cron from 'node-cron';
import { env } from './config/env.js';
import './db/connection.js';
import { createApp } from './app.js';
import { runBlogDigest } from './jobs/blogDigest.js';
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

  // Optional in-process scheduler for the blog digest (bonus feature).
  // Manual runs stay available regardless: `npm run digest`.
  if (env.DIGEST_CRON) {
    if (!cron.validate(env.DIGEST_CRON)) {
      logger.warn(`DIGEST_CRON "${env.DIGEST_CRON}" is not a valid cron expression — ignored.`);
    } else {
      cron.schedule(env.DIGEST_CRON, async () => {
        try {
          const result = await runBlogDigest();
          logger.info({ ...result }, 'Scheduled digest finished');
        } catch (err) {
          logger.error(
            {
              error: err instanceof Error ? err.message : String(err),
            },
            'Scheduled digest failed',
          );
        }
      });
      logger.info(`Blog digest scheduled (cron: ${env.DIGEST_CRON})`);
    }
  }
});
