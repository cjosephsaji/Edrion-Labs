import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { commitStructureSchema } from '@edrion/schemas';
import { generateStructure } from '@edrion/shared-types';
import type { AuditEventInput, AuditWriter } from '@edrion/audit';
import type {
  CommitStructureInput,
  PreviewStructureInput,
  ScheduleAcademicYearInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';
import {
  ProgrammeStructureRepository,
  type ProgrammeStructureDetail,
} from './programme-structure.repository';

const MODULE = 'portal-academics';

@Injectable()
export class ProgrammeStructureService {
  constructor(
    private readonly repo: ProgrammeStructureRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  preview(_ctx: PortalActionContext, input: PreviewStructureInput) {
    return generateStructure({
      ...input,
      durationMonths: input.durationMonths ?? null,
    });
  }

  async get(ctx: PortalActionContext, departmentId: string): Promise<ProgrammeStructureDetail> {
    const row = await this.repo.getStructure(departmentId, ctx.principal.institutionId);
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Programme not found.' });
    }
    return row;
  }

  async commit(
    ctx: PortalActionContext,
    departmentId: string,
    input: CommitStructureInput,
  ): Promise<ProgrammeStructureDetail> {
    const validated = commitStructureSchema.safeParse(input);
    if (!validated.success) throw new BadRequestException({ code: 'INVALID_STRUCTURE', message: validated.error.issues[0]?.message ?? 'Check the structure rows.' });
    const dept = await this.repo.findDepartment(departmentId, ctx.principal.institutionId);
    if (!dept) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Programme not found.' });
    }

    if (dept.unitKind !== 'programme') throw new BadRequestException({
      code: 'INVALID_PROGRAMME', message: 'Choose a course or programme. Staff departments cannot contain a student course structure.',
    });

    if (dept.structureLocked || await this.repo.hasEnrolledStudents(departmentId)) {
      throw new ConflictException({
        code: 'STRUCTURE_LOCKED',
        message: 'This programme structure is locked because students are enrolled.',
      });
    }

    const existing = await this.repo.countSlotsForDepartment(departmentId);
    if (existing > 0 && input.levels.length < 1) {
      throw new ConflictException({
        code: 'DESTRUCTIVE_CHANGE',
        message: 'Cannot remove all levels from a programme that already has a structure.',
      });
    }

    const campusId = ctx.scope.mode === 'campus' ? ctx.scope.campusId : null;
    const result = await this.repo.commitStructure(
      ctx.principal.institutionId,
      departmentId,
      campusId,
      input,
      ctx.principal.institutionUserId,
    );

    if (await this.repo.hasEnrolledStudents(departmentId)) {
      // Mark locked — destructive regeneration would orphan enrolments.
      await this.repo.setStructureLocked(departmentId, true);
      result.department.structureLocked = true;
    }

    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action: 'programme_structure.commit',
      module: MODULE,
      entityType: 'department',
      entityId: departmentId,
      campusId: campusId ?? undefined,
      newState: { levels: result.totals.levels, slots: result.totals.slots },
    } as AuditEventInput);

    // Turn undated programme slots into dated academic terms for any years already on file.
    await this.repo.scheduleAllYears(
      ctx.principal.institutionId,
      campusId,
      ctx.principal.institutionUserId,
      departmentId,
    );

    return result;
  }

  /** Backfill academic terms from programme slots — used after onboarding go-live. */
  async scheduleAllYears(ctx: PortalActionContext) {
    const campusId = ctx.scope.mode === 'campus' ? ctx.scope.campusId : null;
    return this.repo.scheduleAllYears(
      ctx.principal.institutionId,
      campusId,
      ctx.principal.institutionUserId,
    );
  }

  async patch(
    ctx: PortalActionContext,
    departmentId: string,
    input: Partial<CommitStructureInput> & { version: number },
  ): Promise<ProgrammeStructureDetail> {
    const current = await this.get(ctx, departmentId);

    if (current.department.structureLocked) {
      const fewerLevels =
        input.levels != null && input.levels.length < current.totals.levels;
      const fewerSlots = input.slots != null && input.slots.length < current.totals.slots;
      if (fewerLevels || fewerSlots) {
        throw new ConflictException({
          code: 'STRUCTURE_LOCKED',
          message: 'Destructive structure changes are blocked while students are enrolled.',
        });
      }
    }

    const merged: CommitStructureInput = {
      name: input.name,
      version: input.version,
      termSystem: (input.termSystem ?? current.department.termSystem) as CommitStructureInput['termSystem'],
      durationMonths: input.durationMonths !== undefined ? input.durationMonths : current.department.durationMonths,
      termsPerYear: input.termsPerYear ?? current.department.termsPerYear,
      levels:
        input.levels ??
        current.levels.map((l) => ({
          id: l.id,
          sequence: l.sequence,
          name: l.name,
          durationMonths: l.durationLabel ? Number.parseInt(l.durationLabel, 10) || null : null,
        })),
      slots:
        input.slots ??
        current.levels.flatMap((l) =>
          l.slots.map((s) => ({
            id: s.id,
            levelSequence: s.levelSequence,
            sequenceInYear: s.sequenceInYear,
            absoluteSequence: s.absoluteSequence,
            name: s.name,
            kind: s.kind,
            durationMonths: s.durationMonths,
            isTerminal: s.isTerminal,
          })),
        ),
    };

    return this.commit(ctx, departmentId, merged);
  }

  async scheduleYear(
    ctx: PortalActionContext,
    academicYearId: string,
    input: ScheduleAcademicYearInput,
  ) {
    const year = await this.repo.findAcademicYear(academicYearId, ctx.principal.institutionId);
    if (!year) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Academic year not found.' });
    }

    const campusId = ctx.scope.mode === 'campus' ? ctx.scope.campusId : null;
    const result = await this.repo.scheduleYear(
      ctx.principal.institutionId,
      academicYearId,
      campusId,
      ctx.principal.institutionUserId,
      input.replaceExisting,
    );

    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action: 'academic_year.schedule',
      module: MODULE,
      entityType: 'academic_year',
      entityId: academicYearId,
      campusId: campusId ?? undefined,
      newState: result,
    } as AuditEventInput);

    return result;
  }
}
