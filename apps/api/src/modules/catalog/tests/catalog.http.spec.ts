/* eslint-disable @typescript-eslint/no-explicit-any -- el test inspecciona cuerpos JSON arbitrarios de la API */
import 'reflect-metadata';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { runner } from 'node-pg-migrate';
import { Client } from 'pg';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { CatalogModule } from '../catalog.module';
import { localTime } from '../domain/schedule';
import {
  CATALOG_AUTHORIZER,
  type Actor,
  type CatalogAuthorizer,
  type RequestHeaders,
} from '../domain/authorization';

jest.setTimeout(240_000);

/** SOLO PARA TESTS: simula a Identity. El código de producción no lee esta cabecera. */
const testAuthorizer: CatalogAuthorizer = {
  authenticate(headers: RequestHeaders): Promise<Actor | null> {
    const who = headers['x-test-actor'];
    if (who === 'admin') return Promise.resolve({ id: 'admin-1', roles: ['admin'] });
    if (who === 'admin-2') return Promise.resolve({ id: 'admin-2', roles: ['admin'] });
    if (who === 'staff') return Promise.resolve({ id: 'staff-1', roles: ['staff'] });
    return Promise.resolve(null);
  },
};

interface Res<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

describe('Catálogo vía HTTP (Postgres + Redis reales)', () => {
  let postgres: StartedTestContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let denyApp: INestApplication;
  let base: string;
  let denyBase: string;

  const call = async (
    root: string,
    method: string,
    url: string,
    opts: { actor?: string; body?: unknown; ifMatch?: string } = {},
  ): Promise<Res> => {
    const response = await fetch(`${root}/api/v1/catalog${url}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(opts.actor ? { 'x-test-actor': opts.actor } : {}),
        ...(opts.ifMatch ? { 'if-match': opts.ifMatch } : {}),
      },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
      headers: response.headers,
    };
  };
  const api = (m: string, u: string, o?: Parameters<typeof call>[3]): Promise<Res> =>
    call(base, m, u, o);

  const productBody = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    name: 'Capuchino',
    description: 'Espresso con leche espumada',
    priceMinor: 250,
    imageUrl: 'https://cdn.example/capuchino.jpg',
    imageAlt: 'Capuchino con arte latte',
    allergens: ['leche'],
    allergensDeclared: true,
    ...over,
  });

  const publicProducts = async (query = ''): Promise<any[]> => {
    const res = await api('GET', `/menus${query}`);
    return res.body.menus.flatMap((m: any) => m.categories.flatMap((c: any) => c.products));
  };

  /** Crea menú + categoría + producto completo, devuelve ids y revisión vigente. */
  const seedMenu = async (name: string, product: Record<string, unknown> = productBody()) => {
    const created = await api('POST', '/admin/menus', { actor: 'admin', body: { name } });
    const menuId = created.body.id as string;
    const p = await api('POST', '/admin/products', { actor: 'admin', body: product });
    let menu = await api('POST', `/admin/menus/${menuId}/categories`, {
      actor: 'admin',
      ifMatch: created.headers.get('etag')!,
      body: { name: 'Bebidas' },
    });
    const categoryId = menu.body.categories[0].categoryId as string;
    menu = await api('PUT', `/admin/menus/${menuId}/categories/${categoryId}/items`, {
      actor: 'admin',
      ifMatch: menu.headers.get('etag')!,
      body: { productIds: [p.body.productId] },
    });
    return {
      menuId,
      categoryId,
      productId: p.body.productId as string,
      etag: menu.headers.get('etag')!,
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

    const open = async (override: boolean): Promise<{ app: INestApplication; url: string }> => {
      let builder = Test.createTestingModule({ imports: [CatalogModule] });
      if (override) builder = builder.overrideProvider(CATALOG_AUTHORIZER).useValue(testAuthorizer);
      const moduleRef = await builder.compile();
      const nest = moduleRef.createNestApplication();
      nest.setGlobalPrefix('api/v1');
      await nest.listen(0);
      const { port } = nest.getHttpServer().address() as { port: number };
      return { app: nest, url: `http://127.0.0.1:${port}` };
    };
    ({ app, url: base } = await open(true));
    ({ app: denyApp, url: denyBase } = await open(false));
  });

  afterAll(async () => {
    await app?.close();
    await denyApp?.close();
    await postgres?.stop();
    await redis?.stop();
  });

  describe('seguridad (deny-by-default)', () => {
    it('sin autoridad de identidad todas las rutas admin devuelven 401, aunque se envíen cabeceras de rol', async () => {
      for (const [method, url] of [
        ['GET', '/admin/menus'],
        ['POST', '/admin/menus'],
        ['GET', '/admin/products'],
        ['PATCH', '/admin/products/3f2504e0-4f89-41d3-9a0c-0305e82c3301/availability'],
      ] as const) {
        const res = await fetch(`${denyBase}/api/v1/catalog${url}`, {
          method,
          headers: {
            'x-role': 'admin',
            'x-test-actor': 'admin',
            'content-type': 'application/json',
          },
          body: method === 'GET' ? null : '{}',
        });
        expect(res.status).toBe(401);
      }
    });

    it('con la autoridad de prueba, una petición anónima también es 401', async () => {
      expect((await api('GET', '/admin/menus')).status).toBe(401);
    });

    it('la lectura pública no requiere sesión y es cacheable de forma corta', async () => {
      const res = await api('GET', '/menus');
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=3');
      expect(res.body.allergens).toHaveLength(14); // lista cerrada para el filtro de la web
    });
  });

  describe('US2 – borrador, previsualización y publicación', () => {
    it('un borrador es privado, se previsualiza y se bloquea si falta alt/alérgenos; al corregirlo se publica y se ve en <10 s', async () => {
      const incomplete = productBody({
        name: 'Latte borrador',
        imageAlt: null,
        allergens: [],
        allergensDeclared: false,
      });
      const { menuId, productId, etag } = await seedMenu('Menú US2', incomplete);

      // Borrador invisible para clientes
      const names = (await publicProducts()).map((p) => p.name);
      expect(names).not.toContain('Latte borrador');
      expect(JSON.stringify((await api('GET', '/menus')).body)).not.toContain('Menú US2');

      // Previsualización: solo administración
      expect((await api('GET', `/admin/menus/${menuId}/preview`)).status).toBe(401);
      const preview = await api('GET', `/admin/menus/${menuId}/preview`, { actor: 'admin' });
      expect(preview.body.categories[0].products[0].name).toBe('Latte borrador');

      // Publicación bloqueada con detalle de qué falta
      const blocked = await api('POST', `/admin/menus/${menuId}/publish`, {
        actor: 'admin',
        ifMatch: etag,
      });
      expect(blocked.status).toBe(422);
      expect(blocked.body.error.code).toBe('publish_blocked');
      const messages = blocked.body.error.details.map((d: any) => d.message).join(' | ');
      expect(messages).toMatch(/texto alternativo/);
      expect(messages).toMatch(/alérgenos/);
      expect((await publicProducts()).map((p) => p.name)).not.toContain('Latte borrador');

      // Se completa el producto y se publica
      const product = await api('GET', '/admin/products', { actor: 'admin' });
      const row = product.body.products.find((p: any) => p.productId === productId);
      const fixed = await api('PUT', `/admin/products/${productId}`, {
        actor: 'admin',
        ifMatch: `W/"${row.revision}"`,
        body: productBody({ name: 'Latte borrador' }),
      });
      expect(fixed.status).toBe(200);

      const started = Date.now();
      const published = await api('POST', `/admin/menus/${menuId}/publish`, {
        actor: 'admin',
        ifMatch: etag,
      });
      expect(published.status).toBe(201);
      expect(published.body.versionNumber).toBe(1);
      const visible = await publicProducts();
      const elapsedMs = Date.now() - started;
      expect(visible.map((p) => p.name)).toContain('Latte borrador');
      expect(elapsedMs).toBeLessThan(10_000);
      // Evidencia (no es una medición de carga): tiempo publicar→visible en este entorno local.
      console.info(`[SC-002 evidencia local] publicar→visible: ${elapsedMs} ms`);
    });
  });

  describe('US3 – versiones, historial, restauración y concurrencia', () => {
    it('cambiar un precio y republicar crea versión nueva; restaurar vuelve a la anterior; el historial dice quién/cuándo/qué', async () => {
      const { menuId, productId, etag } = await seedMenu(
        'Menú US3',
        productBody({ name: 'Mocha' }),
      );
      await api('POST', `/admin/menus/${menuId}/publish`, { actor: 'admin', ifMatch: etag });
      expect((await publicProducts()).find((p) => p.name === 'Mocha').unitPrice.amountMinor).toBe(
        250,
      );

      // El borrador cambia de precio, pero la tienda NO cambia hasta publicar
      const rows = (await api('GET', '/admin/products', { actor: 'admin' })).body.products;
      const rev = rows.find((p: any) => p.productId === productId).revision;
      await api('PUT', `/admin/products/${productId}`, {
        actor: 'admin',
        ifMatch: `W/"${rev}"`,
        body: productBody({ name: 'Mocha', priceMinor: 300 }),
      });
      expect((await publicProducts()).find((p) => p.name === 'Mocha').unitPrice.amountMinor).toBe(
        250,
      );

      const current = await api('GET', `/admin/menus/${menuId}`, { actor: 'admin' });
      const v2 = await api('POST', `/admin/menus/${menuId}/publish`, {
        actor: 'admin-2',
        ifMatch: current.headers.get('etag')!,
      });
      expect(v2.status).toBe(201);
      expect(v2.body.versionNumber).toBe(2);
      expect((await publicProducts()).find((p) => p.name === 'Mocha').unitPrice.amountMinor).toBe(
        300,
      );

      // Historial
      const history = await api('GET', `/admin/menus/${menuId}/versions`, { actor: 'admin' });
      const [latest, first] = history.body.versions;
      expect(latest).toMatchObject({ versionNumber: 2, publishedBy: 'admin-2' });
      expect(first).toMatchObject({ versionNumber: 1, publishedBy: 'admin-1' });
      expect(latest.changes).toEqual([
        expect.objectContaining({
          type: 'product_changed',
          field: 'priceMinor',
          from: 250,
          to: 300,
        }),
      ]);
      expect(typeof latest.publishedAt).toBe('string');
      // Solo quien tiene audit.read
      expect((await api('GET', `/admin/menus/${menuId}/versions`, { actor: 'staff' })).status).toBe(
        403,
      );

      // Restaurar v1 ⇒ versión 3 con el contenido de v1
      const latestEtag = (
        await api('GET', `/admin/menus/${menuId}`, { actor: 'admin' })
      ).headers.get('etag')!;
      const restored = await api('POST', `/admin/menus/${menuId}/versions/1/restore`, {
        actor: 'admin',
        ifMatch: latestEtag,
      });
      expect(restored.status).toBe(201);
      expect(restored.body.versionNumber).toBe(3);
      expect((await publicProducts()).find((p) => p.name === 'Mocha').unitPrice.amountMinor).toBe(
        250,
      );
      const after = await api('GET', `/admin/menus/${menuId}/versions`, { actor: 'admin' });
      expect(after.body.versions).toHaveLength(3);
      expect(after.body.versions[0].restoredFromVersion).toBe(1);
    });

    it('contrato para pedidos: el producto expone precio base y versión de la que sale', async () => {
      const { menuId, productId, etag } = await seedMenu(
        'Menú contrato',
        productBody({ name: 'Té' }),
      );
      await api('POST', `/admin/menus/${menuId}/publish`, { actor: 'admin', ifMatch: etag });
      const res = await api('GET', `/products/${productId}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        productId,
        unitPrice: { amountMinor: 250, currency: 'USD' },
        available: true,
      });
      expect(res.body.menuVersionId).toEqual(expect.any(String));
      expect((await api('GET', '/products/3f2504e0-4f89-41d3-9a0c-0305e82c3301')).status).toBe(404);
    });

    it('dos administradores: el segundo en guardar recibe 409 y no sobrescribe', async () => {
      const created = await api('POST', '/admin/menus', {
        actor: 'admin',
        body: { name: 'Concurrente' },
      });
      const menuId = created.body.id;
      const etag = created.headers.get('etag')!; // ambos parten de la misma revisión
      const first = await api('PUT', `/admin/menus/${menuId}`, {
        actor: 'admin',
        ifMatch: etag,
        body: { name: 'Cambio del admin 1', schedule: [] },
      });
      expect(first.status).toBe(200);
      const second = await api('PUT', `/admin/menus/${menuId}`, {
        actor: 'admin-2',
        ifMatch: etag,
        body: { name: 'Cambio del admin 2', schedule: [] },
      });
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('conflict');
      const stored = await api('GET', `/admin/menus/${menuId}`, { actor: 'admin' });
      expect(stored.body.name).toBe('Cambio del admin 1');
    });

    it('ediciones simultáneas reales: de N guardados con la misma revisión solo uno gana', async () => {
      const created = await api('POST', '/admin/menus', {
        actor: 'admin',
        body: { name: 'Carrera' },
      });
      const etag = created.headers.get('etag')!;
      const results = await Promise.all(
        [1, 2, 3, 4, 5].map((n) =>
          api('PUT', `/admin/menus/${created.body.id}`, {
            actor: 'admin',
            ifMatch: etag,
            body: { name: `Editor ${n}`, schedule: [] },
          }),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    });

    it('sin If-Match se exige la precondición (428)', async () => {
      const created = await api('POST', '/admin/menus', {
        actor: 'admin',
        body: { name: 'Sin etag' },
      });
      const res = await api('PUT', `/admin/menus/${created.body.id}`, {
        actor: 'admin',
        body: { name: 'x', schedule: [] },
      });
      expect(res.status).toBe(428);
    });
  });

  describe('US1 – consulta pública, filtros y horario', () => {
    it('filtra alérgenos, muestra etiquetas, alt y precios; menús solapados sin duplicar', async () => {
      const a = await seedMenu(
        'Menú A',
        productBody({ name: 'Pan integral', allergens: ['gluten'] }),
      );
      await api('POST', `/admin/menus/${a.menuId}/publish`, { actor: 'admin', ifMatch: a.etag });

      const all = await publicProducts();
      const pan = all.find((p) => p.name === 'Pan integral');
      expect(pan).toMatchObject({
        imageAlt: 'Capuchino con arte latte',
        allergens: [{ code: 'gluten', label: 'Cereales con gluten' }],
        purchasable: true,
      });
      expect((await publicProducts('?excludeAllergens=gluten')).map((p) => p.name)).not.toContain(
        'Pan integral',
      );
      expect((await api('GET', '/menus?excludeAllergens=chocolate')).status).toBe(422);
      expect((await api('GET', '/menus?category=no-es-uuid')).status).toBe(422);

      // Segundo menú vigente con el mismo producto y categoría con el mismo nombre
      const b = await api('POST', '/admin/menus', { actor: 'admin', body: { name: 'Menú B' } });
      let menu = await api('POST', `/admin/menus/${b.body.id}/categories`, {
        actor: 'admin',
        ifMatch: b.headers.get('etag')!,
        body: { name: 'Bebidas' },
      });
      menu = await api(
        'PUT',
        `/admin/menus/${b.body.id}/categories/${menu.body.categories[0].categoryId}/items`,
        {
          actor: 'admin',
          ifMatch: menu.headers.get('etag')!,
          body: { productIds: [a.productId] },
        },
      );
      await api('POST', `/admin/menus/${b.body.id}/publish`, {
        actor: 'admin',
        ifMatch: menu.headers.get('etag')!,
      });
      const pans = (await publicProducts()).filter((p) => p.productId === a.productId);
      expect(pans).toHaveLength(1);
    });

    it('un menú fuera de horario se muestra no disponible e indica cuándo abre', async () => {
      const { menuId, etag } = await seedMenu(
        'Solo lunes',
        productBody({ name: 'Desayuno lunes' }),
      );
      // Franja que nunca coincide ahora: elegimos el día anterior al actual (hora local de la cafetería)
      const today = localTime(new Date(), 'America/Guayaquil').dayOfWeek;
      const otherDay = (today % 7) + 1;
      const updated = await api('PUT', `/admin/menus/${menuId}`, {
        actor: 'admin',
        ifMatch: etag,
        body: {
          name: 'Solo lunes',
          schedule: [{ dayOfWeek: otherDay, startsAt: '07:00', endsAt: '11:00' }],
        },
      });
      await api('POST', `/admin/menus/${menuId}/publish`, {
        actor: 'admin',
        ifMatch: updated.headers.get('etag')!,
      });
      const menus = (await api('GET', '/menus')).body.menus as any[];
      const menu = menus.find((m) => m.name === 'Solo lunes');
      expect(menu.availability.availableNow).toBe(false);
      expect(menu.availability.nextAvailableAt).toEqual(expect.any(String));
      expect(menu.categories[0].products[0].purchasable).toBe(false);
    });
  });

  describe('retirada y auditoría', () => {
    it('retirar un menú lo quita de la tienda pero conserva sus versiones', async () => {
      const { menuId, etag } = await seedMenu('Menú a retirar', productBody({ name: 'Efímero' }));
      await api('POST', `/admin/menus/${menuId}/publish`, { actor: 'admin', ifMatch: etag });
      expect((await publicProducts()).map((p) => p.name)).toContain('Efímero');
      const current = await api('GET', `/admin/menus/${menuId}`, { actor: 'admin' });
      const retired = await api('POST', `/admin/menus/${menuId}/retire`, {
        actor: 'admin',
        ifMatch: current.headers.get('etag')!,
      });
      expect(retired.status).toBe(204);
      expect((await publicProducts()).map((p) => p.name)).not.toContain('Efímero');
      const versions = await api('GET', `/admin/menus/${menuId}/versions`, { actor: 'admin' });
      expect(versions.body.versions).toHaveLength(1);
    });

    it('los cambios de precio y de disponibilidad quedan en el registro de auditoría con actor y valores (FR-012)', async () => {
      const { productId } = await seedMenu('Menú auditoría', productBody({ name: 'Auditado' }));
      const rows = (await api('GET', '/admin/products', { actor: 'admin' })).body.products;
      const rev = rows.find((p: any) => p.productId === productId).revision;
      await api('PUT', `/admin/products/${productId}`, {
        actor: 'admin-2',
        ifMatch: `W/"${rev}"`,
        body: productBody({ name: 'Auditado', priceMinor: 400 }),
      });
      await api('PATCH', `/admin/products/${productId}/availability`, {
        actor: 'staff',
        body: { availability: 'sold_out' },
      });
      const db = new Client({ connectionString: process.env.DATABASE_URL });
      await db.connect();
      try {
        const { rows: log } = await db.query(
          "SELECT action, actor_id, changes FROM catalog.audit_log WHERE entity = 'product' AND entity_id = $1 ORDER BY id",
          [productId],
        );
        expect(log.map((r) => [r.action, r.actor_id])).toEqual([
          ['product_created', 'admin-1'],
          ['product_updated', 'admin-2'],
          ['availability_changed', 'staff-1'],
        ]);
        expect(log[1].changes).toEqual({ priceMinor: { from: 250, to: 400 } });
        expect(JSON.stringify(log)).not.toMatch(/@|password|email/i);
      } finally {
        await db.end();
      }
    });
  });

  describe('US4 – disponibilidad del día', () => {
    it('el personal marca agotado y se refleja de inmediato; no puede cambiar precios; existencias en 0 ⇒ agotado', async () => {
      const { menuId, productId, etag } = await seedMenu(
        'Menú US4',
        productBody({ name: 'Croissant' }),
      );
      await api('POST', `/admin/menus/${menuId}/publish`, { actor: 'admin', ifMatch: etag });
      expect((await publicProducts()).find((p) => p.name === 'Croissant').purchasable).toBe(true);

      const soldOut = await api('PATCH', `/admin/products/${productId}/availability`, {
        actor: 'staff',
        body: { availability: 'sold_out' },
      });
      expect(soldOut.status).toBe(200);
      const view = (await publicProducts()).find((p) => p.name === 'Croissant');
      expect(view).toMatchObject({ availability: 'sold_out', purchasable: false });

      // Personal NO puede tocar precio, ni por PATCH ni por PUT
      const priceViaPatch = await api('PATCH', `/admin/products/${productId}/availability`, {
        actor: 'staff',
        body: { priceMinor: 1 },
      });
      expect(priceViaPatch.status).toBe(422);
      const priceViaPut = await api('PUT', `/admin/products/${productId}`, {
        actor: 'staff',
        ifMatch: 'W/"1"',
        body: productBody({ priceMinor: 1 }),
      });
      expect(priceViaPut.status).toBe(403);
      expect(
        (await publicProducts()).find((p) => p.name === 'Croissant').unitPrice.amountMinor,
      ).toBe(250);

      // Existencias en cero ⇒ agotado automáticamente; no se puede marcar disponible sin existencias
      await api('PATCH', `/admin/products/${productId}/availability`, {
        actor: 'staff',
        body: { availability: 'available', stockQuantity: 3 },
      });
      expect((await publicProducts()).find((p) => p.name === 'Croissant').purchasable).toBe(true);
      await api('PATCH', `/admin/products/${productId}/availability`, {
        actor: 'staff',
        body: { stockQuantity: 0 },
      });
      expect((await publicProducts()).find((p) => p.name === 'Croissant').availability).toBe(
        'sold_out',
      );
      const bad = await api('PATCH', `/admin/products/${productId}/availability`, {
        actor: 'staff',
        body: { availability: 'available' },
      });
      expect(bad.status).toBe(422);
    });

    it('un cliente (sin rol de personal) no puede cambiar disponibilidad', async () => {
      const res = await api(
        'PATCH',
        '/admin/products/3f2504e0-4f89-41d3-9a0c-0305e82c3301/availability',
        {
          body: { availability: 'sold_out' },
        },
      );
      expect(res.status).toBe(401);
    });
  });
});
