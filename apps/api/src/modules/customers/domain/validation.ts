import type { FieldError } from './errors';

const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;
const MAX_PREFERENCES_BYTES = 2048;

export function validateProfileChanges(input: {
  fullName?: unknown;
  phone?: unknown;
  preferences?: unknown;
}): FieldError[] {
  const errors: FieldError[] = [];
  if (input.fullName !== undefined) {
    const name = typeof input.fullName === 'string' ? input.fullName.trim() : '';
    if (name.length === 0 || name.length > 100) {
      errors.push({ field: 'fullName', message: 'Escribe tu nombre, de 1 a 100 caracteres.' });
    }
  }
  if (input.phone !== undefined && input.phone !== null && input.phone !== '') {
    if (typeof input.phone !== 'string' || !PHONE_PATTERN.test(input.phone.trim())) {
      errors.push({
        field: 'phone',
        message: 'Escribe un teléfono válido, por ejemplo +593 99 123 4567.',
      });
    }
  }
  if (input.preferences !== undefined) {
    const valid =
      typeof input.preferences === 'object' &&
      input.preferences !== null &&
      !Array.isArray(input.preferences) &&
      JSON.stringify(input.preferences).length <= MAX_PREFERENCES_BYTES;
    if (!valid)
      errors.push({
        field: 'preferences',
        message: 'Las preferencias no tienen un formato válido.',
      });
  }
  return errors;
}
