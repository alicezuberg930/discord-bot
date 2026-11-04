import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { EnvironmentVariables } from '../config/environment.js';
import { ExcelExportController } from './excel-export.controller.js';
import { ExcelExportService } from './excel-export.service.js';
import {
  ExportBasicAuthGuard,
  MAX_FAILED_ATTEMPTS,
} from './export-basic-auth.guard.js';

const USERNAME = 'admin';
const PASSWORD = 'correct-horse-battery';

function basic(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('GET /export-excel login', () => {
  let app: INestApplication;

  async function createApp(credentials: Partial<EnvironmentVariables>) {
    const moduleRef = await Test.createTestingModule({
      controllers: [ExcelExportController],
      providers: [
        ExportBasicAuthGuard,
        {
          provide: ExcelExportService,
          useValue: {
            createUsersWorkbook: vi
              .fn()
              .mockResolvedValue(Buffer.from('xlsx-data')),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: keyof EnvironmentVariables) => credentials[key],
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  afterEach(async () => {
    await app?.close();
  });

  it('asks the browser for a login when no credentials are sent', async () => {
    await createApp({ EXPORT_USERNAME: USERNAME, EXPORT_PASSWORD: PASSWORD });

    const response = await request(app.getHttpServer()).get('/export-excel');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe(
      'Basic realm="Discord bot export", charset="UTF-8"',
    );
  });

  it('rejects a wrong password', async () => {
    await createApp({ EXPORT_USERNAME: USERNAME, EXPORT_PASSWORD: PASSWORD });

    const response = await request(app.getHttpServer())
      .get('/export-excel')
      .set('Authorization', basic(USERNAME, 'wrong-password'));

    expect(response.status).toBe(401);
  });

  it('downloads the workbook with the correct login', async () => {
    await createApp({ EXPORT_USERNAME: USERNAME, EXPORT_PASSWORD: PASSWORD });

    const response = await request(app.getHttpServer())
      .get('/export-excel')
      .set('Authorization', basic(USERNAME, PASSWORD));

    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="users-export.xlsx"',
    );
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('accepts a password that contains ":"', async () => {
    const password = 'with:colon:inside';
    await createApp({ EXPORT_USERNAME: USERNAME, EXPORT_PASSWORD: password });

    const response = await request(app.getHttpServer())
      .get('/export-excel')
      .set('Authorization', basic(USERNAME, password));

    expect(response.status).toBe(200);
  });

  it('is hidden (404) when no login is configured', async () => {
    await createApp({});

    const response = await request(app.getHttpServer())
      .get('/export-excel')
      .set('Authorization', basic(USERNAME, PASSWORD));

    expect(response.status).toBe(404);
  });

  it('blocks a client IP after too many failed logins, even with the right password', async () => {
    await createApp({ EXPORT_USERNAME: USERNAME, EXPORT_PASSWORD: PASSWORD });
    const server = app.getHttpServer();

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await request(server)
        .get('/export-excel')
        .set('X-Forwarded-For', '203.0.113.7')
        .set('Authorization', basic(USERNAME, `wrong-${i}`))
        .expect(401);
    }

    await request(server)
      .get('/export-excel')
      .set('X-Forwarded-For', '203.0.113.7')
      .set('Authorization', basic(USERNAME, PASSWORD))
      .expect(429);

    // Another client is not affected.
    await request(server)
      .get('/export-excel')
      .set('X-Forwarded-For', '198.51.100.9')
      .set('Authorization', basic(USERNAME, PASSWORD))
      .expect(200);
  });

  it('uses the last X-Forwarded-For entry so a forged prefix cannot dodge the block', async () => {
    await createApp({ EXPORT_USERNAME: USERNAME, EXPORT_PASSWORD: PASSWORD });
    const server = app.getHttpServer();

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await request(server)
        .get('/export-excel')
        .set('X-Forwarded-For', `10.0.0.${i}, 203.0.113.7`)
        .set('Authorization', basic(USERNAME, `wrong-${i}`))
        .expect(401);
    }

    await request(server)
      .get('/export-excel')
      .set('X-Forwarded-For', '10.9.9.9, 203.0.113.7')
      .set('Authorization', basic(USERNAME, PASSWORD))
      .expect(429);
  });
});
