import { createServer, type Server } from 'node:http';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * E2E del menú público contra una API stub determinista (la API real es deny-by-default hasta
 * integrar Identity y no se puede sembrar un menú publicado sin administrador).
 * Requiere que la web se haya iniciado con API_URL apuntando al stub:
 *   API_URL=http://127.0.0.1:4010 pnpm --filter @cafeteria/web exec next dev -p 3100
 *   CATALOG_E2E_STUB=1 WEB_BASE_URL=http://127.0.0.1:3100 pnpm --filter @cafeteria/web test:e2e catalog-menu
 */
const STUB_PORT = 4010;
const enabled = process.env.CATALOG_E2E_STUB === '1';

const allergens = [
  { code: 'leche', label: 'Leche y lácteos' },
  { code: 'gluten', label: 'Cereales con gluten' },
  { code: 'huevo', label: 'Huevo' },
];

const product = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  productId: id,
  name,
  description: `${name}, preparado al momento`,
  unitPrice: { amountMinor: 250, currency: 'USD' },
  imageUrl: null,
  imageAlt: `Foto de ${name}`,
  allergens: [],
  availability: 'available',
  purchasable: true,
  ...over,
});

const menus = [
  {
    id: 'm1',
    name: 'Desayunos',
    versionNumber: 3,
    availability: { availableNow: true, nextAvailableAt: null, schedule: [] },
    notice: null,
    categories: [
      {
        id: 'c1',
        name: 'Bebidas',
        products: [
          product('p1', 'Capuchino', { allergens: [allergens[0]] }),
          product('p2', 'Té verde'),
          product('p3', 'Chocolate caliente', {
            availability: 'sold_out',
            purchasable: false,
            allergens: [allergens[0]],
          }),
        ],
      },
      {
        id: 'c2',
        name: 'Panadería',
        products: [product('p4', 'Pan integral', { allergens: [allergens[1]] })],
      },
    ],
  },
  {
    id: 'm2',
    name: 'Cenas',
    versionNumber: 1,
    availability: {
      availableNow: false,
      nextAvailableAt: '2026-11-23T23:00:00.000Z',
      schedule: [],
    },
    notice: null,
    categories: [
      {
        id: 'c3',
        name: 'Platos',
        products: [product('p5', 'Sopa del día', { purchasable: false })],
      },
    ],
  },
];

let server: Server;

test.describe('menú público', () => {
  // Un único worker: el stub de la API escucha en un puerto fijo.
  test.describe.configure({ mode: 'serial' });

  test.skip(
    !enabled,
    'Requiere CATALOG_E2E_STUB=1 y la web apuntando a la API stub (ver cabecera).',
  );

  test.beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://stub');
      if (url.pathname !== '/api/v1/catalog/menus') {
        res.writeHead(404).end();
        return;
      }
      const exclude = (url.searchParams.get('excludeAllergens') ?? '').split(',').filter(Boolean);
      const filtered = menus.map((m) => ({
        ...m,
        categories: m.categories
          .map((c) => ({
            ...c,
            products: c.products.filter((p) => !p.allergens.some((a) => exclude.includes(a.code))),
          }))
          .filter((c) => c.products.length > 0),
      }));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          timezone: 'America/Guayaquil',
          allergens,
          menus: filtered,
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(STUB_PORT, '127.0.0.1', resolve));
  });

  test.afterAll(async () => {
    await new Promise((resolve) => server?.close(resolve));
  });

  test('no tiene violaciones de axe (WCAG 2.2 A/AA/AAA, contraste 7:1)', async ({ page }) => {
    await page.goto('/menu');
    await expect(page.getByRole('heading', { level: 1, name: 'Menú' })).toBeVisible();
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
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    // No es un pase vacío: axe evaluó realmente el contraste reforzado 7:1 (AAA).
    expect(results.passes.map((r) => r.id)).toContain('color-contrast-enhanced');
  });

  test('muestra agotado y fuera de horario con texto, y cada imagen tiene alt', async ({
    page,
  }) => {
    await page.goto('/menu');
    await expect(page.getByText('Agotado')).toBeVisible();
    await expect(page.getByText(/Fuera de horario/).first()).toBeVisible();
    await expect(page.getByText(/Estará disponible desde el/)).toBeVisible();
    const missingAlt = await page.locator('img:not([alt]), img[alt=""]').count();
    expect(missingAlt).toBe(0);
  });

  test('el filtro de alérgenos se opera solo con teclado y excluye los productos con leche', async ({
    page,
  }) => {
    await page.goto('/menu');
    await expect(page.getByRole('heading', { name: 'Capuchino' })).toBeVisible();
    const checkbox = page.getByRole('checkbox', { name: 'Leche y lácteos' });
    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
    await page.getByRole('button', { name: 'Aplicar filtro' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/excluir=leche/);
    await expect(page.getByRole('heading', { name: 'Capuchino' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Té verde' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Leche y lácteos' })).toBeChecked();
    await expect(page.getByRole('link', { name: 'Quitar filtro' })).toBeVisible();
  });

  test('el foco es visible en los controles del filtro', async ({ page }) => {
    await page.goto('/menu');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? getComputedStyle(el).outlineStyle : 'none';
    });
    expect(outline).not.toBe('none');
  });
});
