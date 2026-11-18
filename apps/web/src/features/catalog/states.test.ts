import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AdminLoading from '../../app/admin/catalogo/loading';
import MenuLoading from '../../app/menu/loading';

describe('estados de carga (T024)', () => {
  it('el menú público anuncia la carga con role=status', () => {
    const html = renderToStaticMarkup(createElement(MenuLoading));
    expect(html).toContain('role="status"');
    expect(html).toMatch(/Cargando/);
  });
  it('la administración anuncia la carga con role=status', () => {
    const html = renderToStaticMarkup(createElement(AdminLoading));
    expect(html).toContain('role="status"');
    expect(html).toMatch(/Cargando/);
  });
});
