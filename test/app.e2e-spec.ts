import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { createHmac } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

const TEST_JWT_SECRET = 'test-jwt-secret';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;

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
      .expect('Hello World!');
  });

  it('/sources (POST) rejects malformed JSON uploads', () => {
    return request(app.getHttpServer())
      .post('/sources')
      .set('Authorization', `Bearer ${createJwt(['source_writer'])}`)
      .attach('file', Buffer.from('{'), {
        contentType: 'application/json',
        filename: 'source.json',
      })
      .expect(400)
      .expect({
        error: 'Bad Request',
        message: 'The uploaded file must contain valid JSON.',
        statusCode: 400,
      });
  });

  it('/sources (POST) rejects an upload without a JWT', () => {
    return request(app.getHttpServer()).post('/sources').expect(401);
  });

  it('/sources (POST) rejects a JWT without the source writer role', () => {
    return request(app.getHttpServer())
      .post('/sources')
      .set('Authorization', `Bearer ${createJwt(['reader'])}`)
      .attach('file', Buffer.from('{"valid":true}'), {
        contentType: 'application/json',
        filename: 'source.json',
      })
      .expect(403);
  });

  it('/sources (POST) throttles repeated requests from one client', async () => {
    for (let requestCount = 0; requestCount < 10; requestCount += 1) {
      await request(app.getHttpServer()).post('/sources').expect(401);
    }

    await request(app.getHttpServer()).post('/sources').expect(429);
  });

  afterEach(async () => {
    await app.close();
  });

  function createJwt(roles: string[]): string {
    const encode = (value: object): string =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsignedToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      roles,
      sub: 'test-user',
    })}`;
    const signature = createHmac('sha256', TEST_JWT_SECRET)
      .update(unsignedToken)
      .digest('base64url');

    return `${unsignedToken}.${signature}`;
  }
});
