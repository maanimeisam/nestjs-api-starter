# NestJS 12 Production REST Starter

A strict ESM starter for NestJS 12, PostgreSQL 18, TypeORM 1.1, Passport/JWT authentication, OpenAPI, Vitest, Docker, and GitHub Actions.

## Features

- Strict NestJS 12 ESM application with validated typed configuration
- PostgreSQL 18 entities and reversible TypeORM migrations
- Stateless access JWTs, rotating hashed refresh sessions, and typed roles
- Validation, Helmet, CORS, request IDs, structured logs, errors, and bounded rate limits
- OpenAPI, database health checks, Vitest, Docker, and CI

## Tech stack

NestJS 12, TypeScript, Express, PostgreSQL 18, TypeORM 1.1, Passport/JWT, Swagger, Vitest, oxlint, Prettier, and npm.

## Requirements

- Node 24.15 or newer in the Node 24 LTS line
- PostgreSQL 18
- npm

The repository targets Node 24 in `.nvmrc`, `.node-version`, Docker, and CI. Its engine range is `^24.15.0 || >=26.0.0`: developers already using a compatible Node 26 or newer release do not need to downgrade, while unsupported Node 25 releases are excluded.

## Quick start

After cloning this repository:

```bash
npm install
cp .env.example .env
docker compose up -d database
npm run migration:run
npm run start:dev
```

The API is available at `http://localhost:3000/api/v1`; Swagger UI is at `http://localhost:3000/api/docs` when enabled.

## Configuration

| Variable                    | Purpose                                | Default                 |
| --------------------------- | -------------------------------------- | ----------------------- |
| `NODE_ENV`                  | `development`, `test`, or `production` | `development`           |
| `APP_NAME`, `APP_VERSION`   | Service and OpenAPI identity           | starter values          |
| `PORT`                      | HTTP port                              | `3000`                  |
| `API_PREFIX`, `API_VERSION` | URI prefix and version                 | `api`, `1`              |
| `DATABASE_URL`              | PostgreSQL connection URL              | required                |
| `DATABASE_SSL`              | Require PostgreSQL TLS                 | `false`                 |
| `JWT_ACCESS_SECRET`         | Access-token signing secret            | required, 32+ chars     |
| `JWT_ACCESS_EXPIRES_IN`     | Access-token lifetime in seconds       | `900`                   |
| `JWT_REFRESH_SECRET`        | Refresh-token signing secret           | required, 32+ chars     |
| `JWT_REFRESH_EXPIRES_IN`    | Refresh-token lifetime in seconds      | `2592000`               |
| `CORS_ORIGINS`              | Comma-separated allowed origins        | `http://localhost:3000` |
| `SWAGGER_ENABLED`           | Serve Swagger UI and JSON              | `true`                  |
| `LOG_LEVEL`                 | Nest log threshold                     | `log`                   |
| `TRUST_PROXY_HOPS`          | Trusted reverse-proxy hop count        | `0`                     |
| `TEST_DATABASE_URL`         | Disposable PostgreSQL E2E database     | required for E2E        |
| `POSTGRES_USER/PASSWORD/DB` | Local Compose database settings        | `nestjs` starter values |

Startup validation rejects malformed configuration, example secrets in production, and wildcard production CORS. Use independent high-entropy JWT secrets in deployed environments.

## API

| Method | Route                   | Access        |
| ------ | ----------------------- | ------------- |
| `POST` | `/api/v1/auth/register` | Public        |
| `POST` | `/api/v1/auth/login`    | Public        |
| `POST` | `/api/v1/auth/refresh`  | Public        |
| `POST` | `/api/v1/auth/logout`   | Public        |
| `GET`  | `/api/v1/auth/me`       | Authenticated |
| `GET`  | `/api/v1/users/:id`     | Self or admin |
| `GET`  | `/api/v1/users`         | Admin         |
| `GET`  | `/api/v1/health`        | Public        |

Register, login, and refresh use a stricter 10-request/minute per-IP-and-route limit that replaces the 120-request/minute global policy for those routes. The built-in limiter is bounded and per process; use a shared proxy or datastore limiter when scaling horizontally.

### Authentication

