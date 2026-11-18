import type { PublicMenu, ScheduleSlot } from '../types';

/** Cliente de la API de administración del catálogo, desacoplado de Next.js y de la sesión. */

export interface DraftProduct {
  productId: string;
  name: string;
  description: string;
  priceMinor: number;
  imageUrl: string | null;
  imageAlt: string | null;
  allergens: string[];
  allergensDeclared: boolean;
}
export interface ProductRow extends DraftProduct {
  availability: 'available' | 'sold_out';
  stockQuantity: number | null;
  revision: number;
}
export interface DraftCategory {
  categoryId: string;
  name: string;
  products: DraftProduct[];
}
export interface DraftMenu {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'retired';
  revision: number;
  currentVersionNumber: number | null;
  schedule: ScheduleSlot[];
  categories: DraftCategory[];
}
export interface MenuSummary {
  id: string;
  name: string;
  status: string;
  revision: number;
}
export interface VersionChange {
  type: string;
  field?: string;
  from?: unknown;
  to?: unknown;
  [key: string]: unknown;
}
export interface VersionSummary {
  versionNumber: number;
  publishedBy: string;
  publishedAt: string;
  restoredFromVersion: number | null;
  changes: VersionChange[];
}
export interface ProductInput {
  name: string;
  description: string;
  priceMinor: number;
  imageUrl: string | null;
  imageAlt: string | null;
  allergens: string[];
  allergensDeclared: boolean;
}
export interface AvailabilityPatch {
  availability?: 'available' | 'sold_out';
  stockQuantity?: number | null;
}

export type FailureKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'conflict'
  | 'precondition'
  | 'blocked'
  | 'validation'
  | 'not-found'
  | 'unavailable';

export interface Failure {
  ok: false;
  kind: FailureKind;
  status: number;
  message: string;
  details: { path?: string; message?: string }[];
}
export type Result<T> = { ok: true; data: T; etag: string | null } | Failure;

export interface AdminCatalogClient {
  listMenus(): Promise<Result<{ menus: MenuSummary[] }>>;
  createMenu(name: string): Promise<Result<{ id: string }>>;
  getMenu(id: string): Promise<Result<DraftMenu>>;
  updateMenu(
    id: string,
    etag: string,
    body: { name: string; schedule: ScheduleSlot[] },
  ): Promise<Result<DraftMenu>>;
  addCategory(id: string, etag: string, name: string): Promise<Result<DraftMenu>>;
  removeCategory(id: string, etag: string, categoryId: string): Promise<Result<DraftMenu>>;
  setItems(
    id: string,
    etag: string,
    categoryId: string,
    productIds: string[],
  ): Promise<Result<unknown>>;
  preview(id: string): Promise<Result<PublicMenu>>;
  publish(id: string, etag: string): Promise<Result<{ versionNumber: number }>>;
  retire(id: string, etag: string): Promise<Result<null>>;
  listVersions(id: string): Promise<Result<{ versions: VersionSummary[] }>>;
  restore(
    id: string,
    etag: string,
    version: number,
  ): Promise<Result<{ versionNumber: number; warning?: string }>>;
  listProducts(): Promise<Result<{ products: ProductRow[] }>>;
  createProduct(input: ProductInput): Promise<Result<ProductRow>>;
  updateProduct(id: string, etag: string, input: ProductInput): Promise<Result<ProductRow>>;
  setAvailability(id: string, patch: AvailabilityPatch): Promise<Result<ProductRow>>;
}

export interface ClientOptions {
  baseUrl: string;
  /** Credenciales de la persona que usa la UI (cookie/Authorization reenviadas); nunca fijas. */
  authHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  fetchImpl?: typeof fetch;
}

const KIND_BY_STATUS: Record<number, FailureKind> = {
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not-found',
  409: 'conflict',
  428: 'precondition',
  422: 'validation',
};

