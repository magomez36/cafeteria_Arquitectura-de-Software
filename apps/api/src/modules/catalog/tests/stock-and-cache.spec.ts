/* eslint-disable @typescript-eslint/no-explicit-any -- el test inspecciona cuerpos JSON arbitrarios de la API */
import 'reflect-metadata';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { runner } from 'node-pg-migrate';
import { Client } from 'pg';
import { createClient } from 'redis';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { CatalogService } from '../application/catalog.service';
import { CatalogModule } from '../catalog.module';
import {
  CATALOG_AUTHORIZER,
  type Actor,
  type CatalogAuthorizer,
  type RequestHeaders,
} from '../domain/authorization';

jest.setTimeout(240_000);

/** SOLO PARA TESTS: simula a Identity. */
const testAuthorizer: CatalogAuthorizer = {
  authenticate(headers: RequestHeaders): Promise<Actor | null> {
    return Promise.resolve(
      headers['x-test-actor'] === 'admin' ? { id: 'admin-1', roles: ['admin'] } : null,
    );
  },
};

describe('T051 descuento de existencias y T015 caché/Redis (Postgres + Redis reales)', () => {
  let postgres: StartedTestContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let service: CatalogService;
  let base: string;
  let db: Client;
  let probe: ReturnType<typeof createClient>;

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
  const publicProducts = async (): Promise<{ status: number; products: any[] }> => {
    const res = await fetch(`${base}/api/v1/catalog/menus`);
    const body: any = await res.json();
    return {
      status: res.status,
      products: body.menus.flatMap((m: any) => m.categories.flatMap((c: any) => c.products)),
    };
  };

  /** Crea y publica un menú con un producto con `stock` existencias. */
  const seedPublished = async (name: string, stock: number | null) => {
    const created = await api('POST', '/admin/menus', { name });
    const p = await api('POST', '/admin/products', {
      name,
      description: 'Producto de prueba',
      priceMinor: 300,
      imageUrl: 'https://cdn.example/p.jpg',
      imageAlt: 'Foto del producto',
      allergens: [],
      allergensDeclared: true,
    });
    const productId = p.body.productId as string;
    let menu = await api(
      'POST',
      `/admin/menus/${created.body.id}/categories`,
      { name: 'Cat' },
      created.etag!,
    );
    menu = await api(
      'PUT',
      `/admin/menus/${created.body.id}/categories/${menu.body.categories[0].categoryId}/items`,
      { productIds: [productId] },
      menu.etag!,
    );
    const pub = await api('POST', `/admin/menus/${created.body.id}/publish`, undefined, menu.etag!);
    expect(pub.status).toBe(201);
    if (stock !== null) {
      const s = await api('PATCH', `/admin/products/${productId}/availability`, {
        stockQuantity: stock,
      });
      expect(s.status).toBe(200);
    }
    return productId;
  };
  const stockOf = async (id: string) =>
    (
      await db.query('SELECT stock_quantity, availability FROM catalog.products WHERE id = $1', [
        id,
      ])
    ).rows[0];

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
    const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;
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
    service = moduleRef.get(CatalogService);
    db = new Client({ connectionString: databaseUrl });
    await db.connect();
    probe = createClient({ url: redisUrl });
    probe.on('error', () => undefined);
    await probe.connect();
  });

  afterAll(async () => {
    try {
      probe?.destroy();
    } catch {
      // ya cerrado
    }
    await db?.end();
    await app?.close();
    await postgres?.stop();
    await redis?.stop().catch(() => undefined);
  });

  describe('T051 – applyConfirmedSale (aislado; sin Orders)', () => {
    it('descuenta existencias, marca agotado al llegar a 0 y es idempotente por saleId', async () => {
      const id = await seedPublished('Sándwich', 3);
      const first = await service.applyConfirmedSale('sale-1', [{ productId: id, quantity: 2 }]);
      expect(first).toEqual({ applied: true, soldOut: [] });
      expect((await stockOf(id)).stock_quantity).toBe(1);
      // Reintento de la misma venta: no vuelve a descontar
      const retry = await service.applyConfirmedSale('sale-1', [{ productId: id, quantity: 2 }]);
      expect(retry.applied).toBe(false);
      expect((await stockOf(id)).stock_quantity).toBe(1);
      // La última unidad agota el producto y se refleja en la tienda al instante
      const last = await service.applyConfirmedSale('sale-2', [{ productId: id, quantity: 1 }]);
      expect(last).toEqual({ applied: true, soldOut: [id] });
      expect(await stockOf(id)).toMatchObject({ stock_quantity: 0, availability: 'sold_out' });
      const shown = (await publicProducts()).products.find((p) => p.productId === id);
      expect(shown.availability).toBe('sold_out');
      expect(shown.purchasable).toBe(false);
    });

    it('todo o nada: sin existencias suficientes no descuenta nada ni registra la venta', async () => {
      const a = await seedPublished('Tostada', 5);
      const b = await seedPublished('Jugo', 1);
      await expect(
        service.applyConfirmedSale('sale-3', [
          { productId: a, quantity: 2 },
          { productId: b, quantity: 2 },
        ]),
      ).rejects.toMatchObject({ code: 'conflict', status: 409 });
      expect((await stockOf(a)).stock_quantity).toBe(5);
      expect((await stockOf(b)).stock_quantity).toBe(1);
      expect(
        (await db.query("SELECT 1 FROM catalog.stock_consumptions WHERE sale_id = 'sale-3'"))
          .rowCount,
      ).toBe(0);
      // La venta se puede reintentar cuando hay existencias
      await service.applyConfirmedSale('sale-3', [{ productId: a, quantity: 2 }]);
      expect((await stockOf(a)).stock_quantity).toBe(3);
    });

    it('concurrencia: 12 ventas distintas de 1 unidad sobre 5 existencias ⇒ exactamente 5 confirman', async () => {
      const id = await seedPublished('Galleta', 5);
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) =>
          service.applyConfirmedSale(`race-${i}`, [{ productId: id, quantity: 1 }]),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(7);
      expect(await stockOf(id)).toMatchObject({ stock_quantity: 0, availability: 'sold_out' });
    });

    it('concurrencia: la misma venta enviada 8 veces en paralelo descuenta una sola vez', async () => {
      const id = await seedPublished('Brownie', 10);
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          service.applyConfirmedSale('dup-1', [{ productId: id, quantity: 3 }]),
        ),
      );
      expect(results.filter((r) => r.applied)).toHaveLength(1);
      expect((await stockOf(id)).stock_quantity).toBe(7);
    });

    it('productos sin control de existencias no cambian; entradas inválidas se rechazan; queda auditoría', async () => {
      const id = await seedPublished('Agua', null);
      const res = await service.applyConfirmedSale('sale-4', [{ productId: id, quantity: 4 }]);
      expect(res.applied).toBe(true);
      expect((await stockOf(id)).stock_quantity).toBeNull();
      await expect(service.applyConfirmedSale('x', [])).rejects.toMatchObject({ status: 422 });
      await expect(
        service.applyConfirmedSale('x', [{ productId: id, quantity: 0 }]),
      ).rejects.toMatchObject({ status: 422 });
      const tracked = await seedPublished('Café', 4);
      await service.applyConfirmedSale('sale-5', [{ productId: tracked, quantity: 1 }]);
      const audit = await db.query(
        "SELECT actor_id, changes FROM catalog.audit_log WHERE entity_id = $1 AND action = 'stock_consumed'",
        [tracked],
      );
      expect(audit.rows[0]).toMatchObject({
        actor_id: 'sale:sale-5',
        changes: { stockQuantity: { from: 4, to: 3 } },
      });
      // El registro de ventas es de solo anexar
      await expect(db.query('DELETE FROM catalog.stock_consumptions')).rejects.toThrow(
        /solo anexar/,
      );
    });
  });

  describe('T015 – caché pública', () => {
    it('la clave tiene TTL ≤ 5 s y expira sola; sin invalidar, un cambio directo en BD se ve tras el TTL', async () => {
      const id = await seedPublished('Té frío', null);
      await publicProducts(); // llena la caché
      const keys = (await probe.keys('catalog:public:*')) as string[];
      expect(keys.length).toBeGreaterThan(0);
      const watched = keys[keys.length - 1]!;
      const ttl = await probe.ttl(watched);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(5);
      // Cambio que no pasa por el servicio (no invalida): la caché puede servir el dato anterior...
      await db.query("UPDATE catalog.products SET name = 'Té frío grande' WHERE id = $1", [id]);
      // ...pero el nombre sale del snapshot publicado, así que usamos disponibilidad (capa en vivo).
      await db.query("UPDATE catalog.products SET availability = 'sold_out' WHERE id = $1", [id]);
      await new Promise((r) => setTimeout(r, 5500));
      const after = (await publicProducts()).products.find((p) => p.productId === id);
      expect(after.availability).toBe('sold_out'); // tras el TTL se ve aunque no hubo invalidación
      expect(await probe.exists(watched)).toBe(0); // la clave original expiró
    });

    it('con Redis caído la lectura pública sigue respondiendo desde Postgres (degradación)', async () => {
      const id = await seedPublished('Chocolate', null);
      expect((await publicProducts()).products.some((p) => p.productId === id)).toBe(true);
      await redis.stop();
      const started = Date.now();
      const res = await publicProducts();
      expect(res.status).toBe(200);
      expect(res.products.some((p) => p.productId === id)).toBe(true);
      // Una escritura que invalida también debe seguir funcionando
      const patch = await api('PATCH', `/admin/products/${id}/availability`, {
        availability: 'sold_out',
      });
      expect(patch.status).toBe(200);
      const again = (await publicProducts()).products.find((p) => p.productId === id);
      expect(again.availability).toBe('sold_out');
      // Cota generosa: la degradación no debe colgar la petición (connectTimeout de 500 ms)
      expect(Date.now() - started).toBeLessThan(5000);
    });
  });
});
