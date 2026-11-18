import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { CatalogError } from '../domain/errors';

interface ReplyLike {
  status(code: number): ReplyLike;
  json(body: unknown): unknown;
}

/** Respuestas de error con el formato documentado; nunca expone trazas ni detalles internos. */
@Catch()
export class CatalogErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Catalog');

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<ReplyLike>();
    if (exception instanceof CatalogError) {
      reply.status(exception.status).json(exception.toBody());
      return;
    }
    if (exception instanceof HttpException) {
      reply
        .status(exception.getStatus())
        .json({ error: { code: 'validation_failed', message: 'Petición no válida.' } });
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    reply
      .status(500)
      .json({ error: { code: 'internal_error', message: 'Ocurrió un error inesperado.' } });
  }
}
