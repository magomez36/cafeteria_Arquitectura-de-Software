export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export class CustomerValidationError extends Error {
  constructor(readonly errors: readonly FieldError[]) {
    super('Validation failed');
  }
}

export class CustomerUnauthenticatedError extends Error {}
export class CustomerForbiddenError extends Error {}
export class ReauthenticationRequiredError extends Error {}
