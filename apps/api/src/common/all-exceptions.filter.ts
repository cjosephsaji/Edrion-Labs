import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ErrorReporter, Logger } from '@edrion/observability';
import { ERROR_REPORTER, LOGGER } from './tokens';

/** Uniform error envelope. Never leaks stack traces or secrets to the client. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(ERROR_REPORTER) private readonly reporter: ErrorReporter,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong';
    let details: Record<string, string[]> | undefined;
    let meta: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        message = (b.message as string) ?? message;
        code = (b.code as string) ?? defaultCode(status);
        details = b.details as Record<string, string[]> | undefined;
        meta = b.meta as Record<string, unknown> | undefined;
      }
      if (code === 'INTERNAL_ERROR') code = defaultCode(status);
    } else if (isBodyParserError(exception)) {
      // express body-parser rejects (oversized / malformed) before Nest routing.
      status = exception.status;
      if (exception.type === 'entity.too.large') {
        code = 'PAYLOAD_TOO_LARGE';
        message = 'Request body exceeds the maximum allowed size';
      } else {
        code = defaultCode(status);
        message = 'Malformed request body';
      }
    }

    // Correlated, structured logging + error capture. Client errors (4xx) are warnings; server
    // errors (5xx) and anything not modelled as an HttpException are reported to the error sink.
    const log = this.logger.child({
      correlationId: req.context?.correlationId,
      requestId: req.context?.requestId,
      apiEndpoint: req.context?.apiEndpoint,
      actorId: req.principalContext?.principal.employeeId,
    });
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      log.error('request.error', { status, code, message });
      this.reporter.captureException(exception, {
        correlationId: req.context?.correlationId,
        requestId: req.context?.requestId,
        apiEndpoint: req.context?.apiEndpoint,
        status,
        code,
      });
    } else {
      log.warn('request.rejected', { status, code });
    }

    res.status(status).json({
      statusCode: status,
      code,
      message,
      ...(details ? { details } : {}),
      ...(meta ? { meta } : {}),
      correlationId: req.context?.correlationId,
    });
  }
}

/** express body-parser errors carry a numeric `status` and a `type` discriminator. */
function isBodyParserError(e: unknown): e is { status: number; type: string } {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { status?: unknown }).status === 'number' &&
    typeof (e as { type?: unknown }).type === 'string'
  );
}

function defaultCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    default:
      return 'INTERNAL_ERROR';
  }
}