Register and login return a user plus a bearer token pair. Send the access token in `Authorization: Bearer <token>` for protected routes, and send `{ "refreshToken": "..." }` to refresh or logout. Passwords use asynchronous Node `crypto.scrypt()` with a versioned, self-describing stored format. Refresh tokens are stored only as SHA-256 hashes and rotate transactionally. Logout revokes refresh sessions only: access JWTs remain stateless and valid until their short expiry, with no blacklist or per-request database lookup. Public input cannot assign roles; promote administrators only through a trusted operational database workflow.

## API documentation

Swagger UI is served at `/api/docs` and OpenAPI JSON at `/api/docs-json` when `SWAGGER_ENABLED=true`.

## Commands

| Command                                                      | Action                           |
| ------------------------------------------------------------ | -------------------------------- |
| `npm run start:dev`                                          | Run with watch mode              |
| `npm run build` / `npm run start:prod`                       | Build / run compiled ESM         |
| `npm run format` / `npm run format:check`                    | Write / check formatting         |
| `npm run lint` / `npm run lint:fix`                          | Check / fix oxlint findings      |
| `npm run typecheck`                                          | Strict TypeScript check          |
| `npm test` / `npm run test:cov`                              | Unit tests / coverage            |
| `npm run test:e2e`                                           | Migrated PostgreSQL E2E suite    |
| `npm run migration:create -- src/database/migrations/Name`   | Create a migration               |
| `npm run migration:generate -- src/database/migrations/Name` | Generate from entity changes     |
| `npm run migration:run` / `npm run migration:revert`         | Apply / revert source migrations |
| `npm run migration:run:prod`                                 | Apply compiled migrations        |

## Database and migrations

`synchronize` is disabled in every environment. Commit and review every generated migration, and verify it with `npm run migration:run`, `npm run migration:revert`, then `npm run migration:run` before release. Development commands use the ESM TypeScript DataSource; production commands use compiled JavaScript.

## Testing

Unit tests do not require PostgreSQL. E2E tests require `TEST_DATABASE_URL`; the database name must end in `_test`. The suite drops and recreates only its `public` schema, runs real migrations, then verifies health, Swagger, validation, conflicts, login, authorization, pagination, refresh rotation, consumed/revoked refresh-token rejection, logout, and continued access-token validity after logout.

```bash
cp .env.test.example .env.test
npm run test:e2e
```

The E2E command fails rather than silently skipping database verification when `TEST_DATABASE_URL` is absent or unsafe.

## Docker

```bash
docker compose up --build
```

Compose starts PostgreSQL 18 with persistent storage and health-based dependency ordering. The multi-stage Node 24 image contains production dependencies only, runs as the non-root `node` user, applies compiled migrations, and starts the compiled ESM service. Override the local Compose secrets before any non-local deployment.

## Architecture

```text
src/
  common/       guards, decorators, errors, request context, pagination
  config/       typed configuration and startup validation
  database/     shared TypeORM options, DataSource, migrations
  modules/
    auth/       JWTs, refresh sessions, asynchronous scrypt
    users/      users and role-based access
    health/     application and PostgreSQL health
```

## Adding a module

Create only the files the feature needs:

```text
src/modules/products/
  products.controller.ts  transport and HTTP contracts
  products.service.ts     business and persistence flow
  product.entity.ts       TypeORM mapping
  products.dto.ts         validation and response schemas
  products.module.ts      Nest wiring
```

Import the module in `AppModule`, add a migration for schema changes, and add unit or PostgreSQL-backed E2E coverage at the relevant boundary.

## Security and production checks

The bootstrap enables Helmet before other middleware, allowlisted CORS, strict DTO validation, request IDs, sanitized error responses, shutdown hooks, and structured JSON logs in production. Full `strictPropertyInitialization` is intentionally enabled even though the generated NestJS 12 ESM scaffold disables it.

Before release:

- replace example secrets and set the production `DATABASE_URL` and CORS allowlist
- run formatting, lint, type checking, unit tests, migration run/revert/run, build, and E2E tests
- validate Compose and build the container image
- terminate HTTPS at a trusted boundary and set `TRUST_PROXY_HOPS` precisely
- restrict and back up PostgreSQL; disable public Swagger if unnecessary
- put a shared rate limiter in front of multiple application instances

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © NestJS API Starter contributors.
