import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/configure-app';

@Module({})
class CorsTestModule {}

describe('Web CORS configuration without external infrastructure', () => {
  let app: INestApplication;
  const previous = process.env.WEB_CORS_ORIGINS;
  afterEach(async () => {
    if (app) await app.close();
    if (previous === undefined) delete process.env.WEB_CORS_ORIGINS;
    else process.env.WEB_CORS_ORIGINS = previous;
  });
  async function setup(origins?: string) {
    if (origins === undefined) delete process.env.WEB_CORS_ORIGINS;
    else process.env.WEB_CORS_ORIGINS = origins;
    const module = await Test.createTestingModule({
      imports: [CorsTestModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  }
  it.each(['http://127.0.0.1:5173', 'http://localhost:5173'])(
    'allows the explicit web origin %s and required headers without cookies',
    async (origin) => {
      await setup('http://localhost:5173, http://127.0.0.1:5173');
      const result = await request(app.getHttpServer())
        .options('/auth/login')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type')
        .expect(204);
      expect(result.headers['access-control-allow-origin']).toBe(origin);
      expect(result.headers['access-control-allow-methods']).toBe('GET,POST');
      expect(result.headers['access-control-allow-headers']).toBe(
        'Authorization,Content-Type',
      );
      expect(result.headers['access-control-expose-headers']).toBe(
        'Retry-After',
      );
      expect(
        result.headers['access-control-allow-credentials'],
      ).toBeUndefined();
      const denied = await request(app.getHttpServer())
        .options('/auth/login')
        .set('Origin', 'https://unapproved.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    },
  );
  it('keeps CORS disabled when no origins are configured', async () => {
    await setup();
    const result = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Origin', 'http://localhost:5173');
    expect(result.headers['access-control-allow-origin']).toBeUndefined();
    const preflight = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(404);
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });
  it.each([
    '*',
    'http://localhost:5173/',
    'https://example.com/path',
    'https://user:pass@example.com',
    'null',
    'https://example.com,',
  ])('rejects unsafe origin configuration %s', async (origin) => {
    await expect(setup(origin)).rejects.toThrow(
      'WEB_CORS_ORIGINS must contain explicit HTTP(S) origins',
    );
  });
});
