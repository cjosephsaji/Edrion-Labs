import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { runInInstitutionTenant, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';

/**
 * Binds Postgres Row-Level Security to the Institution-Portal request path. Registered globally,
 * but only acts when `institutionContext` is present (set by InstitutionAuthGuard) — platform
 * requests pass straight through untouched. For a portal request it runs the whole handler inside
 * a transaction that sets the `app.institution_id` GUC, so the tenant-isolation policies in
 * `zzz_rls.sql` confine every read/write to the principal's institution at the storage layer —
 * defence-in-depth beneath the permission + scope guards, which remain authoritative.
 *
 * As a transaction, the handler is also now atomic: a thrown error rolls the request back, which
 * matches the existing pre-check-then-write services (they validate before mutating).
 */
@Injectable()
export class PortalTenantInterceptor implements NestInterceptor {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    const institutionId = req.institutionContext?.principal.institutionId;
    if (!institutionId) return next.handle();

    return from(
      runInInstitutionTenant(this.db, institutionId, () => lastValueFrom(next.handle()), req.institutionContext!.principal.institutionUserId),
    );
  }
}
