export type CatalogErrorCode =
  | 'validation_failed'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'precondition_required'
  | 'publish_blocked';

const STATUS: Record<CatalogErrorCode, number> = {
  validation_failed: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  precondition_required: 428,
  publish_blocked: 422,
};

export class CatalogError extends Error {
  readonly status: number;

  constructor(
    readonly code: CatalogErrorCode,
    message: string,
    readonly details?: readonly unknown[],
  ) {
    super(message);
    this.name = 'CatalogError';
    this.status = STATUS[code];
  }

  toBody(): { error: { code: CatalogErrorCode; message: string; details?: readonly unknown[] } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}
