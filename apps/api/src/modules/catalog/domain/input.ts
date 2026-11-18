import { isAllergenCode } from './allergens';
import { CatalogError } from './errors';
import { isValidPriceMinor } from './money';
import { validateSchedule, type ScheduleSlot } from './schedule';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_URL = /^(https:\/\/[^\s]+|\/(?!\/)[^\s]*)$/;

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

const fail = (message: string, details?: unknown[]): never => {
  throw new CatalogError('validation_failed', message, details);
};

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return fail('El cuerpo de la petición debe ser un objeto JSON.');
  }
  return body as Record<string, unknown>;
}

function rejectUnknown(body: Record<string, unknown>, allowed: readonly string[]): void {
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length > 0) fail(`Campos no permitidos: ${extra.join(', ')}.`);
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') return fail(`«${field}» es obligatorio.`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    return fail(`«${field}» debe tener entre ${min} y ${max} caracteres.`);
  }
  return trimmed;
}

export function parseUuid(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !UUID.test(value))
    return fail(`«${field}» no es un identificador válido.`);
  return value.toLowerCase();
}

export function parseVersionNumber(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) return fail('Número de versión inválido.');
  return n;
}

export function parseName(body: unknown): string {
  const obj = asObject(body);
  return text(obj.name, 'nombre', 1, 120);
}

export function parseCategoryName(body: unknown): string {
  return text(asObject(body).name, 'nombre', 1, 80);
}

export function parseMenuUpdate(body: unknown): { name: string; schedule: ScheduleSlot[] } {
  const obj = asObject(body);
  rejectUnknown(obj, ['name', 'schedule']);
  const name = text(obj.name, 'nombre', 1, 120);
  const raw = obj.schedule ?? [];
  if (!Array.isArray(raw) || raw.length > 50)
    return fail('«schedule» debe ser una lista de hasta 50 franjas.');
  const schedule = raw.map((s) => {
    const slot = asObject(s);
    return {
      dayOfWeek: slot.dayOfWeek as number,
      startsAt: slot.startsAt as string,
      endsAt: slot.endsAt as string,
    };
  });
  const errors = validateSchedule(schedule);
  if (errors.length > 0) fail('El horario no es válido.', errors);
  return { name, schedule };
}

export function parseItems(body: unknown): string[] {
  const obj = asObject(body);
  rejectUnknown(obj, ['productIds']);
  if (!Array.isArray(obj.productIds) || obj.productIds.length > 200) {
    return fail('«productIds» debe ser una lista de hasta 200 productos.');
  }
  const ids = obj.productIds.map((id) => parseUuid(id, 'productId'));
  if (new Set(ids).size !== ids.length) fail('Hay productos repetidos en la categoría.');
  return ids;
}

export function parseProductInput(body: unknown): ProductInput {
  const obj = asObject(body);
  rejectUnknown(obj, [
    'name',
    'description',
    'priceMinor',
    'imageUrl',
    'imageAlt',
    'allergens',
    'allergensDeclared',
  ]);
  if (!isValidPriceMinor(obj.priceMinor)) {
    fail('«priceMinor» debe ser un entero de centavos entre 0 y 10000000.');
  }
  const imageUrl = obj.imageUrl == null || obj.imageUrl === '' ? null : String(obj.imageUrl);
  if (imageUrl !== null && (imageUrl.length > 500 || !IMAGE_URL.test(imageUrl))) {
    fail('«imageUrl» debe ser una URL https:// o una ruta relativa.');
  }
  const imageAlt = obj.imageAlt == null ? null : text(obj.imageAlt, 'texto alternativo', 0, 300);
  const allergens = obj.allergens ?? [];
  if (
    !Array.isArray(allergens) ||
    !allergens.every((a) => typeof a === 'string' && isAllergenCode(a))
  ) {
    return fail('«allergens» contiene códigos desconocidos.');
  }
  const unique = [...new Set(allergens as string[])];
  const declared = obj.allergensDeclared ?? false;
  if (typeof declared !== 'boolean') return fail('«allergensDeclared» debe ser verdadero o falso.');
  if (unique.length > 0 && !declared) {
    fail('Si indica alérgenos, «allergensDeclared» debe ser verdadero.');
  }
  return {
    name: text(obj.name, 'nombre', 1, 120),
    description: text(obj.description, 'descripción', 0, 500),
    priceMinor: obj.priceMinor as number,
    imageUrl,
    imageAlt: imageAlt === '' ? null : imageAlt,
    allergens: unique,
    allergensDeclared: declared,
  };
}

/** El personal solo puede enviar disponibilidad y existencias: cualquier otro campo (p. ej. precio) se rechaza. */
export function parseAvailabilityPatch(body: unknown): AvailabilityPatch {
  const obj = asObject(body);
  rejectUnknown(obj, ['availability', 'stockQuantity']);
  const patch: AvailabilityPatch = {};
  if ('availability' in obj) {
    if (obj.availability !== 'available' && obj.availability !== 'sold_out') {
      fail('«availability» debe ser «available» o «sold_out».');
    }
    patch.availability = obj.availability as 'available' | 'sold_out';
  }
  if ('stockQuantity' in obj) {
    const s = obj.stockQuantity;
    if (
      s !== null &&
      (typeof s !== 'number' || !Number.isSafeInteger(s) || s < 0 || s > 1_000_000)
    ) {
      fail('«stockQuantity» debe ser null o un entero entre 0 y 1000000.');
    }
    patch.stockQuantity = s as number | null;
  }
  if (Object.keys(patch).length === 0) fail('Indique «availability» o «stockQuantity».');
  return patch;
}
