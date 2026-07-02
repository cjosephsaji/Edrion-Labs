import { CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { and, eq, inArray, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import type { GuardianContext, GuardianStudentScope } from './guardian-context';

/**
 * Loads the caller's active guardian links and attaches `guardianContext`. Runs AFTER
 * InstitutionAuthGuard (which resolves `institutionContext.principal`). The caller is an
 * institution_user with the `parent` role; their wards come from parents → student_guardians, honoring
 * per-link `visibility_overrides` (e.g. a court order hiding fees/health for one guardian).
 *
 * A guardian with zero links is allowed through with an empty ward set (endpoints that require a
 * `:studentId` will 403 via assertWard). Guardian-row scoping lives here at the service boundary; the
 * database RLS is institution-isolation only (matching the rest of the portal).
 *
 * NOTE: two indexed lookups per request. A 60s Redis cache keyed by guardianUserId (invalidated on
 * link change) is a planned optimization; correctness-first here.
 */
@Injectable()
export class GuardianScopeGuard implements CanActivate {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const ic = req.institutionContext;
    if (!ic) {
      throw new Error('GuardianScopeGuard requires InstitutionAuthGuard to run first');
    }
    const { institutionUserId, institutionId } = ic.principal;

    const parentRows = await this.db
      .select({ id: schema.parents.id })
      .from(schema.parents)
      .where(
        and(
          eq(schema.parents.institutionId, institutionId),
          eq(schema.parents.institutionUserId, institutionUserId),
        ),
      );
    const parentIds = parentRows.map((p) => p.id);

    const byStudent = new Map<string, GuardianStudentScope>();
    if (parentIds.length) {
      const links = await this.db
        .select({
          studentId: schema.studentGuardians.studentId,
          overrides: schema.studentGuardians.visibilityOverrides,
          campusId: schema.students.campusId,
        })
        .from(schema.studentGuardians)
        .innerJoin(schema.students, eq(schema.students.id, schema.studentGuardians.studentId))
        .where(
          and(
            eq(schema.studentGuardians.institutionId, institutionId),
            inArray(schema.studentGuardians.parentId, parentIds),
          ),
        );

      for (const l of links) {
        const prev = byStudent.get(l.studentId);
        // A student reachable via multiple parent rows: a section is hidden only if EVERY link hides
        // it (a permissive link wins) — start from the first link, then AND subsequent overrides.
        const overrides = (l.overrides ?? {}) as Record<string, boolean>;
        if (!prev) {
          byStudent.set(l.studentId, { studentId: l.studentId, campusId: l.campusId, hidden: { ...overrides } });
        } else {
          for (const key of Object.keys(prev.hidden)) {
            if (!overrides[key]) delete prev.hidden[key];
          }
        }
      }
    }

    const students = [...byStudent.values()];
    const guardianContext: GuardianContext = {
      guardianUserId: institutionUserId,
      institutionId,
      studentIds: students.map((s) => s.studentId),
      students,
    };
    req.guardianContext = guardianContext;
    return true;
  }
}

/**
 * Assert the caller is a guardian of `studentId` (and that `section`, if given, isn't hidden for them).
 * Returns the ward scope. Throws 403 otherwise. Services call this for every `:studentId` param.
 */
export function assertWard(
  guardian: GuardianContext,
  studentId: string,
  section?: string,
): GuardianStudentScope {
  const scope = guardian.students.find((s) => s.studentId === studentId);
  if (!scope) {
    throw new ForbiddenException({
      code: 'STUDENT_OUT_OF_SCOPE',
      message: 'You are not a guardian of this student.',
    });
  }
  if (section && scope.hidden[section]) {
    throw new ForbiddenException({
      code: 'SECTION_RESTRICTED',
      message: 'This information is not available to you.',
    });
  }
  return scope;
}
