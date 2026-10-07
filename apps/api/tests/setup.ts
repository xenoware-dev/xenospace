/**
 * Test environment.
 *
 * Secrets are fixed (not random) so a token minted in one test is verifiable in
 * another, and NODE_ENV=test routes the database layer to an in-memory PGlite
 * instance that is thrown away with the process.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-chars-long!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars-long!';
process.env.ENCRYPTION_KEY = 'test-encryption-key-at-least-32-chars-long!';
process.env.CSRF_SECRET = 'test-csrf-secret-at-least-32-characters-ok!!';
process.env.COOKIE_SECURE = 'false';
process.env.LOG_LEVEL = 'silent';
// Lower than the default so the lockout test does not need 8 round trips.
process.env.LOGIN_MAX_ATTEMPTS = '4';
process.env.LOGIN_LOCKOUT_MINUTES = '15';
