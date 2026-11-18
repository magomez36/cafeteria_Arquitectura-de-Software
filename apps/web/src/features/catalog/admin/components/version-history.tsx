import { restoreAction } from '../actions';
import type { VersionChange, VersionSummary } from '../client';
import { ActionForm } from './action-form';
import { MenuHidden, RESTORE_WARNING } from './fields';

const FIELD_LABEL: Record<string, string> = {
  name: 'el nombre',
  description: 'la descripción',
  priceMinor: 'el precio',
  imageUrl: 'la imagen',
  imageAlt: 'el texto alternativo',
  allergens: 'los alérgenos',
};

const show = (field: string, value: unknown): string => {
  if (field === 'priceMinor' && typeof value === 'number') return `$${(value / 100).toFixed(2)}`;
  return Array.isArray(value) ? value.join(', ') || 'ninguno' : String(value ?? 'ninguno');
};

/** Texto legible de un cambio entre versiones (quién/cuándo/qué, FR-012). */
export function describeChange(change: VersionChange): string {
  const name = typeof change.name === 'string' ? `«${change.name}»` : '';
  switch (change.type) {
    case 'menu_renamed':
      return `Se renombró el menú de «${String(change.from)}» a «${String(change.to)}».`;
    case 'schedule_changed':
      return 'Cambió el horario.';
    case 'category_added':
      return `Se añadió la categoría ${name}.`;
    case 'category_removed':
      return `Se quitó la categoría ${name}.`;
    case 'category_renamed':
      return `Se renombró la categoría de «${String(change.from)}» a «${String(change.to)}».`;
    case 'product_added':
      return `Se añadió el producto ${name}.`;
    case 'product_removed':
      return `Se quitó el producto ${name}.`;
    case 'product_changed': {
      const field = String(change.field);
      return `En ${name} cambió ${FIELD_LABEL[field] ?? field}: de ${show(field, change.from)} a ${show(field, change.to)}.`;
    }
    default:
      return String(change.type);
  }
}

const dateFormat = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(
    new Date(iso),
  );

export function VersionHistory({
  menuId,
  etag,
  versions,
  timeZone = 'America/Guayaquil',
  canRestore,
}: Readonly<{
  menuId: string;
  etag: string;
  versions: readonly VersionSummary[];
  timeZone?: string;
  canRestore: boolean;
}>) {
  if (versions.length === 0) {
    return <p role="status">Este menú todavía no se ha publicado, así que no tiene versiones.</p>;
  }
  return (
    <>
      <p className="cat-notice" role="note">
        <strong>Antes de restaurar:</strong> {RESTORE_WARNING}
      </p>
      <ol className="cat-versions" reversed>
        {versions.map((v) => (
          <li key={v.versionNumber}>
            <h3>
              Versión {v.versionNumber}
              {v.restoredFromVersion ? ` (restaurada desde la ${v.restoredFromVersion})` : ''}
            </h3>
            <p>
              Publicada por {v.publishedBy} el {dateFormat(v.publishedAt, timeZone)}.
            </p>
            {v.changes.length > 0 ? (
              <ul>
                {v.changes.map((c, i) => (
                  <li key={i}>{describeChange(c)}</li>
                ))}
              </ul>
            ) : (
              <p className="cat-muted">Primera publicación.</p>
            )}
            {canRestore ? (
              <ActionForm
                action={restoreAction}
                submitLabel={`Restaurar la versión ${v.versionNumber}`}
                secondary
                confirmText={`${RESTORE_WARNING}\n\n¿Restaurar la versión ${v.versionNumber}?`}
              >
                <MenuHidden menuId={menuId} etag={etag} />
                <input type="hidden" name="version" value={v.versionNumber} />
              </ActionForm>
            ) : null}
          </li>
        ))}
      </ol>
    </>
  );
}
