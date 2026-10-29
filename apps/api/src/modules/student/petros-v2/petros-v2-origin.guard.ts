import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { ApiEnv } from '@edrion/config';
import type { Request } from 'express';
import { API_ENV } from '../../../common/tokens';
import { startPetrosRequest } from './petros-performance';
@Injectable()
export class PetrosV2OriginGuard implements CanActivate {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    startPetrosRequest(req);
    ctx
      .switchToHttp()
      .getResponse<{ setHeader: (key: string, value: string) => void }>()
      .setHeader('Cache-Control', 'private, no-store');
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    const origin = req.header('origin');
    if (
      (origin && !(this.env.API_CORS_ORIGINS ?? []).includes(origin)) ||
      (!origin && req.header('sec-fetch-site') === 'cross-site')
    )
      throw new ForbiddenException({ code: 'M4_ORIGIN_DENIED' });
    return true;
  }
}
