import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import {
  EmailNotConfirmedError,
  ForbiddenError,
  InvalidCredentialsError,
  InvalidTokenError,
  TooManyAttemptsError,
  UnauthenticatedError,
  ValidationError,
} from '../domain/errors';

interface ResponseLike {
  status(code: number): ResponseLike;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

/** Maps domain errors to stable, non-enumerating HTTP responses. */
@Catch()
export class IdentityExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<ResponseLike>();
    if (error instanceof ValidationError) {
      res.status(422).json({ code: 'validation_failed', errors: error.errors });
    } else if (error instanceof InvalidCredentialsError) {
      res.status(401).json({
        code: 'invalid_credentials',
        message: 'El correo o la contraseña no son correctos.',
      });
    } else if (error instanceof EmailNotConfirmedError) {
      res.status(403).json({
        code: 'email_not_confirmed',
        message: 'Debes confirmar tu correo antes de iniciar sesión. Puedes pedir un nuevo enlace.',
      });
    } else if (error instanceof TooManyAttemptsError) {
      res.setHeader('Retry-After', String(error.retryAfterSeconds));
      res.status(429).json({
        code: 'too_many_attempts',
        message: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
        retryAfterSeconds: error.retryAfterSeconds,
      });
    } else if (error instanceof InvalidTokenError) {
      res.status(400).json({
        code: `token_${error.reason}`,
        message:
          error.reason === 'invalid'
            ? 'El enlace no es válido. Pide uno nuevo.'
            : error.reason === 'expired'
              ? 'El enlace caducó. Pide uno nuevo.'
              : 'El enlace ya se usó. Pide uno nuevo si lo necesitas.',
      });
    } else if (error instanceof UnauthenticatedError) {
      res.status(401).json({ code: 'unauthenticated', message: 'Inicia sesión para continuar.' });
    } else if (error instanceof ForbiddenError) {
      res.status(403).json({ code: 'forbidden', message: 'No tienes permiso para esta acción.' });
    } else if (error instanceof HttpException) {
      res.status(error.getStatus()).json(error.getResponse());
    } else {
      res.status(503).json({
        code: 'service_unavailable',
        message: 'El servicio no está disponible ahora. Inténtalo de nuevo en unos minutos.',
      });
    }
  }
}
