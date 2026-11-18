/* eslint-disable @typescript-eslint/no-explicit-any -- mide cuerpos JSON arbitrarios */
import 'reflect-metadata';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { runner } from 'node-pg-migrate';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { CatalogModule } from '../catalog.module';
import {
  CATALOG_AUTHORIZER,
  type Actor,
  type CatalogAuthorizer,
  type RequestHeaders,
} from '../domain/authorization';

/**
 * Mediciones de rendimiento LOCALES (SC-001 / SC-002). Se ejecutan solo con CATALOG_PERF=1:
 *   CATALOG_PERF=1 pnpm --filter @cafeteria/api exec jest catalog/tests/perf
 * No son una prueba de carga de producción: API, Postgres y Redis corren en la misma máquina, en
 * contenedores, con un conjunto de datos sintético. Sirven para detectar regresiones y comparar,
 * no para certificar p95 < 300 ms en el entorno real.
 */
const enabled = process.env.CATALOG_PERF === '1';
jest.setTimeout(600_000);

const testAuthorizer: CatalogAuthorizer = {
  authenticate(headers: RequestHeaders): Promise<Actor | null> {
    return Promise.resolve(
      headers['x-test-actor'] === 'admin' ? { id: 'admin-1', roles: ['admin'] } : null,
    );
  },
};

