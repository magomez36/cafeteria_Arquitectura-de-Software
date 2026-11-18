import { headers } from 'next/headers';
import { createAdminCatalogClient, type AdminCatalogClient } from './client';

/**
 * Cliente de administración para el servidor de Next. Reenvía a la API SOLO las credenciales que la
 * persona ya trae en su petición (cookie / Authorization). No fabrica, no cachea y no sustituye
 * identidad: la API decide con su propia autoridad y responde 401 si no hay una válida.
 */
export async function adminClient(): Promise<AdminCatalogClient> {
  const incoming = await headers();
  const forwarded: Record<string, string> = {};
  const cookie = incoming.get('cookie');
  const authorization = incoming.get('authorization');
  if (cookie) forwarded.cookie = cookie;
  if (authorization) forwarded.authorization = authorization;
  return createAdminCatalogClient({
    baseUrl: process.env.API_URL ?? 'http://localhost:4000',
    authHeaders: () => forwarded,
  });
}
