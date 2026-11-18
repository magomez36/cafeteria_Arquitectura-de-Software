import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { fetchPublicMenus } from './api';
import { AllergenFilter } from './components/allergen-filter';
import { MenuView } from './components/menu-view';
import { ProductCard } from './components/product-card';
import { formatPrice, parseExcluded } from './format';
import type { PublicMenu, PublicProduct } from './types';

const product = (over: Partial<PublicProduct> = {}): PublicProduct => ({
  productId: 'p1',
  name: 'Capuchino',
  description: 'Espresso con leche',
  unitPrice: { amountMinor: 250, currency: 'USD' },
  imageUrl: 'https://cdn.example/c.jpg',
  imageAlt: 'Capuchino con arte latte',
  allergens: [{ code: 'leche', label: 'Leche y lácteos' }],
  availability: 'available',
  purchasable: true,
  ...over,
});

const menu = (over: Partial<PublicMenu> = {}): PublicMenu => ({
  id: 'm1',
  name: 'Desayunos',
  versionNumber: 1,
  availability: { availableNow: true, nextAvailableAt: null, schedule: [] },
  notice: null,
  categories: [{ id: 'c1', name: 'Bebidas', products: [product()] }],
  ...over,
});

const html = (el: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(el);

describe('ProductCard', () => {
  it('muestra nombre, precio, imagen con texto alternativo y alérgenos con texto', () => {
    const out = html(createElement(ProductCard, { product: product(), menuAvailableNow: true }));
    expect(out).toContain('Capuchino');
    expect(out).toContain('alt="Capuchino con arte latte"');
    expect(out).toMatch(/2[.,]50/);
    expect(out).toContain('Leche y lácteos');
    expect(out).toContain('Disponible');
  });

  it('un producto agotado lo dice con texto, no solo con color, y no ofrece compra', () => {
    const out = html(
      createElement(ProductCard, {
        product: product({ availability: 'sold_out', purchasable: false }),
        menuAvailableNow: true,
      }),
    );
    expect(out).toContain('Agotado');
    expect(out).not.toMatch(/<button/i);
  });

  it('fuera de horario se indica en texto', () => {
    const out = html(createElement(ProductCard, { product: product(), menuAvailableNow: false }));
    expect(out).toContain('Fuera de horario');
  });

  it('sin alérgenos declarados lo dice explícitamente', () => {
    const out = html(
      createElement(ProductCard, { product: product({ allergens: [] }), menuAvailableNow: true }),
    );
    expect(out).toContain('Sin alérgenos declarados');
  });
});

describe('MenuView', () => {
  it('menú fuera de horario indica cuándo estará disponible', () => {
    const out = html(
      createElement(MenuView, {
        menu: menu({
          availability: {
            availableNow: false,
            nextAvailableAt: '2026-11-23T12:00:00.000Z',
            schedule: [],
          },
        }),
        timeZone: 'America/Guayaquil',
      }),
    );
    expect(out).toContain('no está disponible en este momento');
    expect(out).toMatch(/lunes/);
    expect(out).toMatch(/07:00/);
  });

  it('un menú sin productos disponibles muestra el aviso en un status, no una página vacía', () => {
    const out = html(
      createElement(MenuView, {
        menu: menu({ notice: 'No hay productos disponibles en este momento.', categories: [] }),
        timeZone: 'America/Guayaquil',
      }),
    );
    expect(out).toContain('role="status"');
    expect(out).toContain('No hay productos disponibles');
  });

  it('con varias categorías ofrece navegación por enlaces con nombre accesible', () => {
    const out = html(
      createElement(MenuView, {
        menu: menu({
          categories: [
            { id: 'c1', name: 'Bebidas', products: [product()] },
            { id: 'c2', name: 'Postres', products: [product({ productId: 'p2' })] },
          ],
        }),
        timeZone: 'America/Guayaquil',
      }),
    );
    expect(out).toContain('aria-label="Categorías de Desayunos"');
    expect(out).toContain('href="#cat-m1-c2"');
  });
});

describe('AllergenFilter', () => {
  const allergens = [
    { code: 'leche', label: 'Leche y lácteos' },
    { code: 'gluten', label: 'Cereales con gluten' },
  ];

  it('usa fieldset/legend, etiquetas asociadas y conserva la selección', () => {
    const out = html(createElement(AllergenFilter, { allergens, excluded: ['leche'] }));
    expect(out).toContain('<fieldset>');
    expect(out).toContain('<legend>');
    expect(out).toContain('for="excluir-leche"');
    expect(out).toMatch(/id="excluir-leche"[^>]*checked/);
    expect(out).not.toMatch(/id="excluir-gluten"[^>]*checked/);
    expect(out).toContain('Quitar filtro');
  });

  it('sin selección no ofrece «Quitar filtro»', () => {
    expect(html(createElement(AllergenFilter, { allergens, excluded: [] }))).not.toContain(
      'Quitar filtro',
    );
  });
});

describe('format', () => {
  it('formatea centavos como dólares', () => {
    expect(formatPrice(1250)).toMatch(/12[.,]50/);
  });
  it('parseExcluded descarta valores sospechosos y duplicados', () => {
    expect(parseExcluded(['leche', 'leche', "x'; DROP", 'frutos_secos'])).toEqual([
      'leche',
      'frutos_secos',
    ]);
    expect(parseExcluded(undefined)).toEqual([]);
    expect(parseExcluded('gluten')).toEqual(['gluten']);
  });
});

describe('fetchPublicMenus', () => {
  const respond = (status: number, body: unknown = {}) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it('pide el filtro de alérgenos a la API pública y revalida cada 3 s', async () => {
    const fetchImpl = respond(200, { menus: [] });
    const result = await fetchPublicMenus(['leche', 'gluten'], fetchImpl, 'http://api.test');
    expect(result.status).toBe('ok');
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('http://api.test/api/v1/catalog/menus?excludeAllergens=leche,gluten');
    expect((init as { next?: { revalidate: number } }).next?.revalidate).toBe(3);
  });

  it('distingue filtro inválido (422) de error del servidor y de red', async () => {
    expect((await fetchPublicMenus([], respond(422), 'http://api.test')).status).toBe(
      'invalid-filter',
    );
    expect((await fetchPublicMenus([], respond(500), 'http://api.test')).status).toBe('error');
    const failing = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect((await fetchPublicMenus([], failing, 'http://api.test')).status).toBe('error');
  });
});
