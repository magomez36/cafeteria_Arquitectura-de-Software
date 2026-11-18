import { createServer, type IncomingMessage, type Server } from 'node:http';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * E2E de la UI de administración contra una API STUB determinista. No usa sesiones reales: la API
 * real es deny-by-default hasta integrar Identity (Spec #2). El stub solo sirve para ejercitar la UI
 * (estados de carga/vacío/error/409/403/401/bloqueo) y comprobar qué cabeceras envía el servidor web.
 *
 *   API_URL=http://127.0.0.1:4011 pnpm --filter @cafeteria/web exec next dev -p 3101
 *   CATALOG_E2E_ADMIN_STUB=1 WEB_BASE_URL=http://127.0.0.1:3101 pnpm --filter @cafeteria/web test:e2e catalog-admin
 */
const STUB_PORT = 4011;
const enabled = process.env.CATALOG_E2E_ADMIN_STUB === '1';
const MENU_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';

interface Seen {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: string;
}

const state = {
  access: 'ok' as 'ok' | 'anon' | 'forbidden' | 'down' | 'empty',
  write: 'ok' as 'ok' | 'conflict' | 'blocked',
  seen: [] as Seen[],
};

const draftMenu = () => ({
  id: MENU_ID,
  name: 'Desayunos',
  status: 'published',
  revision: 4,
  currentVersionNumber: 2,
  schedule: [{ dayOfWeek: 1, startsAt: '07:00', endsAt: '11:00' }],
  categories: [
    {
      categoryId: CATEGORY_ID,
      name: 'Bebidas',
      products: [
        {
          productId: PRODUCT_ID,
          name: 'Capuchino',
          description: 'Espresso con leche',
          priceMinor: 250,
          imageUrl: 'https://cdn.example/c.jpg',
          imageAlt: 'Capuchino',
          allergens: ['leche'],
          allergensDeclared: true,
        },
      ],
    },
  ],
});
const product = {
  ...draftMenu().categories[0]!.products[0]!,
  availability: 'available',
  stockQuantity: 5,
  revision: 7,
};
const versions = [
  {
    versionNumber: 2,
    publishedBy: 'admin-2',
    publishedAt: '2026-11-17T15:00:00.000Z',
    restoredFromVersion: null,
    changes: [
      {
        type: 'product_changed',
        productId: PRODUCT_ID,
        name: 'Capuchino',
        field: 'priceMinor',
        from: 250,
        to: 300,
      },
    ],
  },
  {
    versionNumber: 1,
    publishedBy: 'admin-1',
    publishedAt: '2026-11-16T15:00:00.000Z',
    restoredFromVersion: null,
    changes: [],
  },
];

let server: Server;

function handle(
  req: IncomingMessage,
  body: string,
): { status: number; json?: unknown; etag?: string } {
  const url = new URL(req.url ?? '/', 'http://stub');
  const path = url.pathname.replace('/api/v1/catalog', '');
  const method = req.method ?? 'GET';
  state.seen.push({ method, path, headers: req.headers, body });
  if (path === '/menus' && method === 'GET') {
    return {
      status: 200,
      json: {
        generatedAt: new Date().toISOString(),
        timezone: 'America/Guayaquil',
        allergens: [{ code: 'leche', label: 'Leche y lácteos' }],
        menus: [],
      },
    };
  }
  if (state.access === 'anon')
    return { status: 401, json: { error: { code: 'unauthenticated', message: 'x' } } };
  if (state.access === 'forbidden')
    return { status: 403, json: { error: { code: 'forbidden', message: 'x' } } };
  if (state.access === 'down') return { status: 500, json: { error: { code: 'x', message: 'x' } } };
  const admin = path.replace('/admin', '');
  if (admin === '/menus' && method === 'GET') {
    return {
      status: 200,
      json: {
        menus:
          state.access === 'empty'
            ? []
            : [{ id: MENU_ID, name: 'Desayunos', status: 'published', revision: 4 }],
      },
    };
  }
  if (admin === `/menus/${MENU_ID}` && method === 'GET')
    return { status: 200, json: draftMenu(), etag: 'W/"4"' };
  if (admin === '/products' && method === 'GET') {
    return { status: 200, json: { products: state.access === 'empty' ? [] : [product] } };
  }
  if (admin === `/menus/${MENU_ID}/versions`) return { status: 200, json: { versions } };
  if (admin === `/menus/${MENU_ID}/preview`) {
    return {
      status: 200,
      json: {
        id: MENU_ID,
        name: 'Desayunos',
        versionNumber: 0,
        availability: { availableNow: true, nextAvailableAt: null, schedule: [] },
        notice: null,
        categories: [{ id: CATEGORY_ID, name: 'Bebidas', products: [] }],
      },
    };
  }
  if (method !== 'GET') {
    if (state.write === 'conflict')
      return { status: 409, json: { error: { code: 'conflict', message: 'x' } } };
    if (admin.endsWith('/publish')) {
      if (state.write === 'blocked') {
        return {
          status: 422,
          json: {
            error: {
              code: 'publish_blocked',
              message: 'x',
              details: [
                {
                  path: 'product:1',
                  message: '«Capuchino» necesita texto alternativo de la imagen.',
                },
              ],
            },
          },
        };
      }
      return { status: 201, json: { versionNumber: 3 } };
    }
    if (admin.endsWith('/restore'))
      return { status: 201, json: { versionNumber: 3, warning: 'aviso' } };
    if (admin.endsWith('/availability'))
      return { status: 200, json: { ...product, availability: 'sold_out' } };
    return { status: 200, json: draftMenu(), etag: 'W/"5"' };
  }
  return { status: 404, json: { error: { code: 'not_found', message: 'x' } } };
}

test.describe('administración del catálogo (API stub)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(
    !enabled,
    'Requiere CATALOG_E2E_ADMIN_STUB=1 y la web apuntando a la API stub (ver cabecera).',
  );

  test.beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += String(chunk)));
      req.on('end', () => {
        const out = handle(req, body);
        res.writeHead(out.status, {
          'content-type': 'application/json',
          ...(out.etag ? { etag: out.etag } : {}),
        });
        res.end(out.json === undefined ? '' : JSON.stringify(out.json));
      });
    });
    await new Promise<void>((resolve) => server.listen(STUB_PORT, '127.0.0.1', resolve));
  });
  test.afterAll(async () => {
    await new Promise((resolve) => server?.close(resolve));
  });
  test.beforeEach(() => {
    state.access = 'ok';
    state.write = 'ok';
    state.seen = [];
  });

  test('las pantallas de administración no tienen violaciones de axe (A/AA/AAA)', async ({
    page,
  }) => {
    for (const path of [
      '/admin/catalogo',
      `/admin/catalogo/${MENU_ID}`,
      '/admin/catalogo/productos',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags([
          'wcag2a',
          'wcag2aa',
          'wcag21a',
          'wcag21aa',
          'wcag22aa',
          'wcag2aaa',
          'best-practice',
        ])
        .analyze();
      expect(results.violations.map((v) => `${path} ${v.id}: ${v.nodes.length}`)).toEqual([]);
      expect(results.passes.map((r) => r.id)).toContain('color-contrast-enhanced');
    }
  });

  test('sin sesión (401) y sin permiso (403) se muestran como estados distintos, sin datos', async ({
    page,
  }) => {
    state.access = 'anon';
    await page.goto('/admin/catalogo');
    await expect(page.getByRole('alert').filter({ hasText: /[A-Za-z]/ })).toContainText(
      'Necesita iniciar sesión',
    );
    state.access = 'forbidden';
    await page.goto('/admin/catalogo/productos');
    await expect(page.getByRole('alert').filter({ hasText: /[A-Za-z]/ })).toContainText(
      'No tiene permiso',
    );
    await expect(page.getByText('Capuchino')).toHaveCount(0);
  });

  test('estado vacío y error del servicio', async ({ page }) => {
    state.access = 'empty';
    await page.goto('/admin/catalogo');
    await expect(page.getByText('Todavía no hay menús')).toBeVisible();
    state.access = 'down';
    await page.goto('/admin/catalogo');
    await expect(page.getByRole('alert').filter({ hasText: /[A-Za-z]/ })).toContainText(
      'El servicio no responde',
    );
  });

  test('el servidor reenvía la cookie de la persona, envía If-Match y nunca una cabecera de rol', async ({
    page,
    context,
  }) => {
    await context.addCookies([{ name: 'sid', value: 'abc123', url: 'http://127.0.0.1:3101' }]);
    await page.goto(`/admin/catalogo/${MENU_ID}`);
    await page.getByRole('button', { name: 'Publicar menú' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Versión 3 publicada' })).toBeVisible();
    const publish = state.seen.find((r) => r.path.endsWith('/publish'));
    expect(publish?.headers['if-match']).toBe('W/"4"');
    expect(publish?.headers.cookie).toContain('sid=abc123');
    for (const r of state.seen.filter((s) => s.path.includes('/admin'))) {
      expect(Object.keys(r.headers)).not.toContain('x-role');
    }
  });

  test('conflicto 409 al guardar: mensaje claro y el formulario sigue usable', async ({ page }) => {
    await page.goto(`/admin/catalogo/${MENU_ID}`);
    state.write = 'conflict';
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    const alert = page
      .getByRole('alert')
      .filter({ hasText: 'Otra persona cambió esto antes que usted' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('no se sobrescribió nada');
    await expect(page.getByRole('button', { name: 'Guardar borrador' })).toBeEnabled();
  });

  test('publicación bloqueada lista qué falta corregir', async ({ page }) => {
    await page.goto(`/admin/catalogo/${MENU_ID}`);
    state.write = 'blocked';
    await page.getByRole('button', { name: 'Publicar menú' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'no se puede publicar todavía' });
    await expect(alert).toContainText('necesita texto alternativo de la imagen');
  });

  test('el historial muestra autor/fecha/cambio y la advertencia antes de restaurar', async ({
    page,
  }) => {
    await page.goto(`/admin/catalogo/${MENU_ID}`);
    await expect(page.getByText('Publicada por admin-2')).toBeVisible();
    await expect(
      page.getByText('En «Capuchino» cambió el precio: de $2.50 a $3.00.'),
    ).toBeVisible();
    await expect(page.getByRole('note')).toContainText('NO cambia el borrador');
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('reemplazará lo restaurado');
      void dialog.accept();
    });
    await page.getByRole('button', { name: 'Restaurar la versión 1' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Versión 1 restaurada como versión 3' }),
    ).toBeVisible();
  });

  test('el personal marca agotado con el teclado y se envía solo disponibilidad/existencias', async ({
    page,
  }) => {
    await page.goto('/admin/catalogo/productos');
    const select = page.getByLabel('Disponibilidad', { exact: true });
    await select.focus();
    await select.selectOption('sold_out');
    await page.getByRole('button', { name: 'Actualizar disponibilidad' }).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('status').filter({ hasText: 'Disponibilidad actualizada' }),
    ).toBeVisible();
    const patch = state.seen.find((r) => r.method === 'PATCH');
    const sent = JSON.parse(patch?.body ?? '{}') as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(['availability', 'stockQuantity']);
  });
});
