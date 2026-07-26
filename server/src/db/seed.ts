import { userRepo } from './repositories/userRepo.js';
import { hashPassword } from '../lib/crypto.js';

/**
 * Seeds the demo login so a reviewer can try the app without registering.
 * Idempotent: safe to run any number of times.
 */
export const DEMO_EMAIL = 'demo@identityhub.local';
export const DEMO_PASSWORD = 'demo-password-123';

const existing = userRepo.findByEmail(DEMO_EMAIL);
if (existing) {
  console.log(`Demo user already exists: ${DEMO_EMAIL}`);
} else {
  userRepo.create(DEMO_EMAIL, await hashPassword(DEMO_PASSWORD));
  console.log(`Created demo user.`);
}
console.log(`\nSign in with:\n  Email:    ${DEMO_EMAIL}\n  Password: ${DEMO_PASSWORD}\n`);
