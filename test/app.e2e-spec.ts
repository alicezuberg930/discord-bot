import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ status: 'ok', service: 'discord-bot' });
  });

  it('/ping (GET)', () => {
    return request(app.getHttpServer()).get('/ping').expect(200).expect({
      status: 'disabled',
      gatewayPingMs: null,
      bot: null,
      guildCount: 0,
      uptimeMs: null,
    });
  });

  it('/question (POST) validates its request body', () => {
    return request(app.getHttpServer())
      .post('/question')
      .send({ question: '' })
      .expect(400)
      .expect({
        message: 'question must be a non-empty string',
        error: 'Bad Request',
        statusCode: 400,
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
