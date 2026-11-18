import type { ScheduleSlot } from '../types';
import type { AvailabilityPatch, ProductInput } from './client';

/** Lectura de formularios HTML → cuerpos de la API. Sin dependencias de Next.js (testeable). */
export interface FormLike {
  get(name: string): unknown;
  getAll(name: string): unknown[];
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const text = (form: FormLike, name: string): string => {
  const v = form.get(name);
  return typeof v === 'string' ? v.trim() : '';
};

/** "2.50" o "2,5" → 250 centavos. Solo enteros y hasta 2 decimales; nunca usa coma flotante. */
export function parsePriceToMinor(raw: string): number | null {
  const m = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(raw.trim());
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  return cents <= 10_000_000 ? cents : null;
}

export function parseProductForm(form: FormLike): Parsed<ProductInput> {
  const name = text(form, 'nombre');
  if (!name) return { ok: false, message: 'Escriba el nombre del producto.' };
  const priceMinor = parsePriceToMinor(text(form, 'precio'));
  if (priceMinor === null) {
    return { ok: false, message: 'El precio debe ser un monto como 2.50 (hasta 2 decimales).' };
  }
  const imageUrl = text(form, 'imagen') || null;
  const imageAlt = text(form, 'imagen_alt') || null;
  if (imageUrl && !imageAlt) {
    return { ok: false, message: 'Si hay imagen, describa la imagen en el texto alternativo.' };
  }
  return {
    ok: true,
    value: {
      name,
      description: text(form, 'descripcion'),
      priceMinor,
      imageUrl,
      imageAlt,
      allergens: form.getAll('alergenos').filter((v): v is string => typeof v === 'string'),
      allergensDeclared: form.get('alergenos_declarados') === 'on',
    },
  };
}

export function parseScheduleForm(form: FormLike, rows = 10): Parsed<ScheduleSlot[]> {
  const slots: ScheduleSlot[] = [];
  for (let i = 0; i < rows; i++) {
    const day = text(form, `dia-${i}`);
    const from = text(form, `desde-${i}`);
    const to = text(form, `hasta-${i}`);
    if (!day && !from && !to) continue;
    const dayOfWeek = Number(day);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7 || !from || !to) {
      return { ok: false, message: `Complete día, hora de inicio y de fin en la franja ${i + 1}.` };
    }
    slots.push({ dayOfWeek, startsAt: from, endsAt: to });
  }
  return { ok: true, value: slots };
}

export function parseAvailabilityForm(form: FormLike): Parsed<AvailabilityPatch> {
  const patch: AvailabilityPatch = {};
  const availability = text(form, 'disponibilidad');
  if (availability === 'available' || availability === 'sold_out')
    patch.availability = availability;
  const stock = text(form, 'existencias');
  if (stock !== '') {
    if (!/^\d{1,6}$/.test(stock)) {
      return { ok: false, message: 'Las existencias deben ser un número entero, 0 o mayor.' };
    }
    patch.stockQuantity = Number(stock);
  } else if (form.get('sin_control') === 'on') {
    patch.stockQuantity = null;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, message: 'Indique la disponibilidad o las existencias.' };
  }
  return { ok: true, value: patch };
}

export const DAY_LABELS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;
