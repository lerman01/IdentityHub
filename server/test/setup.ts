/**
 * Runs before any module import in each test file. Presets take precedence
 * over the root .env because dotenv never overrides existing variables —
 * tests get an isolated in-memory database and deterministic secrets.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef0123456789abcdef';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
// The Atlassian credentials are required at boot, so tests need placeholders.
// They are never used against the network: every test that touches Atlassian
// mocks the module (see oauthState.test.ts).
process.env.ATLASSIAN_CLIENT_ID = 'test-client-id';
process.env.ATLASSIAN_CLIENT_SECRET = 'test-client-secret';
// Keep the optional AI integration firmly off.
process.env.GROQ_API_KEY = '';
