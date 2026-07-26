/**
 * Runs before any module import in each test file. Presets take precedence
 * over the root .env because dotenv never overrides existing variables —
 * tests get an isolated in-memory database and deterministic secrets.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef0123456789abcdef';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
// Keep external integrations firmly off in tests.
process.env.ATLASSIAN_CLIENT_ID = '';
process.env.ATLASSIAN_CLIENT_SECRET = '';
process.env.GROQ_API_KEY = '';
