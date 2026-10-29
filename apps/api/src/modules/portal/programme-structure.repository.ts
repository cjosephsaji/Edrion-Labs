import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  eq,
  inArray,
  schema,
  sql,
  type Database,
} from '@edrion/database';
import type {
  Department,
  NewDepartmentGradeLevel,
  NewGradeLevel,
  NewProgrammeTermSlot,
  ProgrammeTermSlot,
} from '@edrion/database';
import type { CommitStructureInput } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import { scheduleProgrammeSlots } from './programme-schedule';

export interface StructureSlotSubjectRow {
  id: string;
  subjectId: string;
  subjectName: string | null;
  subjectCode: string | null;
  subjectKind: string | null;
  credits: number | null;
  isElective: boolean;
  sequence: number;
  version: number;
}

export interface StructureSlotRow {
  id: string;
  programmeLevelId: string;
  levelSequence: number;
  sequenceInYear: number;
  absoluteSequence: number;
  name: string;
  kind: string;
  durationMonths: number | null;
  isTerminal: boolean;
  subjectCount: number;
  subjects: StructureSlotSubjectRow[];
  version: number;
}

export interface StructureLevelRow {
  id: string;
  sequence: number;
  name: string;
  gradeLevelId: string;
  durationLabel: string | null;
  version: number;
  slots: StructureSlotRow[];
}

export interface ProgrammeStructureDetail {
  department: {
    id: string;
    name: string;
    code: string;
    termSystem: string;
    durationMonths: number | null;
    termsPerYear: number;
    structureLocked: boolean;
    version: number;
  };
  levels: StructureLevelRow[];
  totals: { levels: number; slots: number };
}

