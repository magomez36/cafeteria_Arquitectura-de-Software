import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

describe('GET /health', () => {
  let app: INestApplication;
  beforeAll(async () => { const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = moduleRef.createNestApplication(); await app.listen(0); });
  afterAll(async () => { await app.close(); });
  it('returns HTTP 200 with ok state', async () => {
    const server = app.getHttpServer();
    const address = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
