import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { resolveScopeFilter, type InstitutionScope, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import { can as hasPerm } from '@edrion/permissions';
import type {
  AssignGuardianInput,
  CreateParentInput,
  CreateStaffInput,
  CreateStudentInput,
  PeopleListQuery,
  UpdateParentInput,
  UpdateStaffInput,
  UpdateStudentInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { FeesRepository } from './fees.repository';
import { PeopleRepository, type RefTable } from './people.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

const MODULE = 'portal-people';
const TEACH_PERMISSION = 'academics.teach';

/**
 * Institution-portal People service (Phase 4). Owns the same tenant invariants as AcademicsService:
 * every read/write is confined to the principal's institution + the request's campus scope; new
 * rows are stamped with the active campus (or institution-owned when viewing the whole institution);
 * updates/deletes are optimistic-concurrency guarded; foreign keys are pre-checked for friendly 400s;
 * and every mutation writes an audit event attributed to the institution user.
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly repo: PeopleRepository,
    private readonly users: UsersService,
    private readonly usersRepo: UsersRepository,
    private readonly feesRepo: FeesRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // === students ==============================================================

  async listStudents(ctx: PortalActionContext, q: PeopleListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listStudents(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createStudent(ctx: PortalActionContext, input: CreateStudentInput) {
    await this.assertOptional(ctx, 'gradeLevels', input.gradeLevelId, 'grade level');
    await this.assertOptional(ctx, 'classes', input.classId, 'class');
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertStudent({
      institutionId: ctx.principal.institutionId,
      campusId,
      admissionNo: input.admissionNo,
      firstName: input.firstName,
      lastName: input.lastName,
      gender: input.gender ?? null,
      dateOfBirth: input.dateOfBirth ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      gradeLevelId: input.gradeLevelId ?? null,
      classId: input.classId ?? null,
      rollNo: input.rollNo ?? null,
      address: input.address ?? null,
      status: input.status,
      enrollmentDate: input.enrollmentDate ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'student.create', 'student', row.id, campusId, {
      newState: { admissionNo: row.admissionNo, name: this.fullName(row) },
    });
    return row;
  }

  async updateStudent(ctx: PortalActionContext, id: string, input: UpdateStudentInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findStudent(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(ctx, 'gradeLevels', input.gradeLevelId, 'grade level');
    await this.assertOptional(ctx, 'classes', input.classId, 'class');
    const updated = await this.repo.updateStudent(id, input.version, {
      admissionNo: input.admissionNo ?? existing!.admissionNo,
      firstName: input.firstName ?? existing!.firstName,
      lastName: input.lastName ?? existing!.lastName,
      gender: input.gender === undefined ? existing!.gender : input.gender,
      dateOfBirth: input.dateOfBirth === undefined ? existing!.dateOfBirth : input.dateOfBirth,
      email: input.email === undefined ? existing!.email : input.email,
      phone: input.phone === undefined ? existing!.phone : input.phone,
      gradeLevelId: input.gradeLevelId === undefined ? existing!.gradeLevelId : input.gradeLevelId,
      classId: input.classId === undefined ? existing!.classId : input.classId,
      rollNo: input.rollNo === undefined ? existing!.rollNo : input.rollNo,
      address: input.address === undefined ? existing!.address : input.address,
      status: input.status ?? existing!.status,
      enrollmentDate: input.enrollmentDate === undefined ? existing!.enrollmentDate : input.enrollmentDate,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'student.update', 'student', id, updated.campusId, {
      previousState: { name: this.fullName(existing!), status: existing!.status },
      newState: { name: this.fullName(updated), status: updated.status },
    });
    return updated;
  }

  async deleteStudent(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findStudent(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.guardDelete(() => this.repo.deleteStudent(id, version));
    await this.write(ctx, 'student.delete', 'student', id, existing!.campusId, {
      previousState: { admissionNo: existing!.admissionNo, name: this.fullName(existing!) },
    });
    return ok;
  }

  // === staff =================================================================

  async listStaff(ctx: PortalActionContext, q: PeopleListQuery) {
    const f = this.filter(ctx);
    const teachingUserIds =
      q.teaching !== undefined ? await this.usersRepo.userIdsWithPermission(ctx.principal.institutionId, TEACH_PERMISSION) : null;
    return this.paginate(
      await this.repo.listStaff(ctx.principal.institutionId, f.campusIds, q, teachingUserIds),
      q,
    );
  }

  async listTeachingStaff(ctx: PortalActionContext) {
    const f = this.filter(ctx);
    const teachingUserIds = await this.usersRepo.userIdsWithPermission(ctx.principal.institutionId, TEACH_PERMISSION);
    const items = await this.repo.listTeachingStaff(ctx.principal.institutionId, f.campusIds, teachingUserIds);
    return { items, total: items.length };
  }

  async createStaff(ctx: PortalActionContext, input: CreateStaffInput) {
    await this.assertOptional(ctx, 'departments', input.departmentId, 'department');
    let institutionUserId = input.institutionUserId ?? null;
    const campusId = this.createCampusId(ctx.scope);
    const campusIds = campusId ? [campusId] : [];

    if (input.createLogin && !institutionUserId) {
      if (!input.email) {
        throw new BadRequestException({ code: 'EMAIL_REQUIRED', message: 'Email is required to create a portal login.' });
      }
      const invited = await this.users.invite(ctx, {
        email: input.email,
        fullName: `${input.firstName} ${input.lastName}`.trim(),
        phone: input.phone ?? null,
        roleKeys: input.roleKeys ?? [],
        campusIds,
        requireMfa: false,
      });
      institutionUserId = invited.id;
    } else if (institutionUserId) {
      await this.assertOptional(ctx, 'institutionUsers', institutionUserId, 'user');
      if (input.roleKeys && input.roleKeys.length > 0) {
        await this.users.assignRoleKeys(ctx, institutionUserId, input.roleKeys, campusIds);
      }
    }

    const row = await this.repo.insertStaff({
      institutionId: ctx.principal.institutionId,
      campusId,
      employeeNo: input.employeeNo ?? null,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      departmentId: input.departmentId ?? null,
      designation: input.designation ?? null,
      employmentType: input.employmentType,
      status: input.status,
      joinDate: input.joinDate ?? null,
      institutionUserId,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'staff.create', 'staff', row.id, campusId, { newState: { name: this.fullName(row) } });
    return row;
  }

  async updateStaff(ctx: PortalActionContext, id: string, input: UpdateStaffInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findStaff(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(ctx, 'departments', input.departmentId, 'department');
    await this.assertOptional(ctx, 'institutionUsers', input.institutionUserId, 'user');
    const updated = await this.repo.updateStaff(id, input.version, {
      employeeNo: input.employeeNo === undefined ? existing!.employeeNo : input.employeeNo,
      firstName: input.firstName ?? existing!.firstName,
      lastName: input.lastName ?? existing!.lastName,
      email: input.email === undefined ? existing!.email : input.email,
      phone: input.phone === undefined ? existing!.phone : input.phone,
      departmentId: input.departmentId === undefined ? existing!.departmentId : input.departmentId,
      designation: input.designation === undefined ? existing!.designation : input.designation,
      employmentType: input.employmentType ?? existing!.employmentType,
      status: input.status ?? existing!.status,
      joinDate: input.joinDate === undefined ? existing!.joinDate : input.joinDate,
      institutionUserId: input.institutionUserId === undefined ? existing!.institutionUserId : input.institutionUserId,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'staff.update', 'staff', id, updated.campusId, {
      previousState: { name: this.fullName(existing!) },
      newState: { name: this.fullName(updated) },
    });
    return updated;
  }

  async deleteStaff(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findStaff(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.guardDelete(() => this.repo.deleteStaff(id, version));
    await this.write(ctx, 'staff.delete', 'staff', id, existing!.campusId, { previousState: { name: this.fullName(existing!) } });
    return ok;
  }

  async getStaffProfile(ctx: PortalActionContext, id: string) {
    const f = this.filter(ctx);
    const data = await this.repo.getStaffProfile(id, ctx.principal.institutionId);
    if (!data) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Staff not found' });
    this.assertInScope(data.staff.campusId, data.staff, f);

    const s = data.staff;
    return {
      overview: {
        id: s.id,
        name: this.fullName(s),
        employeeNo: s.employeeNo,
        email: s.email,
        phone: s.phone,
        designation: s.designation,
        employmentType: s.employmentType,
        status: s.status,
        joinDate: s.joinDate,
        departmentName: data.departmentName,
        campusName: data.campusName,
        institutionUserId: s.institutionUserId,
        roleKeys: data.roleKeys,
      },
      teaching: hasPerm(ctx.principal.permissions, TEACH_PERMISSION) || data.roleKeys.length > 0
        ? {
            classTeacherOf: data.classTeacherOf,
            subjectTeaching: data.subjectTeaching,
          }
        : null,
    };
  }

  async getParentProfile(ctx: PortalActionContext, id: string) {
    const f = this.filter(ctx);
    const parent = await this.repo.findParent(id, ctx.principal.institutionId);
    this.assertInScope(parent?.campusId ?? null, parent, f);

    const children = await this.repo.listParentChildren(id, ctx.principal.institutionId);
    const fees =
      hasPerm(ctx.principal.permissions, 'fees.view')
        ? await Promise.all(
            children.map(async (c) => ({
              studentId: c.studentId,
              name: `${c.firstName} ${c.lastName}`.trim(),
              ...((await this.feesRepo.aggregateStudentInvoices(c.studentId)) ?? {
                invoices: 0,
                billedMinor: 0,
                paidMinor: 0,
                outstandingMinor: 0,
                overdue: 0,
              }),
            })),
          )
        : null;

    return {
      overview: {
        id: parent!.id,
        name: this.fullName(parent!),
        email: parent!.email,
        phone: parent!.phone,
        occupation: parent!.occupation,
        address: parent!.address,
        institutionUserId: parent!.institutionUserId,
      },
      children: children.map((c) => ({
        studentId: c.studentId,
        name: `${c.firstName} ${c.lastName}`.trim(),
        admissionNo: c.admissionNo,
        relationship: c.relationship,
        isPrimary: c.isPrimary,
        className: c.className,
        gradeLevelName: c.gradeLevelName,
        status: c.status,
      })),
      fees,
    };
  }

  // === parents ===============================================================

  async listParents(ctx: PortalActionContext, q: PeopleListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listParents(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createParent(ctx: PortalActionContext, input: CreateParentInput) {
    await this.assertOptional(ctx, 'institutionUsers', input.institutionUserId, 'user');
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertParent({
      institutionId: ctx.principal.institutionId,
      campusId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      occupation: input.occupation ?? null,
      address: input.address ?? null,
      institutionUserId: input.institutionUserId ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'parent.create', 'parent', row.id, campusId, { newState: { name: this.fullName(row) } });
    return row;
  }

  async updateParent(ctx: PortalActionContext, id: string, input: UpdateParentInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findParent(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(ctx, 'institutionUsers', input.institutionUserId, 'user');
    const updated = await this.repo.updateParent(id, input.version, {
      firstName: input.firstName ?? existing!.firstName,
      lastName: input.lastName ?? existing!.lastName,
      email: input.email === undefined ? existing!.email : input.email,
      phone: input.phone === undefined ? existing!.phone : input.phone,
      occupation: input.occupation === undefined ? existing!.occupation : input.occupation,
      address: input.address === undefined ? existing!.address : input.address,
      institutionUserId: input.institutionUserId === undefined ? existing!.institutionUserId : input.institutionUserId,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'parent.update', 'parent', id, updated.campusId, {
      previousState: { name: this.fullName(existing!) },
      newState: { name: this.fullName(updated) },
    });
    return updated;
  }

  async deleteParent(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findParent(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.guardDelete(() => this.repo.deleteParent(id, version));
    await this.write(ctx, 'parent.delete', 'parent', id, existing!.campusId, { previousState: { name: this.fullName(existing!) } });
    return ok;
  }

  // === student ↔ guardian links ==============================================

  async listGuardians(ctx: PortalActionContext, studentId: string) {
    await this.requireStudentInScope(ctx, studentId);
    return this.repo.listGuardians(studentId);
  }

  async assignGuardian(ctx: PortalActionContext, studentId: string, input: AssignGuardianInput) {
    const student = await this.requireStudentInScope(ctx, studentId);
    await this.assertRef(ctx, 'parents', input.parentId, 'parent');
    const existing = await this.repo.findGuardian(studentId, input.parentId);
    const patch = {
      relationship: input.relationship,
      isPrimary: input.isPrimary,
      isEmergencyContact: input.isEmergencyContact,
    };
    if (existing) {
      const updated = await this.repo.updateGuardian(existing.id, { ...patch, updatedBy: ctx.principal.institutionUserId });
      await this.write(ctx, 'guardian.update', 'student_guardian', existing.id, student.campusId, {
        newState: { parentId: input.parentId, ...patch },
      });
      return updated;
    }
    const row = await this.repo.insertGuardian({
      institutionId: ctx.principal.institutionId,
      studentId,
      parentId: input.parentId,
      ...patch,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'guardian.link', 'student_guardian', row.id, student.campusId, {
      newState: { parentId: input.parentId, ...patch },
    });
    return row;
  }

  async removeGuardian(ctx: PortalActionContext, studentId: string, linkId: string) {
    const student = await this.requireStudentInScope(ctx, studentId);
    const link = await this.repo.findGuardianById(linkId, studentId);
    if (!link) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Guardian link not found' });
    const ok = await this.repo.deleteGuardian(linkId);
    await this.write(ctx, 'guardian.remove', 'student_guardian', linkId, student.campusId, {
      previousState: { parentId: link.parentId },
    });
    return { deleted: ok };
  }

  // === helpers ===============================================================

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  private createCampusId(scope: InstitutionScope): string | null {
    return scope.mode === 'campus' ? scope.campusId : null;
  }

  private fullName(p: { firstName: string; lastName: string }): string {
    return `${p.firstName} ${p.lastName}`.trim();
  }

  private assertInScope<T>(campusId: string | null, row: T | undefined, filter: ScopeFilter): asserts row is T {
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    if (campusId === null) return;
    if (filter.campusIds === null) return;
    if (!filter.campusIds.includes(campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
  }

  private async requireStudentInScope(ctx: PortalActionContext, studentId: string) {
    const f = this.filter(ctx);
    const student = await this.repo.findStudent(studentId, ctx.principal.institutionId);
    this.assertInScope(student?.campusId ?? null, student, f);
    return student;
  }

  private async assertRef(ctx: PortalActionContext, table: RefTable, id: string, label: string): Promise<void> {
    const ok = await this.repo.existsInInstitution(table, id, ctx.principal.institutionId);
    if (!ok) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: `Unknown ${label}` });
  }

  private async assertOptional(
    ctx: PortalActionContext,
    table: RefTable,
    id: string | null | undefined,
    label: string,
  ): Promise<void> {
    if (!id) return;
    await this.assertRef(ctx, table, id, label);
  }

  private async guardDelete(fn: () => Promise<boolean>): Promise<{ deleted: true }> {
    const ok = await fn();
    if (!ok) throw this.versionConflict();
    return { deleted: true };
  }

  private paginate<T>(page: Page<T>, q: PeopleListQuery): ListResult<T> {
    return {
      ...page,
      page: q.page,
      pageSize: q.pageSize,
      hasMore: q.page * q.pageSize < page.total,
    };
  }

  private async write(
    ctx: PortalActionContext,
    action: string,
    entityType: string,
    entityId: string,
    campusId: string | null,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType,
      entityId,
      campusId: campusId ?? undefined,
      ...extra,
    } as AuditEventInput);
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }
}
