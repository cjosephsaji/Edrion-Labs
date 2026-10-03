import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { from, lastValueFrom, type Observable } from 'rxjs';
import {
  runInIndependentStudentTenant,
  runInStudentTenant,
  type Database,
} from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { STUDENT_OWNS_TRANSACTIONS } from './student-owned-transactions';

/**
 * Binds Postgres RLS to the student-portal request path. Institutional students run inside
 * `runInStudentTenant` (institution + student GUCs); independent learners use
 * `runInIndependentStudentTenant`.
 */
@Injectable()
export class StudentTenantInterceptor implements NestInterceptor {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    if (Reflect.getMetadata(STUDENT_OWNS_TRANSACTIONS, ctx.getHandler()) === true)
      return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    const principal = req.studentContext?.principal;
    if (!principal) return next.handle();

    if (principal.kind === 'institutional') {
      return from(
        runInStudentTenant(
          this.db,
          { institutionId: principal.institutionId, studentId: principal.studentId },
          () => lastValueFrom(next.handle()),
        ),
      );
    }

    return from(
      runInIndependentStudentTenant(this.db, principal.independentUserId, () =>
        lastValueFrom(next.handle()),
      ),
    );
  }
}
