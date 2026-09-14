import { existsSync } from 'node:fs';

if (existsSync('.env.test')) process.loadEnvFile('.env.test');

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for PostgreSQL E2E tests');
}

const databaseName = decodeURIComponent(
  new URL(testDatabaseUrl).pathname.slice(1),
);
if (!databaseName.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL database name must end in _test');
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;
process.env.DATABASE_SSL ??= 'false';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-at-least-32-characters';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-at-least-32-characters';
process.env.JWT_ACCESS_EXPIRES_IN ??= '900';
process.env.JWT_REFRESH_EXPIRES_IN ??= '2592000';
process.env.CORS_ORIGINS ??= 'http://localhost:3000';
process.env.SWAGGER_ENABLED ??= 'true';
