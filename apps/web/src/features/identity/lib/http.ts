export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export interface ApiResult<T = unknown> {
  readonly ok: boolean;
  readonly status: number;
  readonly data: T;
}

export async function callApi<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`/api/${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: 'same-origin',
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, data: (text ? JSON.parse(text) : {}) as T };
  } catch {
    return {
      ok: false,
      status: 0,
      data: {
        code: 'network',
        message: 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.',
      } as T,
    };
  }
}

interface ErrorBody {
  code?: string;
  message?: string;
  errors?: FieldError[];
  retryAfterSeconds?: number;
}

/** Turns an API error body into per-field messages plus a general message. */
export function describeError(result: ApiResult): {
  fieldErrors: Record<string, string>;
  message: string;
} {
  const body = (result.data ?? {}) as ErrorBody;
  const fieldErrors: Record<string, string> = {};
  for (const error of body.errors ?? []) fieldErrors[error.field] ??= error.message;
  const message =
    body.errors && body.errors.length > 0
      ? 'Revisa los campos marcados y corrígelos.'
      : (body.message ?? 'Algo salió mal. Inténtalo de nuevo.');
  return { fieldErrors, message };
}

/** The first field with an error, following the order the fields appear in the form. */
export function firstInvalidField(
  fieldOrder: readonly string[],
  fieldErrors: Record<string, string>,
): string | null {
  return fieldOrder.find((name) => fieldErrors[name] !== undefined) ?? null;
}
