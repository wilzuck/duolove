import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/** Erreur métier avec code stable (utilisable côté web pour la traduction). */
export class AppError extends HttpException {
  constructor(status: number, public readonly code: string, message?: string, public readonly details?: unknown) {
    super({ code, message: message ?? code, details }, status);
  }
}
export const badRequest = (code: string, message?: string, details?: unknown) => new AppError(400, code, message, details);
export const unauthorized = (code = 'UNAUTHORIZED', message?: string) => new AppError(401, code, message);
export const forbidden = (code = 'FORBIDDEN', message?: string) => new AppError(403, code, message);
export const notFound = (code = 'NOT_FOUND', message?: string) => new AppError(404, code, message);
export const conflict = (code: string, message?: string) => new AppError(409, code, message);

/** Format d'erreur unique : { error: { code, message, details? } }. Aucune trace ni donnée sensible. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as string | { code?: string; message?: string | string[]; details?: unknown };
      const code = typeof body === 'object' && body.code ? body.code : defaultCode(status);
      const message = typeof body === 'object' ? (Array.isArray(body.message) ? body.message.join(', ') : body.message) : body;
      res.status(status).json({ error: { code, message: message ?? code, details: typeof body === 'object' ? body.details : undefined } });
      return;
    }
    this.logger.error(exception instanceof Error ? exception.message : 'unknown error');
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur interne' } });
  }
}

function defaultCode(status: number) {
  return (
    { 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 429: 'RATE_LIMITED' } as Record<number, string>
  )[status] ?? 'ERROR';
}
