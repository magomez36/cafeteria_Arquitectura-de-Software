import type { PublicAllergen, ScheduleSlot } from '../../types';
import type { DraftProduct } from '../client';
import { DAY_LABELS } from '../forms';

export const RESTORE_WARNING =
  'Restaurar publica ese contenido ahora, pero NO cambia el borrador ni los productos. ' +
  'Si después publica el borrador, volverán a publicarse sus valores actuales y se reemplazará lo restaurado.';

export function MenuHidden({ menuId, etag }: Readonly<{ menuId: string; etag: string }>) {
  return (
    <>
      <input type="hidden" name="menu" value={menuId} />
      <input type="hidden" name="etag" value={etag} />
    </>
  );
}

export function TextField({
  name,
  label,
  defaultValue = '',
  required = false,
  hint,
  type = 'text',
  idPrefix = '',
}: Readonly<{
  name: string;
  label: string;
  defaultValue?: string | number | undefined;
  required?: boolean;
  hint?: string;
  type?: string;
  idPrefix?: string;
}>) {
  const id = `${idPrefix}${name}`;
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <p className="cat-field">
      <label htmlFor={id}>
        {label}
        {required ? ' (obligatorio)' : ''}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        aria-describedby={hintId}
        autoComplete="off"
      />
      {hint ? (
        <span id={hintId} className="cat-muted">
          {hint}
        </span>
      ) : null}
    </p>
  );
}

export function ScheduleFields({
  slots,
  rows = 5,
}: Readonly<{ slots: readonly ScheduleSlot[]; rows?: number }>) {
  const total = Math.max(rows, slots.length + 1);
  return (
    <fieldset className="cat-fieldset">
      <legend>Horario de atención (hora local)</legend>
      <p className="cat-muted">
        Cada franja va de la hora de inicio (incluida) a la de fin (excluida). Deje en blanco las
        filas que no use.
      </p>
      {Array.from({ length: total }, (_, i) => {
        const slot = slots[i];
        return (
          <div key={i} className="cat-slot" role="group" aria-label={`Franja ${i + 1}`}>
            <label htmlFor={`dia-${i}`}>Día</label>
            <select
              id={`dia-${i}`}
              name={`dia-${i}`}
              defaultValue={slot ? String(slot.dayOfWeek) : ''}
            >
              <option value="">—</option>
              {DAY_LABELS.map((label, d) => (
                <option key={label} value={d + 1}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor={`desde-${i}`}>Desde</label>
            <input
              id={`desde-${i}`}
              name={`desde-${i}`}
              type="time"
              defaultValue={slot?.startsAt ?? ''}
            />
            <label htmlFor={`hasta-${i}`}>Hasta</label>
            <input
              id={`hasta-${i}`}
              name={`hasta-${i}`}
              type="time"
              defaultValue={slot?.endsAt ?? ''}
            />
          </div>
        );
      })}
    </fieldset>
  );
}

export function ProductFields({
  product,
  allergens,
}: Readonly<{ product?: DraftProduct; allergens: readonly PublicAllergen[] }>) {
  const selected = new Set(product?.allergens ?? []);
  const key = product?.productId ?? 'nuevo';
  return (
    <>
      <TextField
        idPrefix={key}
        name="nombre"
        label="Nombre"
        defaultValue={product?.name}
        required
      />
      <TextField
        idPrefix={key}
        name="descripcion"
        label="Descripción"
        defaultValue={product?.description}
      />
      <TextField
        idPrefix={key}
        name="precio"
        label="Precio en dólares"
        defaultValue={product ? (product.priceMinor / 100).toFixed(2) : ''}
        required
        hint="Por ejemplo 2.50"
      />
      <TextField
        idPrefix={key}
        name="imagen"
        label="Dirección (URL) de la imagen"
        defaultValue={product?.imageUrl ?? ''}
      />
      <TextField
        idPrefix={key}
        name="imagen_alt"
        label="Texto alternativo de la imagen"
        defaultValue={product?.imageAlt ?? ''}
        hint="Obligatorio para publicar si el producto tiene imagen: describa lo que se ve."
      />
      <fieldset className="cat-fieldset">
        <legend>Alérgenos que contiene</legend>
        <ul className="cat-filter__list">
          {allergens.map((a) => (
            <li key={`${key}-${a.code}`}>
              <input
                type="checkbox"
                id={`${key}-al-${a.code}`}
                name="alergenos"
                value={a.code}
                defaultChecked={selected.has(a.code)}
              />
              <label htmlFor={`${key}-al-${a.code}`}>{a.label}</label>
            </li>
          ))}
        </ul>
        <p>
          <input
            type="checkbox"
            id={`${key}-declared`}
            name="alergenos_declarados"
            defaultChecked={product?.allergensDeclared ?? false}
          />{' '}
          <label htmlFor={`${key}-declared`}>
            Confirmo que esta lista de alérgenos está revisada (aunque no marque ninguno)
          </label>
        </p>
      </fieldset>
    </>
  );
}
