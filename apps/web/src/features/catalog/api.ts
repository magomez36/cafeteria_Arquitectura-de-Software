import type { PublicMenusResponse } from './types';

export type MenuResult =
  { status: 'ok'; data: PublicMenusResponse } | { status: 'invalid-filter' } | { status: 'error' };

const DEFAULT_API_URL = 'http://localhost:4000';

/** Lectura pública del menú (solo versiones publicadas). Revalida cada 3 s para cumplir «<10 s». */
export async function fetchPublicMenus(
  excluded: readonly string[],
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = process.env.API_URL ?? DEFAULT_API_URL,
): Promise<MenuResult> {
  const query = excluded.length > 0 ? `?excludeAllergens=${excluded.join(',')}` : '';
  try {
    const response = await fetchImpl(`${baseUrl}/api/v1/catalog/menus${query}`, {
      headers: { accept: 'application/json' },
      next: { revalidate: 3 },
    } as RequestInit);
    if (response.status === 422) return { status: 'invalid-filter' };
    if (!response.ok) return { status: 'error' };
    return { status: 'ok', data: (await response.json()) as PublicMenusResponse };
  } catch {
    return { status: 'error' };
  }
}
