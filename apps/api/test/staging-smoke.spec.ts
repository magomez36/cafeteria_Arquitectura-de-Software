import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

describe('API staging smoke contract', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    if (process.env.API_BASE_URL) {
      baseUrl = process.env.API_BASE_URL.replace(/\/$/, '');
      return;
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns the stable health contract from the API', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