@Injectable()
export class ProgrammeStructureRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findDepartment(id: string, institutionId: string): Promise<Department | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.departments)
      .where(and(eq(schema.departments.id, id), eq(schema.departments.institutionId, institutionId)))
      .limit(1);
    return row;
  }

  async countSlotsForDepartment(departmentId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(schema.programmeTermSlots)
      .where(eq(schema.programmeTermSlots.departmentId, departmentId));
    return Number(row?.value ?? 0);
  }

  async getStructure(departmentId: string, institutionId: string): Promise<ProgrammeStructureDetail | null> {
    const dept = await this.findDepartment(departmentId, institutionId);
    if (!dept) return null;

    const levelRows = await this.db
      .select({
        link: schema.departmentGradeLevels,
        gradeLevelName: schema.gradeLevels.name,
      })
      .from(schema.departmentGradeLevels)
      .innerJoin(schema.gradeLevels, eq(schema.gradeLevels.id, schema.departmentGradeLevels.gradeLevelId))
      .where(
        and(
          eq(schema.departmentGradeLevels.institutionId, institutionId),
          eq(schema.departmentGradeLevels.departmentId, departmentId),
        ),
      )
      .orderBy(asc(schema.departmentGradeLevels.sequence));

    const levelIds = levelRows.map((r) => r.link.id);
    const slots =
      levelIds.length === 0
        ? []
        : await this.db
            .select()
            .from(schema.programmeTermSlots)
            .where(
              and(
                eq(schema.programmeTermSlots.institutionId, institutionId),
                inArray(schema.programmeTermSlots.programmeLevelId, levelIds),
              ),
            )
            .orderBy(asc(schema.programmeTermSlots.absoluteSequence));

    const slotById = new Map(slots.map((s) => [s.id, s]));
    const slotByLevelSeq = new Map(
      slots.map((s) => [`${s.programmeLevelId}:${s.sequenceInYear}`, s] as const),
    );
    const subjectsBySlot = new Map<string, StructureSlotSubjectRow[]>();

    if (levelIds.length > 0) {
      const placementRows = await this.db
        .select({
          row: schema.programmeSubjects,
          subjectName: schema.subjects.name,
          subjectCode: schema.subjects.code,
          subjectKind: schema.subjects.kind,
        })
        .from(schema.programmeSubjects)
        .leftJoin(schema.subjects, eq(schema.subjects.id, schema.programmeSubjects.subjectId))
        .where(
          and(
            eq(schema.programmeSubjects.institutionId, institutionId),
            eq(schema.programmeSubjects.departmentId, departmentId),
          ),
        )
        .orderBy(asc(schema.programmeSubjects.sequence), asc(schema.subjects.name));

      for (const r of placementRows) {
        const slotId =
          (r.row.slotId && slotById.has(r.row.slotId) ? r.row.slotId : null) ??
          slotByLevelSeq.get(`${r.row.programmeLevelId}:${r.row.semesterSequence}`)?.id;
        if (!slotId) continue;
        const list = subjectsBySlot.get(slotId) ?? [];
        list.push({
          id: r.row.id,
          subjectId: r.row.subjectId,
          subjectName: r.subjectName,
          subjectCode: r.subjectCode,
          subjectKind: r.subjectKind,
          credits: r.row.credits,
          isElective: r.row.isElective,
          sequence: r.row.sequence,
          version: r.row.version,
        });
        subjectsBySlot.set(slotId, list);
      }
    }

    const slotsByLevel = new Map<string, StructureSlotRow[]>();
    for (const s of slots) {
      const levelSeq =
        levelRows.find((l) => l.link.id === s.programmeLevelId)?.link.sequence ?? 0;
      const subjects = subjectsBySlot.get(s.id) ?? [];
      const list = slotsByLevel.get(s.programmeLevelId) ?? [];
      list.push({
        id: s.id,
        programmeLevelId: s.programmeLevelId,
        levelSequence: levelSeq,
        sequenceInYear: s.sequenceInYear,
        absoluteSequence: s.absoluteSequence,
        name: s.name,
        kind: s.kind,
        durationMonths: s.durationMonths,
        isTerminal: s.isTerminal,
        subjectCount: subjects.length,
        subjects,
        version: s.version,
      });
      slotsByLevel.set(s.programmeLevelId, list);
    }

    const levels: StructureLevelRow[] = levelRows.map((r) => ({
      id: r.link.id,
      sequence: r.link.sequence,
      name: r.gradeLevelName,
      gradeLevelId: r.link.gradeLevelId,
      durationLabel: r.link.durationLabel,
      version: r.link.version,
      slots: slotsByLevel.get(r.link.id) ?? [],
    }));

    const totalSlots = levels.reduce((n, l) => n + l.slots.length, 0);

    return {
      department: {
        id: dept.id,
        name: dept.name,
        code: dept.code,
        termSystem: dept.termSystem,
        durationMonths: dept.durationMonths,
        termsPerYear: dept.termsPerYear,
        structureLocked: dept.structureLocked,
        version: dept.version,
      },
      levels,
      totals: { levels: levels.length, slots: totalSlots },
    };
  }

  async hasEnrolledStudents(departmentId: string): Promise<boolean> {
    const slots = await this.db
      .select({ id: schema.programmeTermSlots.id })
      .from(schema.programmeTermSlots)
      .where(eq(schema.programmeTermSlots.departmentId, departmentId));

    const slotIds = slots.map((s) => s.id);
    if (slotIds.length === 0) return false;

    const terms = await this.db
      .select({ id: schema.academicTerms.id })
      .from(schema.academicTerms)
      .where(inArray(schema.academicTerms.slotId, slotIds))
      .limit(1);

    if (terms.length === 0) return false;

    const termIds = (
      await this.db
        .select({ id: schema.academicTerms.id })
        .from(schema.academicTerms)
        .where(inArray(schema.academicTerms.slotId, slotIds))
    ).map((t) => t.id);

    const [row] = await this.db
      .select({ value: count() })
      .from(schema.classes)
      .innerJoin(schema.students, eq(schema.students.classId, schema.classes.id))
      .where(inArray(schema.classes.termId, termIds));
    return Number(row?.value ?? 0) > 0;
  }

  async commitStructure(
    institutionId: string,
    departmentId: string,
    campusId: string | null,
    input: CommitStructureInput,
    actorId: string | null,
  ): Promise<ProgrammeStructureDetail> {
    await this.db.transaction(async (tx) => {
      // Serialize edits to the same structure and reject stale onboarding previews.
      const [department] = await tx
        .select()
        .from(schema.departments)
        .where(
          and(
            eq(schema.departments.id, departmentId),
            eq(schema.departments.institutionId, institutionId),
          ),
        )
        .for('update');
      if (!department || (input.version != null && department.version !== input.version)) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'This structure changed. Refresh and try again.',
        });
      }
      const existingLevels = await tx
        .select()
        .from(schema.departmentGradeLevels)
        .where(eq(schema.departmentGradeLevels.departmentId, departmentId));
      const existingSlots = await tx
        .select()
        .from(schema.programmeTermSlots)
        .where(eq(schema.programmeTermSlots.departmentId, departmentId));
      const placements = await tx
        .select()
        .from(schema.programmeSubjects)
        .where(eq(schema.programmeSubjects.departmentId, departmentId));
      for (const placement of placements.filter((row) => !row.slotId)) {
        const slot = existingSlots.find(
          (item) =>
            item.programmeLevelId === placement.programmeLevelId &&
            item.sequenceInYear === placement.semesterSequence,
        );
        if (!slot)
          throw new ConflictException({
            code: 'STRUCTURE_IN_USE',
            message: 'Repair curriculum entries without a term before editing this structure.',
          });
        if (slot)
          await tx
            .update(schema.programmeSubjects)
            .set({ slotId: slot.id })
            .where(eq(schema.programmeSubjects.id, placement.id));
      }
      const levelIds = new Set(existingLevels.map((level) => level.id));
      const slotIds = new Set(existingSlots.map((slot) => slot.id));
      if (
        input.levels.some((level) => level.id && !levelIds.has(level.id)) ||
        input.slots.some((slot) => slot.id && !slotIds.has(slot.id))
      ) {
        throw new ConflictException({
          code: 'INVALID_STRUCTURE_REFERENCE',
          message: 'An edited row does not belong to this structure.',
        });
      }
      const keptLevels = new Set(input.levels.flatMap((level) => (level.id ? [level.id] : [])));
      const keptSlots = new Set(input.slots.flatMap((slot) => (slot.id ? [slot.id] : [])));
      const removedLevels = existingLevels.filter((level) => !keptLevels.has(level.id));
      const removedSlots = existingSlots.filter((slot) => !keptSlots.has(slot.id));
      const removedGradeIds = removedLevels.map((level) => level.gradeLevelId);
      const removedSlotIds = removedSlots.map((slot) => slot.id);

      // Removing a populated row must never silently discard curriculum or student placement.
      if (removedGradeIds.length) {
        const [students] = await tx
          .select({ value: count() })
          .from(schema.students)
          .where(inArray(schema.students.gradeLevelId, removedGradeIds));
        const [classes] = await tx
          .select({ value: count() })
          .from(schema.classes)
          .where(inArray(schema.classes.gradeLevelId, removedGradeIds));
        const [enrollments] = await tx
          .select({ value: count() })
          .from(schema.studentEnrollments)
          .where(inArray(schema.studentEnrollments.gradeLevelId, removedGradeIds));
        if (
          Number(students?.value) > 0 ||
          Number(classes?.value) > 0 ||
          Number(enrollments?.value) > 0
        ) {
          throw new ConflictException({
            code: 'STRUCTURE_IN_USE',
            message: 'Move students and classes out of a grade before removing it.',
          });
        }
      }
      if (removedSlotIds.length) {
        const [subjects] = await tx
          .select({ value: count() })
          .from(schema.programmeSubjects)
          .where(inArray(schema.programmeSubjects.slotId, removedSlotIds));
        const [classes] = await tx
          .select({ value: count() })
          .from(schema.classes)
          .innerJoin(schema.academicTerms, eq(schema.classes.termId, schema.academicTerms.id))
          .where(inArray(schema.academicTerms.slotId, removedSlotIds));
        if (Number(subjects?.value) > 0 || Number(classes?.value) > 0) {
          throw new ConflictException({
            code: 'STRUCTURE_IN_USE',
            message: 'Remove subject placements and classes from a term before removing it.',
          });
        }
        await tx
          .delete(schema.academicTerms)
          .where(inArray(schema.academicTerms.slotId, removedSlotIds));
        await tx
          .delete(schema.programmeTermSlots)
          .where(inArray(schema.programmeTermSlots.id, removedSlotIds));
      }
      if (removedLevels.length) {
        await tx.delete(schema.departmentGradeLevels).where(
          inArray(
            schema.departmentGradeLevels.id,
            removedLevels.map((level) => level.id),
          ),
        );
        await tx.delete(schema.gradeLevels).where(inArray(schema.gradeLevels.id, removedGradeIds));
      }
      for (const placement of placements) {
        await tx
          .update(schema.programmeSubjects)
          .set({ semesterSequence: -placement.semesterSequence })
          .where(eq(schema.programmeSubjects.id, placement.id));
      }
      // Free unique sequence positions before renumbering retained slots.
      for (const slot of existingSlots.filter((slot) => keptSlots.has(slot.id))) {
        await tx
          .update(schema.programmeTermSlots)
          .set({ sequenceInYear: -slot.sequenceInYear, absoluteSequence: -slot.absoluteSequence })
          .where(eq(schema.programmeTermSlots.id, slot.id));
      }
      const levelIdBySequence = new Map<number, string>();
      for (const level of input.levels) {
        const existing = existingLevels.find((item) => item.id === level.id);
        if (existing) {
          await tx
            .update(schema.gradeLevels)
            .set({
              name: level.name,
              level: level.sequence,
              updatedBy: actorId,
              updatedAt: new Date(),
              version: sql`${schema.gradeLevels.version} + 1`,
            })
            .where(eq(schema.gradeLevels.id, existing.gradeLevelId));
          await tx
            .update(schema.departmentGradeLevels)
            .set({
              sequence: level.sequence,
              durationLabel: level.durationMonths != null ? `${level.durationMonths} mo` : null,
              updatedBy: actorId,
              updatedAt: new Date(),
              version: sql`${schema.departmentGradeLevels.version} + 1`,
            })
            .where(eq(schema.departmentGradeLevels.id, existing.id));
          levelIdBySequence.set(level.sequence, existing.id);
        } else {
          const [grade] = await tx
            .insert(schema.gradeLevels)
            .values({
              institutionId,
              campusId,
              name: level.name,
              level: level.sequence,
              departmentId,
              createdBy: actorId,
            } satisfies NewGradeLevel)
            .returning();
          const [link] = await tx
            .insert(schema.departmentGradeLevels)
            .values({
              institutionId,
              campusId,
              departmentId,
              gradeLevelId: grade!.id,
              sequence: level.sequence,
              durationLabel: level.durationMonths != null ? `${level.durationMonths} mo` : null,
              createdBy: actorId,
            } satisfies NewDepartmentGradeLevel)
            .returning();
          levelIdBySequence.set(level.sequence, link!.id);
        }
      }
      for (const slot of input.slots) {
        const programmeLevelId = levelIdBySequence.get(slot.levelSequence);
        if (!programmeLevelId) continue;
        const data = {
          programmeLevelId,
          sequenceInYear: slot.sequenceInYear,
          absoluteSequence: slot.absoluteSequence,
          name: slot.name,
          kind: slot.kind,
          durationMonths: slot.durationMonths ?? null,
          isTerminal: slot.isTerminal,
        };
        if (slot.id) {
          const existing = existingSlots.find((item) => item.id === slot.id)!;
          if (existing.programmeLevelId !== programmeLevelId) {
            throw new ConflictException({
              code: 'INVALID_STRUCTURE_REFERENCE',
              message: 'A saved term cannot be moved to another grade.',
            });
          }
          await tx
            .update(schema.programmeTermSlots)
            .set({
              ...data,
              updatedBy: actorId,
              updatedAt: new Date(),
              version: sql`${schema.programmeTermSlots.version} + 1`,
            })
            .where(eq(schema.programmeTermSlots.id, slot.id));
          await tx
            .update(schema.programmeSubjects)
            .set({
              semesterSequence: slot.sequenceInYear,
              updatedAt: new Date(),
              version: sql`${schema.programmeSubjects.version} + 1`,
            })
            .where(eq(schema.programmeSubjects.slotId, slot.id));
          await tx
            .update(schema.academicTerms)
            .set({
              name: slot.name,
              kind: slot.kind,
              sequence: slot.sequenceInYear,
              updatedAt: new Date(),
              version: sql`${schema.academicTerms.version} + 1`,
            })
            .where(eq(schema.academicTerms.slotId, slot.id));
        } else {
          await tx
            .insert(schema.programmeTermSlots)
            .values({
              institutionId,
              campusId,
              departmentId,
              ...data,
              createdBy: actorId,
            } satisfies NewProgrammeTermSlot);
        }
      }
      await tx
        .update(schema.departments)
        .set({
          unitKind: 'programme',
          ...(input.name ? { name: input.name } : {}),
          termSystem: input.termSystem,
          durationMonths: input.durationMonths ?? null,
          termsPerYear: input.termsPerYear,
          updatedBy: actorId,
          updatedAt: new Date(),
          version: sql`${schema.departments.version} + 1`,
        })
        .where(eq(schema.departments.id, departmentId));
    });

    const result = await this.getStructure(departmentId, institutionId);
    return result!;
  }

  async findSlot(
    slotId: string,
    institutionId: string,
  ): Promise<ProgrammeTermSlot | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.programmeTermSlots)
      .where(
        and(
          eq(schema.programmeTermSlots.id, slotId),
          eq(schema.programmeTermSlots.institutionId, institutionId),
        ),
      )
      .limit(1);
    return row;
  }

  async listSlotsForInstitution(institutionId: string) {
    return this.db
      .select({
        slot: schema.programmeTermSlots,
        levelSequence: schema.departmentGradeLevels.sequence,
        gradeLevelId: schema.departmentGradeLevels.gradeLevelId,
      })
      .from(schema.programmeTermSlots)
      .innerJoin(
        schema.departmentGradeLevels,
        eq(schema.departmentGradeLevels.id, schema.programmeTermSlots.programmeLevelId),
      )
      .where(eq(schema.programmeTermSlots.institutionId, institutionId))
      .orderBy(asc(schema.programmeTermSlots.absoluteSequence));
  }

  async findAcademicYear(id: string, institutionId: string) {
    const [row] = await this.db
      .select()
      .from(schema.academicYears)
      .where(and(eq(schema.academicYears.id, id), eq(schema.academicYears.institutionId, institutionId)))
      .limit(1);
    return row;
  }

  async listAcademicYearIds(institutionId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.academicYears.id })
      .from(schema.academicYears)
      .where(eq(schema.academicYears.institutionId, institutionId))
      .orderBy(asc(schema.academicYears.startDate));
    return rows.map((r) => r.id);
  }

  /** Materialise dated academic terms from programme slots for every academic year. */
  async scheduleAllYears(
    institutionId: string,
    campusId: string | null,
    actorId: string | null,
    refreshDepartmentId?: string,
  ): Promise<{ created: number; skipped: number }> {
    const yearIds = await this.listAcademicYearIds(institutionId);
    let created = 0;
    let skipped = 0;
    for (const academicYearId of yearIds) {
      const result = await this.scheduleYear(
        institutionId,
        academicYearId,
        campusId,
        actorId,
        false,
        refreshDepartmentId,
      );
      created += result.created;
      skipped += result.skipped;
    }
    return { created, skipped };
  }

  async scheduleYear(
    institutionId: string,
    academicYearId: string,
    campusId: string | null,
    actorId: string | null,
    replaceExisting: boolean,
    refreshDepartmentId?: string,
  ): Promise<{ created: number; skipped: number }> {
    const year = await this.findAcademicYear(academicYearId, institutionId);
    if (!year) return { created: 0, skipped: 0 };

    const slotRows = await this.listSlotsForInstitution(institutionId);
    if (slotRows.length === 0) return { created: 0, skipped: 0 };

    const schedule = scheduleProgrammeSlots(
      year.startDate,
      year.endDate,
      slotRows.map(({ slot }) => ({
        id: slot.id,
        programmeLevelId: slot.programmeLevelId,
        sequenceInYear: slot.sequenceInYear,
        durationMonths: slot.durationMonths,
      })),
    );

    let created = 0;
    let skipped = 0;
    return this.db.transaction(async (tx) => {
      if (replaceExisting) {
        const slotIds = slotRows.map((r) => r.slot.id);
        await tx
          .delete(schema.academicTerms)
          .where(
            and(
              eq(schema.academicTerms.academicYearId, academicYearId),
              inArray(schema.academicTerms.slotId, slotIds),
            ),
          );
      }

      for (const row of slotRows) {
        const { slot, gradeLevelId } = row;

        const [existing] = await tx
          .select({ id: schema.academicTerms.id })
          .from(schema.academicTerms)
          .where(
            and(
              eq(schema.academicTerms.academicYearId, academicYearId),
              eq(schema.academicTerms.slotId, slot.id),
            ),
          )
          .limit(1);

        if (existing) {
          if (refreshDepartmentId === slot.departmentId) {
            const dates = schedule.get(slot.id)!;
            await tx.update(schema.academicTerms).set({
              name: slot.name, kind: slot.kind, sequence: slot.sequenceInYear,
              startDate: dates.startDate, endDate: dates.endDate,
              updatedBy: actorId, updatedAt: new Date(), version: sql`${schema.academicTerms.version} + 1`,
            }).where(eq(schema.academicTerms.id, existing.id));
          }
          skipped += 1;
          continue;
        }

        const dates = schedule.get(slot.id)!;

        await tx.insert(schema.academicTerms).values({
          institutionId,
          campusId,
          academicYearId,
          programmeLevelId: slot.programmeLevelId,
          departmentId: slot.departmentId,
          gradeLevelId,
          slotId: slot.id,
          name: slot.name,
          kind: slot.kind,
          sequence: slot.sequenceInYear,
          startDate: dates.startDate,
          endDate: dates.endDate,
          status: 'active',
          createdBy: actorId,
        });

        created += 1;
      }

      return { created, skipped };
    });
  }

  async setStructureLocked(departmentId: string, locked: boolean): Promise<void> {
    await this.db
      .update(schema.departments)
      .set({ structureLocked: locked, updatedAt: new Date() })
      .where(eq(schema.departments.id, departmentId));
  }

  async countProgrammesWithSlots(institutionId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count(sql`DISTINCT ${schema.programmeTermSlots.departmentId}`) })
      .from(schema.programmeTermSlots)
      .where(eq(schema.programmeTermSlots.institutionId, institutionId));
    return Number(row?.value ?? 0);
  }
}
