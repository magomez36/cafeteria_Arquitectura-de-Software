import { CatalogError } from './errors';

export type Permission = 'catalog.menu.write' | 'catalog.availability.write' | 'catalog.audit.read';

/** Subconjunto de `IdentityReference` (@cafeteria/contracts): identificador y roles, sin credenciales. */
export interface Actor {
  id: string;
  roles: readonly string[];
}

export type RequestHeaders = Readonly<Record<string, string | string[] | undefined>>;

/**
 * Port hacia la autoridad de identidad (Spec #2). El catálogo NO decide quién es el usuario:
 * solo pide a la autoridad que autentique la petición y luego aplica sus propios permisos.
 */
export interface CatalogAuthorizer {
  authenticate(headers: RequestHeaders): Promise<Actor | null>;
}

export const CATALOG_AUTHORIZER = Symbol('CATALOG_AUTHORIZER');

/** Implementación por defecto: sin autoridad validada no se autoriza a nadie. */
export class DenyAllAuthorizer implements CatalogAuthorizer {
  authenticate(): Promise<Actor | null> {
    return Promise.resolve(null);
  }
}

// Nombres de rol: supuesto a confirmar con Spec #2 (ver research D7).
const ROLE_PERMISSIONS: Readonly<Record<string, readonly Permission[]>> = {
  admin: ['catalog.menu.write', 'catalog.availability.write', 'catalog.audit.read'],
  staff: ['catalog.availability.write'],
};

export function hasPermission(actor: Actor, permission: Permission): boolean {
  return actor.roles.some(
    (role) => Object.hasOwn(ROLE_PERMISSIONS, role) && ROLE_PERMISSIONS[role]?.includes(permission),
  );
}

export async function authorize(
  authorizer: CatalogAuthorizer,
  headers: RequestHeaders,
  permission: Permission,
): Promise<Actor> {
  const actor = await authorizer.authenticate(headers);
  if (!actor) throw new CatalogError('unauthenticated', 'Se requiere iniciar sesión.');
  if (!hasPermission(actor, permission)) {
    throw new CatalogError('forbidden', 'No tiene permiso para realizar esta acción.');
  }
  return actor;
}
