import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, schema, type Database } from '@edrion/database';
import type { CreateExamGoalInput, UpdateExamGoalInput } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal, IndependentStudentPrincipal } from '../student.types';
import { SurfaceGateService } from '../surfaces/surface-gate.service';

@Injectable()
export class StudentExamsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly surfaceGate: SurfaceGateService,
  ) {}

  async listInstitutional(principal: InstitutionalStudentPrincipal) {
    await this.surfaceGate.assertSurface(principal, 'exams');
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);
    if (!student?.classId) return { items: [] };

    const rows = await this.db
      .select({
        examScheduleId: schema.examSchedules.id,
        examName: schema.exams.name,
        subject: schema.subjects.name,
        date: schema.examSchedules.examDate,
        time: schema.examSchedules.startTime,
        hall: schema.examSchedules.hall,
        seatInfo: schema.examSchedules.seatInfo,
        syllabusNote: schema.examSchedules.syllabusNote,
      })
      .from(schema.examSchedules)
      .innerJoin(schema.exams, eq(schema.examSchedules.examId, schema.exams.id))
      .innerJoin(schema.subjects, eq(schema.examSchedules.subjectId, schema.subjects.id))
      .where(
        and(
          eq(schema.examSchedules.classId, student.classId),
          eq(schema.examSchedules.published, true),
          gte(schema.examSchedules.examDate, new Date().toISOString().slice(0, 10)),
        ),
      );

    const today = new Date();
    return {
      items: rows.map((r) => {
        const examDate = new Date(r.date!);
        const daysUntil = Math.max(0, Math.ceil((examDate.getTime() - today.getTime()) / 86400000));
        return {
          examScheduleId: r.examScheduleId,
          examName: r.examName,
          subject: r.subject,
          date: r.date,
          time: r.time,
          hall: r.hall,
          seatInfo: r.seatInfo,
          syllabusNote: r.syllabusNote,
          daysUntil,
        };
      }),
    };
  }

  async listGoals(principal: IndependentStudentPrincipal) {
    const rows = await this.db
      .select()
      .from(schema.studentExamGoals)
      .where(eq(schema.studentExamGoals.independentUserId, principal.independentUserId));
    const today = new Date();
    return rows.map((g) => ({
      id: g.id,
      name: g.name,
      examDate: g.examDate,
      syllabusTopics: g.syllabusTopics,
      status: g.status as 'active' | 'done' | 'archived',
      daysUntil: Math.max(0, Math.ceil((new Date(g.examDate).getTime() - today.getTime()) / 86400000)),
    }));
  }

  async createGoal(principal: IndependentStudentPrincipal, input: CreateExamGoalInput) {
    const [row] = await this.db
      .insert(schema.studentExamGoals)
      .values({
        independentUserId: principal.independentUserId,
        name: input.name,
        examDate: input.examDate,
        syllabusTopics: input.syllabusTopics,
      })
      .returning();
    return row;
  }

  async updateGoal(principal: IndependentStudentPrincipal, id: string, input: UpdateExamGoalInput) {
    const { version, ...patch } = input;
    const [row] = await this.db
      .update(schema.studentExamGoals)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(
        and(
          eq(schema.studentExamGoals.id, id),
          eq(schema.studentExamGoals.independentUserId, principal.independentUserId),
          eq(schema.studentExamGoals.version, version),
        ),
      )
      .returning();
    if (!row) throw new NotFoundException({ code: 'VERSION_CONFLICT', message: 'Goal was updated elsewhere' });
    return row;
  }
}
