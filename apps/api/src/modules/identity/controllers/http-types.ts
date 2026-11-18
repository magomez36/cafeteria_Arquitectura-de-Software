export interface HttpRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly ip?: string;
  readonly socket?: { readonly remoteAddress?: string };
}

export interface HttpResponse {
  cookie(
    name: string,
    value: string,
    options: { httpOnly: boolean; sameSite: 'lax'; secure: boolean; path: string; maxAge: number },
  ): void;
  clearCookie(name: string, options: { path: string }): void;
}

export const SESSION_COOKIE = 'cafeteria_session';

export function clientIp(req: HttpRequest): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

export function readCookie(req: HttpRequest, name: string): string | null {
  const header = req.headers.cookie;
  const raw = Array.isArray(header) ? header.join(';') : (header ?? '');
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
