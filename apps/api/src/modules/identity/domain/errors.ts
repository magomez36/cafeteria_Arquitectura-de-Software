export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export class ValidationError extends Error {
  constructor(readonly errors: readonly FieldError[]) {
    super('Validation failed');
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid credentials');
  }
}

export class EmailNotConfirmedError extends Error {
  constructor() {
    super('Email not confirmed');
  }
}

export class TooManyAttemptsError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many attempts');
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super('Forbidden');
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('Unauthenticated');
  }
}

export class InvalidTokenError extends Error {
  constructor(readonly reason: 'invalid' | 'expired' | 'used') {
    super(`Token ${reason}`);
  }
}
