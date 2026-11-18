import { CatalogError } from './errors';

export function formatEtag(revision: number): string {
  return `W/"${revision}"`;
}

/** Acepta `W/"3"` o `"3"`. Devuelve `null` si falta o es ilegible. */
export function parseIfMatch(header: string | string[] | undefined): number | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const match = /^(?:W\/)?"(\d{1,9})"$/.exec(value.trim());
  return match?.[1] ? Number(match[1]) : null;
}

/** Control optimista: 428 sin precondición, 409 si otra persona modificó el recurso. */
export function assertRevision(header: string | string[] | undefined, current: number): number {
  const expected = parseIfMatch(header);
  if (expected === null) {
    throw new CatalogError(
      'precondition_required',
      'Falta la versión que está editando (cabecera If-Match). Recargue e inténtelo de nuevo.',
    );
  }
  if (expected !== current) {
    throw new CatalogError(
      'conflict',
      'Otra persona modificó este elemento mientras lo editaba. Recargue para ver los cambios; los suyos no se han guardado.',
    );
  }
  return expected;
}