const percentile = (sorted: number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
const summarize = (samples: number[]) => {
  const s = [...samples].sort((a, b) => a - b);
  return {
    n: s.length,
    p50: +percentile(s, 50).toFixed(1),
    p95: +percentile(s, 95).toFixed(1),
    p99: +percentile(s, 99).toFixed(1),
    max: +s[s.length - 1]!.toFixed(1),
  };
};

(enabled ? describe : describe.skip)('rendimiento local del catálogo (opt-in)', () => {
  let postgres: StartedTestContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let base: string;

  const api = async (method: string, url: string, body?: unknown, ifMatch?: string) => {
    const res = await fetch(`${base}/api/v1/catalog${url}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-test-actor': 'admin',
        ...(ifMatch ? { 'if-match': ifMatch } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return {
      status: res.status,
      body: text ? JSON.parse(text) : null,
      etag: res.headers.get('etag'),
    };
  };

  beforeAll(async () => {
    postgres = await new GenericContainer('postgres:17-alpine')
      .withEnvironment({
        POSTGRES_USER: 'cafeteria',
        POSTGRES_PASSWORD: 'test-only',
        POSTGRES_DB: 'cafeteria_test',
      })
      .withExposedPorts(5432)
      .start();
    redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    const databaseUrl = `postgresql://cafeteria:test-only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/cafeteria_test`;
    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
    await runner({
      databaseUrl,
      dir: path.resolve(__dirname, '../migrations'),
      direction: 'up',
      migrationsTable: 'cafeteria_migrations',
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
      log: () => undefined,
    });
    const moduleRef = await Test.createTestingModule({ imports: [CatalogModule] })
      .overrideProvider(CATALOG_AUTHORIZER)
      .useValue(testAuthorizer)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0);
    base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  });
  afterAll(async () => {
    await app?.close();
    await postgres?.stop();
    await redis?.stop();
  });

  /** Menú con `categories` categorías y `perCategory` productos cada una, publicado. */
  const seedMenu = async (name: string, categories: number, perCategory: number) => {
    const created = await api('POST', '/admin/menus', { name });
    let etag = created.etag!;
    const allDay = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
      dayOfWeek,
      startsAt: '00:00',
      endsAt: '23:59',
    }));
    const updated = await api(
      'PUT',
      `/admin/menus/${created.body.id}`,
      { name, schedule: allDay },
      etag,
    );
    etag = updated.etag!;
    const productIds: string[] = [];
    for (let c = 0; c < categories; c++) {
      const cat = await api(
        'POST',
        `/admin/menus/${created.body.id}/categories`,
        { name: `${name} cat ${c}` },
        etag,
      );
      etag = cat.etag!;
      const categoryId = cat.body.categories[c].categoryId as string;
      const ids: string[] = [];
      for (let p = 0; p < perCategory; p++) {
        const prod = await api('POST', '/admin/products', {
          name: `${name} ${c}-${p}`,
          description: 'Producto sintético para medir rendimiento',
          priceMinor: 100 + p,
          imageUrl: 'https://cdn.example/p.jpg',
          imageAlt: 'Producto',
          allergens: p % 3 === 0 ? ['leche'] : [],
          allergensDeclared: true,
        });
        ids.push(prod.body.productId);
      }
      const set = await api(
        'PUT',
        `/admin/menus/${created.body.id}/categories/${categoryId}/items`,
        { productIds: ids },
        etag,
      );
      etag = set.etag!;
      productIds.push(...ids);
    }
    const pub = await api('POST', `/admin/menus/${created.body.id}/publish`, undefined, etag);
    expect(pub.status).toBe(201);
    return { menuId: created.body.id as string, productIds };
  };

  /** `total` peticiones con `concurrency` en vuelo; devuelve latencias en ms. */
  const load = async (url: string, total: number, concurrency: number) => {
    const latencies: number[] = [];
    let next = 0;
    let errors = 0;
    const started = performance.now();
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (next < total) {
          next++;
          const t0 = performance.now();
          const res = await fetch(`${base}/api/v1/catalog${url}`);
          await res.arrayBuffer();
          latencies.push(performance.now() - t0);
          if (res.status !== 200) errors++;
        }
      }),
    );
    const seconds = (performance.now() - started) / 1000;
    return { ...summarize(latencies), errors, rps: +(total / seconds).toFixed(0) };
  };

  it('GET /menus: caché caliente y fría con ~180 productos; publicar→visible en 30 muestras', async () => {
    const menus = [
      await seedMenu('Desayunos', 4, 15),
      await seedMenu('Almuerzos', 4, 15),
      await seedMenu('Cenas', 4, 15),
    ];

    // Calentamiento (JIT, pools) y medición con caché caliente
    await load('/menus', 200, 10);
    const warm = await load('/menus', 3000, 30);

    // «Frío»: cada petición cambia el epoch (invalida) justo antes de leer ⇒ siempre llega a Postgres
    const cold: number[] = [];
    const product = menus[0]!.productIds[0]!;
    for (let i = 0; i < 60; i++) {
      await api('PATCH', `/admin/products/${product}/availability`, {
        availability: i % 2 ? 'available' : 'sold_out',
      });
      const t0 = performance.now();
      const res = await fetch(`${base}/api/v1/catalog/menus`);
      await res.arrayBuffer();
      cold.push(performance.now() - t0);
    }

    // Publicar → visible (SC-002): mismo cliente, lectura inmediata tras la respuesta de publicar
    const toVisible: number[] = [];
    const target = menus[1]!;
    for (let i = 0; i < 30; i++) {
      const draft = await api('GET', `/admin/menus/${target.menuId}`);
      const rename = await api(
        'PUT',
        `/admin/menus/${target.menuId}`,
        { name: `Almuerzos v${i}`, schedule: draft.body.schedule },
        draft.etag!,
      );
      const t0 = performance.now();
      const pub = await api(
        'POST',
        `/admin/menus/${target.menuId}/publish`,
        undefined,
        rename.etag!,
      );
      expect(pub.status).toBe(201);
      for (;;) {
        const res = await fetch(`${base}/api/v1/catalog/menus`);
        const body: any = await res.json();
        if (body.menus.some((m: any) => m.name === `Almuerzos v${i}`)) break;
        if (performance.now() - t0 > 10_000) throw new Error('no visible en 10 s');
      }
      toVisible.push(performance.now() - t0);
    }

    const report = {
      dataset: { menus: 3, productsPerMenu: 60, concurrency: 30 },
      warmCache: warm,
      coldCache_sequential: summarize(cold),
      publishToVisible_ms: summarize(toVisible),
      note: 'Medición local en contenedores; no es evidencia de producción.',
    };
    console.log(`CATALOG_PERF_REPORT ${JSON.stringify(report)}`);
    expect(warm.errors).toBe(0);
    expect(summarize(toVisible).max).toBeLessThan(10_000); // SC-002: < 10 s
  });
});
