import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/configure-app.js';
import { createDatabaseOptions } from '../src/database/database.options.js';
import { InitialSchema1760000000000 } from '../src/database/migrations/1760000000000-InitialSchema.js';
import { RefreshSession } from '../src/modules/auth/refresh-session.entity.js';
import { Role, User } from '../src/modules/users/user.entity.js';

interface RegisteredUser {
  user: { id: string; email: string; username: string; role: Role };
  tokens: { accessToken: string; refreshToken: string };
}

describe('REST API (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let sequence = 0;

  const credentials = () => {
    sequence += 1;
    return {
      email: `person${sequence}@example.com`,
      username: `person_${sequence}`,
      password: 'correct horse battery staple',
    };
  };

  const register = async (): Promise<RegisteredUser> => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials())
      .expect(201);
    return response.body as RegisteredUser;
  };

  beforeAll(async () => {
    dataSource = new DataSource({
      ...createDatabaseOptions(process.env.TEST_DATABASE_URL!, false, false),
      entities: [User, RefreshSession],
      migrations: [InitialSchema1760000000000],
    });
    await dataSource.initialize();
    await dataSource.query('DROP SCHEMA public CASCADE');
    await dataSource.query('CREATE SCHEMA public');
    await dataSource.runMigrations();

    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('reports application and PostgreSQL health and generates OpenAPI', async () => {
    const requestId = 'e2e-health-request';
    const health = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', requestId)
      .expect(200);
    expect(health.headers['x-request-id']).toBe(requestId);
    expect(health.body.status).toBe('ok');
    expect(health.body.info.database.status).toBe('up');

    const swagger = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(swagger.body.openapi).toBe('3.0.0');
    expect(swagger.body.paths['/api/v1/auth/register']).toBeDefined();
  });

  it('validates registration, rejects role injection, and reports conflicts', async () => {
    const invalid = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('X-Request-Id', 'not valid whitespace')
      .send({ email: 'invalid', username: 'x', password: 'short' })
      .expect(400);
    expect(invalid.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      path: '/api/v1/auth/register',
    });
    expect(invalid.body.requestId).not.toBe('not valid whitespace');
    expect(invalid.body.timestamp).toBeTypeOf('string');

    const input = credentials();
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...input, role: Role.ADMIN })
      .expect(400);
    const created = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        ...input,
        email: `  ${input.email.toUpperCase()}  `,
        username: `  ${input.username.toUpperCase()}  `,
      })
      .expect(201);
    expect(created.body.user).toMatchObject({
      email: input.email,
      username: input.username,
      role: Role.USER,
    });
    expect(created.body.user.passwordHash).toBeUndefined();

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...credentials(), email: input.email })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...credentials(), username: input.username })
      .expect(409);
  });

  it('logs in with valid credentials and rejects invalid credentials', async () => {
    const input = credentials();
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(input)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: input.email, password: 'incorrect password' })
      .expect(401);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: input.email.toUpperCase(), password: input.password })
      .expect(200);
    expect(response.body.tokens).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
    });
  });

  it('enforces authentication, self access, admin access, and pagination', async () => {
    const member = await register();
    const other = await register();
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${member.tokens.accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(member.user.id));
    await request(app.getHttpServer())
      .get(`/api/v1/users/${other.user.id}`)
      .set('Authorization', `Bearer ${member.tokens.accessToken}`)
      .expect(403);

    await dataSource.getRepository(User).update(member.user.id, {
      role: Role.ADMIN,
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: member.user.email,
        password: 'correct horse battery staple',
      })
      .expect(200);
    const adminToken = login.body.tokens.accessToken as string;
    await request(app.getHttpServer())
      .get(`/api/v1/users/${other.user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const page = await request(app.getHttpServer())
      .get('/api/v1/users?page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.meta).toMatchObject({
      page: 1,
      limit: 1,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it('allows exactly one concurrent refresh rotation', async () => {
    const registered = await register();
    const refresh = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: registered.tokens.refreshToken });
    const responses = await Promise.all([refresh(), refresh()]);

    expect(
      responses.map(({ status }) => status).sort((left, right) => left - right),
    ).toEqual([200, 401]);
    const rotated = responses.find(({ status }) => status === 200);
    const rotatedBody = rotated?.body as { refreshToken?: unknown } | undefined;
    if (typeof rotatedBody?.refreshToken !== 'string') {
      throw new Error('Successful refresh response did not contain a token');
    }
    expect(rotatedBody.refreshToken).not.toBe(registered.tokens.refreshToken);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotatedBody.refreshToken })
      .expect(200);
  });

  it('revokes refresh sessions on logout without blacklisting access tokens', async () => {
    const registered = await register();
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: registered.tokens.refreshToken })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: registered.tokens.refreshToken })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: registered.tokens.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registered.tokens.accessToken}`)
      .expect(200);
  });
});
