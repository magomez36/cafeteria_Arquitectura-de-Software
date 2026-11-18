import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createAdminCatalogClient } from './client';
import { EmptyState, LoadFailure, StateNotice } from './components/feedback';
import { ProductFields } from './components/fields';
import { describeChange } from './components/version-history';
import {
  parseAvailabilityForm,
  parsePriceToMinor,
  parseProductForm,
  parseScheduleForm,
} from './forms';
import { formError, toState } from './outcome';

const form = (entries: Record<string, string | string[]>) => ({
  get: (n: string) => (Array.isArray(entries[n]) ? entries[n][0] : entries[n]),
  getAll: (n: string) =>
    Array.isArray(entries[n]) ? entries[n] : n in entries ? [entries[n]] : [],
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers });

describe('cliente de administración', () => {
  it('reenvía solo las credenciales de la persona y la precondición If-Match', async () => {
    const fetchImpl = vi.fn(async () => json(200, { id: 'm1' }, { etag: 'W/"4"' }));
    const client = createAdminCatalogClient({
      baseUrl: 'http://api',
      authHeaders: () => ({ cookie: 'sid=abc' }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const res = await client.updateMenu('m1', 'W/"3"', { name: 'X', schedule: [] });
    expect(res).toMatchObject({ ok: true, etag: 'W/"4"' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api/api/v1/catalog/admin/menus/m1');
    expect(init.method).toBe('PUT');
    expect(init.headers).toMatchObject({ cookie: 'sid=abc', 'if-match': 'W/"3"' });
    // Nunca se inventan cabeceras de rol ni credenciales
    expect(JSON.stringify(init.headers).toLowerCase()).not.toContain('x-role');
  });

  it('sin credenciales no añade ninguna (la API responderá 401)', async () => {
    const fetchImpl = vi.fn(async () =>
      json(401, { error: { code: 'unauthenticated', message: 'x' } }),
    );
    const client = createAdminCatalogClient({
      baseUrl: 'http://api',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const res = await client.listMenus();
    expect(res).toMatchObject({ ok: false, kind: 'unauthenticated', status: 401 });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).not.toHaveProperty('cookie');
    expect(init.headers).not.toHaveProperty('authorization');
  });

  it.each([
    [403, 'forbidden'],
    [404, 'not-found'],
    [409, 'conflict'],
    [428, 'precondition'],
    [422, 'validation'],
    [500, 'unavailable'],
  ])('traduce HTTP %i a "%s"', async (status, kind) => {
    const client = createAdminCatalogClient({
      baseUrl: 'http://api',
      fetchImpl: (async () => json(status, { error: { code: 'x', message: 'm' } })) as typeof fetch,
    });
    expect(await client.getMenu('m')).toMatchObject({ ok: false, kind });
  });

  it('publicación bloqueada conserva el detalle de cada problema', async () => {
    const client = createAdminCatalogClient({
      baseUrl: 'http://api',
      fetchImpl: (async () =>
        json(422, {
          error: {
            code: 'publish_blocked',
            message: 'bloqueado',
            details: [{ path: 'product:1', message: '«Té» necesita texto alternativo.' }],
          },
        })) as typeof fetch,
    });
    const res = await client.publish('m', 'W/"1"');
    expect(res).toMatchObject({ ok: false, kind: 'blocked' });
    expect(res.ok ? [] : res.details).toEqual([
      { path: 'product:1', message: '«Té» necesita texto alternativo.' },
    ]);
  });

  it('si la red falla devuelve "unavailable" sin lanzar', async () => {
    const client = createAdminCatalogClient({
      baseUrl: 'http://api',
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as typeof fetch,
    });
    expect(await client.listProducts()).toMatchObject({ ok: false, kind: 'unavailable' });
  });
});

describe('lectura de formularios', () => {
  it('convierte precios a centavos sin coma flotante', () => {
    expect(parsePriceToMinor('2.50')).toBe(250);
    expect(parsePriceToMinor('2,5')).toBe(250);
    expect(parsePriceToMinor('10')).toBe(1000);
    expect(parsePriceToMinor('0.07')).toBe(7);
    expect(parsePriceToMinor('-1')).toBeNull();
    expect(parsePriceToMinor('2.555')).toBeNull();
    expect(parsePriceToMinor('abc')).toBeNull();
    expect(parsePriceToMinor('99999.99')).toBe(9_999_999);
    expect(parsePriceToMinor('100000')).toBeNull();
  });

  it('el producto exige nombre, precio válido y alt si hay imagen', () => {
    const base = { nombre: 'Té', precio: '1.25' };
    expect(
      parseProductForm(form({ ...base, alergenos: ['leche'], alergenos_declarados: 'on' })),
    ).toMatchObject({
      ok: true,
      value: { priceMinor: 125, allergens: ['leche'], allergensDeclared: true, imageUrl: null },
    });
    expect(parseProductForm(form({ nombre: '', precio: '1' }))).toMatchObject({ ok: false });
    expect(parseProductForm(form({ nombre: 'x', precio: 'gratis' }))).toMatchObject({ ok: false });
    expect(parseProductForm(form({ ...base, imagen: 'https://x/y.jpg' }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/texto alternativo/),
    });
  });

  it('el horario ignora filas vacías y rechaza franjas incompletas', () => {
    expect(
      parseScheduleForm(form({ 'dia-0': '1', 'desde-0': '07:00', 'hasta-0': '11:00' })),
    ).toEqual({ ok: true, value: [{ dayOfWeek: 1, startsAt: '07:00', endsAt: '11:00' }] });
    expect(parseScheduleForm(form({ 'dia-1': '2', 'desde-1': '07:00' }))).toMatchObject({
      ok: false,
    });
    expect(parseScheduleForm(form({}))).toEqual({ ok: true, value: [] });
  });

  it('disponibilidad: solo disponibilidad/existencias; nunca precio', () => {
    expect(parseAvailabilityForm(form({ disponibilidad: 'sold_out', existencias: '0' }))).toEqual({
      ok: true,
      value: { availability: 'sold_out', stockQuantity: 0 },
    });
    expect(parseAvailabilityForm(form({ existencias: '-3' }))).toMatchObject({ ok: false });
    expect(parseAvailabilityForm(form({}))).toMatchObject({ ok: false });
    const parsed = parseAvailabilityForm(form({ disponibilidad: 'available', precio: '0.01' }));
    expect(parsed.ok && 'priceMinor' in parsed.value).toBe(false);
  });
});

describe('estados de la interfaz', () => {
  it('conflicto 409: título claro, sin culpar y sin perder datos', () => {
    const state = toState(
      { ok: false, kind: 'conflict', status: 409, message: 'x', details: [] },
      '',
    );
    const html = renderToStaticMarkup(createElement(StateNotice, { state }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Otra persona cambió esto antes que usted');
    expect(html).toContain('no se sobrescribió nada');
  });

  it('acceso denegado y sin sesión se distinguen', () => {
    const denied = renderToStaticMarkup(
      createElement(LoadFailure, {
        failure: { ok: false, kind: 'forbidden', status: 403, message: '', details: [] },
      }),
    );
    const anon = renderToStaticMarkup(
      createElement(LoadFailure, {
        failure: { ok: false, kind: 'unauthenticated', status: 401, message: '', details: [] },
      }),
    );
    expect(denied).toContain('No tiene permiso');
    expect(anon).toContain('Necesita iniciar sesión');
  });

  it('publicación bloqueada lista cada problema', () => {
    const state = toState(
      {
        ok: false,
        kind: 'blocked',
        status: 422,
        message: '',
        details: [{ message: '«Té» necesita texto alternativo de la imagen.' }],
      },
      '',
    );
    const html = renderToStaticMarkup(createElement(StateNotice, { state }));
    expect(html).toContain('no se puede publicar todavía');
    expect(html).toContain('<li>«Té» necesita texto alternativo de la imagen.</li>');
  });

  it('éxito usa role=status; vacío y error de formulario también son texto', () => {
    expect(
      renderToStaticMarkup(
        createElement(StateNotice, { state: { status: 'success', message: 'Listo' } }),
      ),
    ).toContain('role="status"');
    expect(
      renderToStaticMarkup(createElement(StateNotice, { state: formError('Falta el nombre') })),
    ).toContain('Falta el nombre');
    expect(renderToStaticMarkup(createElement(EmptyState, null, 'Nada aún'))).toContain(
      'role="status"',
    );
    expect(renderToStaticMarkup(createElement(StateNotice, { state: { status: 'idle' } }))).toBe(
      '',
    );
  });

  it('los campos de producto tienen etiquetas e ids únicos entre formularios', () => {
    const allergens = [{ code: 'leche', label: 'Leche y lácteos' }];
    const mk = (id: string) =>
      renderToStaticMarkup(
        createElement(ProductFields, {
          allergens,
          product: {
            productId: id,
            name: 'Té',
            description: '',
            priceMinor: 250,
            imageUrl: null,
            imageAlt: null,
            allergens: ['leche'],
            allergensDeclared: true,
          },
        }),
      );
    const ids = [...mk('a').matchAll(/ id="([^"]+)"/g), ...mk('b').matchAll(/ id="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(mk('a')).toContain('value="2.50"');
    expect(mk('a')).toContain('<legend>Alérgenos que contiene</legend>');
  });

  it('describe los cambios de versión en español legible', () => {
    expect(
      describeChange({
        type: 'product_changed',
        productId: 'p',
        name: 'Mocha',
        field: 'priceMinor',
        from: 250,
        to: 300,
      }),
    ).toBe('En «Mocha» cambió el precio: de $2.50 a $3.00.');
    expect(describeChange({ type: 'schedule_changed' })).toBe('Cambió el horario.');
  });
});
