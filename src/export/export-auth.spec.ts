import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { EnvironmentVariables } from '../config/environment.js';
import { LiveUpdatesService } from '../live/live-updates.service.js';
import { ExcelExportController } from './excel-export.controller.js';
import { ExcelExportService } from './excel-export.service.js';
import {
  ExportAuthService,
  MAX_FAILED_ATTEMPTS,
  SESSION_TTL_MS,
} from './export-auth.service.js';
import { ExportSessionGuard } from './export-session.guard.js';
import { buildMemberOverview } from './member-overview.js';
import { MemberOverviewService } from './member-overview.service.js';

const USERNAME = 'admin';
const PASSWORD = 'correct-horse-battery';
const LOGIN = { username: USERNAME, password: PASSWORD };

function configWith(credentials: Partial<EnvironmentVariables>) {
  return {
    get: (key: keyof EnvironmentVariables) => credentials[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

describe('admin page login', () => {
  let app: INestApplication;

  async function createApp(
    credentials: Partial<EnvironmentVariables> = {
      EXPORT_USERNAME: USERNAME,
      EXPORT_PASSWORD: PASSWORD,
    },
  ) {
    const moduleRef = await Test.createTestingModule({
      controllers: [ExcelExportController],
      providers: [
        ExportAuthService,
        ExportSessionGuard,
        LiveUpdatesService,
        {
          provide: ExcelExportService,
          useValue: {
            createUsersWorkbook: vi
              .fn()
              .mockResolvedValue(Buffer.from('xlsx-data')),
          },
        },
        {
          provide: MemberOverviewService,
          useValue: {
            getOverview: vi.fn().mockResolvedValue(
              buildMemberOverview({
                now: new Date('2026-11-04T13:30:00Z'),
                discordConnected: true,
                guildName: 'Guild',
                members: [],
                registeredUsers: [],
                verifiedRoleIds: [],
              }),
            ),
          },
        },
        { provide: ConfigService, useValue: configWith(credentials) },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    return app.getHttpServer();
  }

  async function loginCookie(server: unknown): Promise<string> {
    const response = await request(server as never)
      .post('/export-excel/api/login')
      .send(LOGIN)
      .expect(200);

    return (response.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
  }

  afterEach(async () => {
    await app?.close();
  });

  it('serves the page shell without a login (it holds no data)', async () => {
    const server = await createApp();

    const response = await request(server).get('/export-excel');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it.each([
    '/export-excel/api/events',
    '/export-excel/api/session',
    '/export-excel/api/overview',
    '/export-excel/download',
  ])('rejects %s without a session', async (path) => {
    const server = await createApp();

    const response = await request(server).get(path);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(
      'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
    );
  });

  it('rejects a wrong password', async () => {
    const server = await createApp();

    const response = await request(server)
      .post('/export-excel/api/login')
      .send({ username: USERNAME, password: 'wrong-password' });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Sai tên đăng nhập hoặc mật khẩu.');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a login without fields', async () => {
    const server = await createApp();

    const response = await request(server)
      .post('/export-excel/api/login')
      .send({ username: USERNAME });

    expect(response.status).toBe(400);
  });

  it('sets an HttpOnly, Secure, SameSite=Strict session cookie scoped to the admin page', async () => {
    const server = await createApp();

    const response = await request(server)
      .post('/export-excel/api/login')
      .send(LOGIN);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ username: USERNAME });
    const cookie = (response.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/^export_session=[\w-]+\.\d+\.[\w-]+;/);
    expect(cookie).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`);
    expect(cookie).toContain('Path=/export-excel');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('gives a logged-in admin the session, member data and the Excel file', async () => {
    const server = await createApp();
    const cookie = await loginCookie(server);

    await request(server)
      .get('/export-excel/api/session')
      .set('Cookie', cookie)
      .expect(200, { username: USERNAME });

    const overview = await request(server)
      .get('/export-excel/api/overview')
      .set('Cookie', cookie)
      .expect(200);
    expect(overview.body).toMatchObject({
      guildName: 'Guild',
      generatedAt: '2026-11-04T13:30:00.000Z',
    });

    const download = await request(server)
      .get('/export-excel/download')
      .set('Cookie', cookie)
      .expect(200);
    expect(download.headers['content-disposition']).toBe(
      'attachment; filename="users-export.xlsx"',
    );
    expect(download.headers['cache-control']).toBe('no-store');
  });

  it('streams live events to a logged-in admin', async () => {
    const server = await createApp();
    const cookie = await loginCookie(server);
    await app.listen(0);
    const controller = new AbortController();

    try {
      const response = await fetch(
        `${await app.getUrl()}/export-excel/api/events`,
        { headers: { cookie }, signal: controller.signal },
      );
      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      const { value } = await reader.read();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      expect(new TextDecoder().decode(value)).toContain('event: ready');
    } finally {
      controller.abort();
    }
  });

  it('rejects a tampered session cookie', async () => {
    const server = await createApp();
    const cookie = await loginCookie(server);
    const [name, token] = cookie.split('=');
    const [user, , signature] = token.split('.');
    const forged = `${name}=${user}.${Date.now() + SESSION_TTL_MS * 100}.${signature}`;

    await request(server)
      .get('/export-excel/api/overview')
      .set('Cookie', forged)
      .expect(401);
  });

  it('clears the cookie on logout', async () => {
    const server = await createApp();

    const response = await request(server)
      .post('/export-excel/api/logout')
      .expect(204);

    expect((response.headers['set-cookie'] as unknown as string[])[0]).toMatch(
      /^export_session=; Max-Age=0;/,
    );
  });

  it('hides every admin route (404) when no login is configured', async () => {
    const server = await createApp({});

    await request(server).get('/export-excel').expect(404);
    await request(server)
      .post('/export-excel/api/login')
      .send(LOGIN)
      .expect(404);
    await request(server).get('/export-excel/api/overview').expect(404);
    await request(server).get('/export-excel/download').expect(404);
  });

  it('blocks a client IP after too many failed logins, even with the right password', async () => {
    const server = await createApp();

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await request(server)
        .post('/export-excel/api/login')
        .set('X-Forwarded-For', '203.0.113.7')
        .send({ username: USERNAME, password: `wrong-${i}` })
        .expect(401);
    }

    const blocked = await request(server)
      .post('/export-excel/api/login')
      .set('X-Forwarded-For', '203.0.113.7')
      .send(LOGIN);
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toContain('thử lại sau 15 phút');

    // Another client is not affected.
    await request(server)
      .post('/export-excel/api/login')
      .set('X-Forwarded-For', '198.51.100.9')
      .send(LOGIN)
      .expect(200);
  });

  it('uses the last X-Forwarded-For entry so a forged prefix cannot dodge the block', async () => {
    const server = await createApp();

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await request(server)
        .post('/export-excel/api/login')
        .set('X-Forwarded-For', `10.0.0.${i}, 203.0.113.7`)
        .send({ username: USERNAME, password: `wrong-${i}` })
        .expect(401);
    }

    await request(server)
      .post('/export-excel/api/login')
      .set('X-Forwarded-For', '10.9.9.9, 203.0.113.7')
      .send(LOGIN)
      .expect(429);
  });
});

describe('ExportAuthService sessions', () => {
  const service = new ExportAuthService(
    configWith({ EXPORT_USERNAME: USERNAME, EXPORT_PASSWORD: PASSWORD }),
  );

  it('accepts its own token until it expires', () => {
    const issuedAt = Date.UTC(2026, 10, 4, 12);
    const token = service.createSessionToken(USERNAME, issuedAt);

    expect(service.verifySessionToken(token, issuedAt + 1000)).toBe(USERNAME);
    expect(
      service.verifySessionToken(token, issuedAt + SESSION_TTL_MS + 1),
    ).toBeNull();
  });

  it('rejects tokens signed by another process (e.g. before a restart)', () => {
    const other = new ExportAuthService(
      configWith({ EXPORT_USERNAME: USERNAME, EXPORT_PASSWORD: PASSWORD }),
    );

    expect(
      service.verifySessionToken(other.createSessionToken(USERNAME)),
    ).toBeNull();
  });

  it.each([undefined, '', 'garbage', 'a.b', 'a.b.c.d'])(
    'rejects a malformed token %s',
    (token) => {
      expect(service.verifySessionToken(token)).toBeNull();
    },
  );
});
