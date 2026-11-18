import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import {
  CustomerForbiddenError,
  CustomerUnauthenticatedError,
  CustomerValidationError,
  ReauthenticationRequiredError,
} from '../domain/errors';

interface ResponseLike {
  status(code: number): ResponseLike;
  json(body: unknown): void;
}

@Catch()
export class CustomersExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<ResponseLike>();
    if (error instanceof CustomerValidationError) {
      res.status(422).json({ code: 'validation_failed', errors: error.errors });
    } else if (error instanceof CustomerUnauthenticatedError) {
      res.status(401).json({ code: 'unauthenticated', message: 'Inicia sesión para continuar.' });
    } else if (error instanceof CustomerForbiddenError) {
      res.status(403).json({ code: 'forbidden', message: 'No tienes permiso para esta acción.' });
    } else if (error instanceof ReauthenticationRequiredError) {
      res.status(403).json({
        code: 'reauth_required',
        message: 'Confirma tu contraseña para continuar con esta acción.',
      });
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
