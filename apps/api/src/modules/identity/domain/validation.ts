import type { FieldError } from './errors';
import { checkPassword } from './password-policy';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateRegistration(input: {
  fullName: string;
  email: string;
  password: string;
  acceptedPolicy: boolean;
}): FieldError[] {
  const errors: FieldError[] = [];
  const name = input.fullName.trim();
  if (name.length === 0 || name.length > 100) {
    errors.push({ field: 'fullName', message: 'Escribe tu nombre, de 1 a 100 caracteres.' });
  }
  errors.push(...validateEmail(input.email), ...validateNewPassword(input.password));
  if (!input.acceptedPolicy) {
    errors.push({
      field: 'acceptedPolicy',
      message: 'Debes aceptar la política de privacidad para registrarte.',
    });
  }
  return errors;
}

export function validateEmail(email: string): FieldError[] {
  const value = email.trim();
  return value.length <= 254 && EMAIL_PATTERN.test(value)
    ? []
    : [{ field: 'email', message: 'Escribe un correo válido, por ejemplo nombre@dominio.com.' }];
}

export function validateNewPassword(password: string, field = 'password'): FieldError[] {
  const problems = checkPassword(password);
  const errors: FieldError[] = [];
  if (problems.includes('too_short')) {
    errors.push({ field, message: 'La contraseña debe tener al menos 12 caracteres.' });
  }
  if (problems.includes('known_breached')) {
    errors.push({
      field,
      message: 'Esa contraseña es muy común o apareció en filtraciones. Elige otra.',
    });
  }
  return errors;
}