export function createAdminCatalogClient(options: ClientOptions): AdminCatalogClient {
  const doFetch = options.fetchImpl ?? fetch;
  const root = `${options.baseUrl}/api/v1/catalog/admin`;

  async function request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; etag?: string } = {},
  ): Promise<Result<T>> {
    let response: Response;
    try {
      response = await doFetch(`${root}${path}`, {
        method,
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(opts.etag ? { 'if-match': opts.etag } : {}),
          ...(await options.authHeaders?.()),
        },
        body: opts.body === undefined ? null : JSON.stringify(opts.body),
      });
    } catch {
      return failure('unavailable', 0, 'No se pudo contactar al servicio.');
    }
    const text = await response.text().catch(() => '');
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (response.ok) return { ok: true, data: json as T, etag: response.headers.get('etag') };
    const error = (json as { error?: { code?: string; message?: string; details?: unknown[] } })
      ?.error;
    const kind =
      error?.code === 'publish_blocked'
        ? 'blocked'
        : (KIND_BY_STATUS[response.status] ?? 'unavailable');
    return {
      ok: false,
      kind,
      status: response.status,
      message: error?.message ?? 'La operación no se pudo completar.',
      details: Array.isArray(error?.details) ? (error.details as Failure['details']) : [],
    };
  }

  const enc = encodeURIComponent;
  return {
    listMenus: () => request('GET', '/menus'),
    createMenu: (name) => request('POST', '/menus', { body: { name } }),
    getMenu: (id) => request('GET', `/menus/${enc(id)}`),
    updateMenu: (id, etag, body) => request('PUT', `/menus/${enc(id)}`, { body, etag }),
    addCategory: (id, etag, name) =>
      request('POST', `/menus/${enc(id)}/categories`, { body: { name }, etag }),
    removeCategory: (id, etag, categoryId) =>
      request('DELETE', `/menus/${enc(id)}/categories/${enc(categoryId)}`, { etag }),
    setItems: (id, etag, categoryId, productIds) =>
      request('PUT', `/menus/${enc(id)}/categories/${enc(categoryId)}/items`, {
        body: { productIds },
        etag,
      }),
    preview: (id) => request('GET', `/menus/${enc(id)}/preview`),
    publish: (id, etag) => request('POST', `/menus/${enc(id)}/publish`, { etag }),
    retire: (id, etag) => request('POST', `/menus/${enc(id)}/retire`, { etag }),
    listVersions: (id) => request('GET', `/menus/${enc(id)}/versions`),
    restore: (id, etag, version) =>
      request('POST', `/menus/${enc(id)}/versions/${version}/restore`, { etag }),
    listProducts: () => request('GET', '/products'),
    createProduct: (input) => request('POST', '/products', { body: input }),
    updateProduct: (id, etag, input) =>
      request('PUT', `/products/${enc(id)}`, { body: input, etag }),
    setAvailability: (id, patch) =>
      request('PATCH', `/products/${enc(id)}/availability`, { body: patch }),
  };
}

function failure(kind: FailureKind, status: number, message: string): Failure {
  return { ok: false, kind, status, message, details: [] };
}

/** Mensajes para la persona usuaria, uno por tipo de fallo (no se muestran detalles internos). */
export const FAILURE_COPY: Record<FailureKind, { title: string; help: string }> = {
  unauthenticated: {
    title: 'Necesita iniciar sesión',
    help: 'Inicie sesión con una cuenta autorizada para administrar el catálogo.',
  },
  forbidden: {
    title: 'No tiene permiso para esta acción',
    help: 'Su rol no incluye esta operación. Pida acceso a quien administra la cafetería.',
  },
  conflict: {
    title: 'Otra persona cambió esto antes que usted',
    help: 'Cargamos la versión más reciente. Revise los cambios y repita el suyo; no se sobrescribió nada.',
  },
  precondition: {
    title: 'La página estaba desactualizada',
    help: 'Recargue la página e inténtelo de nuevo.',
  },
  blocked: {
    title: 'El menú no se puede publicar todavía',
    help: 'Corrija los puntos siguientes y vuelva a publicar.',
  },
  validation: { title: 'Revise los datos', help: 'Hay datos que no son válidos.' },
  'not-found': { title: 'No se encontró', help: 'El elemento ya no existe o fue retirado.' },
  unavailable: {
    title: 'El servicio no responde',
    help: 'Inténtelo de nuevo en unos segundos. No se perdió ningún dato.',
  },
};
