import {
  authorize,
  DenyAllAuthorizer,
  hasPermission,
  type Actor,
  type CatalogAuthorizer,
} from './authorization';
import { CatalogError } from './errors';

const fixed = (actor: Actor | null): CatalogAuthorizer => ({
  authenticate: () => Promise.resolve(actor),
});

describe('authorization', () => {
  it('por defecto niega todo, incluso con cabeceras que pretenden dar un rol', async () => {
    await expect(
      authorize(new DenyAllAuthorizer(), { 'x-role': 'admin' }, 'catalog.menu.write'),
    ).rejects.toMatchObject({ code: 'unauthenticated', status: 401 });
  });

  it('el administrador tiene todos los permisos', () => {
    const admin: Actor = { id: 'a1', roles: ['admin'] };
    expect(hasPermission(admin, 'catalog.menu.write')).toBe(true);
    expect(hasPermission(admin, 'catalog.availability.write')).toBe(true);
    expect(hasPermission(admin, 'catalog.audit.read')).toBe(true);
  });

  it('el personal solo cambia disponibilidad (FR-009, US4.3)', async () => {
    const staff = fixed({ id: 's1', roles: ['staff'] });
    await expect(authorize(staff, {}, 'catalog.availability.write')).resolves.toMatchObject({
      id: 's1',
    });
    await expect(authorize(staff, {}, 'catalog.menu.write')).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    });
  });

  it('un rol desconocido o clientes no tienen permisos', async () => {
    const customer = fixed({ id: 'c1', roles: ['customer', 'constructor'] });
    await expect(authorize(customer, {}, 'catalog.audit.read')).rejects.toBeInstanceOf(
      CatalogError,
    );
  });
});
