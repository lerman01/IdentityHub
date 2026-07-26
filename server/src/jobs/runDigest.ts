import { AppError } from '../lib/errors.js';
import { DigestConfigError, runBlogDigest } from './blogDigest.js';

/**
 * Entry point for the bonus feature: `npm run digest`.
 *
 * Deliberately separate from the server process — the assignment notes the
 * digest is external to the UI, so nothing in the API imports it. Schedule it
 * with whatever the host already has (cron, Task Scheduler, a CI job) rather
 * than building a scheduler into the app.
 */

console.log('IdentityHub — NHI Blog Digest\n');

try {
  const result = await runBlogDigest();
  console.log(`✔ Created ${result.issueKey} (${result.method} summary)`);
  console.log(`  Post:   ${result.postTitle}`);
  console.log(`  Ticket: ${result.url}\n`);
  process.exit(0);
} catch (err) {
  if (err instanceof DigestConfigError) {
    console.error(`✖ Configuration problem:\n  ${err.message}\n`);
  } else if (err instanceof AppError) {
    console.error(`✖ ${err.code}: ${err.message}\n`);
  } else {
    console.error('✖ Unexpected error:', err instanceof Error ? err.message : err, '\n');
  }
  process.exit(1);
}
