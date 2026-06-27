import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import type { PrincipalContext } from '@edrion/auth';

/** Per-request context carried on the Express request and into audit events. */
export interface EdrionRequestContext {
  requestId: string;
  correlationId: string;
  ip?: string;
  userAgent?: string;
  apiEndpoint: string;
}

declare module 'express' {
  interface Request {
    context: EdrionRequestContext;
    principalContext?: PrincipalContext;
  }
}

/**
 * Assigns request/correlation ids and captures IP + UA early, so every downstream log and
 * audit event can be correlated. Correlation id is honoured from an inbound header to trace
 * cross-portal (support-mode) activity.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = (req.header('x-correlation-id') ?? nanoid()).slice(0, 64);
    const requestId = nanoid();
    req.context = {
      requestId,
      correlationId,
      ip: req.ip ?? req.socket.remoteAddress ?? undefined,
      userAgent: req.header('user-agent') ?? undefined,
      apiEndpoint: `${req.method} ${req.baseUrl}${req.path}`,
    };
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-correlation-id', correlationId);
    next();
  }
}
