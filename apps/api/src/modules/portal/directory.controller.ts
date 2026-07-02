import { Controller, Get, Inject, Injectable, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  schema,
  type Database,
  type SQL,
} from '@edrion/database';
import { resolveScopeFilter } from '@edrion/auth';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { DATABASE } from '../../common/tokens';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import type { ListResult } from './academics.service';
import type { PortalActionContext } from './portal-action-context';

// Picker/directory batch loads request pageSize=200 (students-basic / staff-basic), so this caps
// higher than the shared 100 default. Kept local so other lists keep the normal ceiling.
const directoryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  search: z.string().trim().max(160).optional(),
});
type DirectoryListQuery = z.infer<typeof directoryListQuerySchema>;

/**
 * Reduced-projection people reads (Phase 13). Receptionist/Counselor need name + class/role +
 * contact only — NEVER academic, financial or medical fields. These read-only endpoints project a
 * deliberately narrow column set from students/staff, scope-confined like every other portal read.
 */
@Injectable()
export class DirectoryService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async studentsBasic(ctx: PortalActionContext, q: DirectoryListQuery) {
    const f = resolveScopeFilter(ctx.principal, ctx.scope);
    const t = schema.students;
    const conds: SQL[] = [eq(t.institutionId, ctx.principal.institutionId)];
    if (f.campusIds) {
      const inScope = or(isNull(t.campusId), inArray(t.campusId, f.campusIds));
      if (inScope) conds.push(inScope);
    }
    if (q.search) {
      const s = or(ilike(t.firstName, `%${q.search}%`), ilike(t.lastName, `%${q.search}%`), ilike(t.admissionNo, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const items = await this.db
      .select({
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        admissionNo: t.admissionNo,
        rollNo: t.rollNo,
        classId: t.classId,
        email: t.email,
        phone: t.phone,
        status: t.status,
      })
      .from(t)
      .where(where)
      .orderBy(asc(t.lastName))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return this.paginate(items, Number(tot?.value ?? 0), q);
  }

  async staffBasic(ctx: PortalActionContext, q: DirectoryListQuery) {
    const f = resolveScopeFilter(ctx.principal, ctx.scope);
    const t = schema.staff;
    const conds: SQL[] = [eq(t.institutionId, ctx.principal.institutionId)];
    if (f.campusIds) {
      const inScope = or(isNull(t.campusId), inArray(t.campusId, f.campusIds));
      if (inScope) conds.push(inScope);
    }
    if (q.search) {
      const s = or(ilike(t.firstName, `%${q.search}%`), ilike(t.lastName, `%${q.search}%`), ilike(t.employeeNo, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const items = await this.db
      .select({
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        employeeNo: t.employeeNo,
        designation: t.designation,
        email: t.email,
        phone: t.phone,
        status: t.status,
      })
      .from(t)
      .where(where)
      .orderBy(asc(t.lastName))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return this.paginate(items, Number(tot?.value ?? 0), q);
  }

  private paginate<T>(items: T[], total: number, q: DirectoryListQuery): ListResult<T> {
    return { items, total, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < total };
  }
}

/**
 * Institution-portal Directory API (Phase 13). Reduced-projection people reads for Front Desk /
 * Counseling. Gated by student_basic_profile.view / staff_basic_profile.view — distinct from the
 * full students.view / staff.view keys, which expose academic/financial/medical fields.
 */
@ApiTags('portal-directory')
@Controller('portal/directory')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class DirectoryController {
  constructor(private readonly svc: DirectoryService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get('students-basic')
  @RequireInstitutionPermissions('student_basic_profile.view')
  studentsBasic(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(directoryListQuerySchema)) q: DirectoryListQuery,
  ) {
    return this.svc.studentsBasic(this.ctx(p, s, r), q);
  }

  @Get('staff-basic')
  @RequireInstitutionPermissions('staff_basic_profile.view')
  staffBasic(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(directoryListQuerySchema)) q: DirectoryListQuery,
  ) {
    return this.svc.staffBasic(this.ctx(p, s, r), q);
  }
}
