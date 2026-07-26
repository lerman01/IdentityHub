import { AppError } from '../lib/errors.js';
import { DigestConfigError, runBlogDigest } from './blogDigest.js';

/**
 * CLI entry point: `npm run digest`. The same job can also run on a schedule
 * inside the server process (set DIGEST_CRON in .env).
 */

console.log('IdentityHub — NHI Blog Digest\n');

try {
  const result = await runBlogDigest();

  if (result.status === 'created') {
    console.log(`✔ Created ${result.issueKey} (${result.method} summary)`);
    console.log(`  Post:   ${result.postTitle}`);
    console.log(`  Ticket: ${result.url}\n`);
  } else {
    console.log(`• Skipped: ${result.reason}`);
    console.log(`  Latest post: ${result.postTitle}\n`);
  }
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
