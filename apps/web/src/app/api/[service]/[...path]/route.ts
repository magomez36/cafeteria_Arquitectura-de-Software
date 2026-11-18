import { NextRequest } from 'next/server';

// Same-origin proxy so the browser never calls the API cross-origin and the session cookie stays HttpOnly.
const ALLOWED = new Set(['identity', 'customers']);
const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

async function forward(
  request: NextRequest,
  context: { params: Promise<{ service: string; path: string[] }> },
): Promise<Response> {
  const { service, path } = await context.params;
  if (!ALLOWED.has(service)) return Response.json({ code: 'not_found' }, { status: 404 });
  const target = `${API_URL}/api/v1/${service}/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) headers.set('x-forwarded-for', forwardedFor);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  if (hasBody) headers.set('content-type', 'application/json');
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      ...(hasBody ? { body: await request.text() } : {}),
      cache: 'no-store',
      redirect: 'manual',
    });
    const response = new Response(upstream.status === 204 ? null : await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
    for (const value of upstream.headers.getSetCookie())
      response.headers.append('set-cookie', value);
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) response.headers.set('retry-after', retryAfter);
    return response;
  } catch {
    return Response.json(
      {
        code: 'service_unavailable',
        message: 'El servicio no está disponible ahora. Inténtalo de nuevo en unos minutos.',
      },
      { status: 503 },
    );
  }
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT };
