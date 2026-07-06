import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, lte, schema, sql, type Database } from '@edrion/database';
import type { HomeTileDto, StudentHomeDto } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';
import { SurfacesService } from '../surfaces/surfaces.service';

@Injectable()
export class StudentHomeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly surfaces: SurfacesService,
  ) {}

  async getHome(principal: StudentPrincipal): Promise<StudentHomeDto> {
    const portalOn = await this.surfaces.isPortalEnabled(principal);
    if (!portalOn && principal.kind === 'institutional') {
      throw new ForbiddenException({
        code: 'PORTAL_DISABLED',
        message: 'The student portal is not available for your institution.',
      });
    }

    const continueTile = await this.continueLearningTile(principal);
    const tiles: HomeTileDto[] = [continueTile];

    if (principal.kind === 'institutional') {
      const schedule = await this.todaySchedule(principal);
      if (schedule.length > 0) {
        const first = schedule[0]!;
        tiles.push({
          key: 'today',
          eyebrow: 'TODAY',
          title: first.title,
          meta: `${first.time}${first.room ? ` · ${first.room}` : ''}`,
          route: '/calendar',
        });
      }

      const deadline = await this.nearestDeadline(principal);
      if (deadline) tiles.push(deadline);

      const dueDecks = await this.dueDeckCount(principal);
      if (dueDecks > 0) {
        tiles.push({
          key: 'library_due',
          eyebrow: 'LIBRARY',
          title: `${dueDecks} cards due`,
          meta: 'Flashcards ready to review',
          route: '/library',
        });
      }
    } else {
      const weeklyCount = await this.weeklyGoalProgress(principal.independentUserId);
      if (weeklyCount !== null) {
        tiles.push({
          key: 'weekly_goal',
          eyebrow: 'THIS WEEK',
          title: `${weeklyCount} topics`,
          meta: 'Toward your weekly goal',
          route: '/history',
        });
      }
      const dueDecks = await this.dueDeckCount(principal);
      tiles.push({
        key: 'library',
        eyebrow: 'LIBRARY',
        title: dueDecks > 0 ? `${dueDecks} cards due` : 'Your library',
        meta: dueDecks > 0 ? 'Review before they fade' : 'Saved materials and notes',
        route: '/library',
      });
    }

    return {
      tiles,
      learnBanner: {
        title: continueTile.title === 'Continue learning' ? 'What are we doing today?' : continueTile.title,
        subtitle:
          continueTile.meta === 'Pick up where you left off'
            ? 'Open Learn to start a session with Petros.'
            : (continueTile.meta ?? 'Open Learn to start a session with Petros.'),
      },
    };
  }

  private async continueLearningTile(principal: StudentPrincipal): Promise<HomeTileDto> {
    const owner =
      principal.kind === 'institutional'
        ? eq(schema.learnSessions.studentId, principal.studentId)
        : eq(schema.learnSessions.independentUserId, principal.independentUserId);

    const [row] = await this.db
      .select({
        sessionId: schema.learnSessions.id,
        topicTitle: schema.learnTopics.title,
      })
      .from(schema.learnSessions)
      .innerJoin(schema.learnTopics, eq(schema.learnSessions.topicId, schema.learnTopics.id))
      .where(and(owner, eq(schema.learnSessions.status, 'active')))
      .orderBy(desc(schema.learnSessions.startedAt))
      .limit(1);

    if (row) {
      return {
        key: 'continue_learning',
        eyebrow: 'LEARN',
        title: row.topicTitle,
        meta: 'In progress — tap to continue',
        route: `/learn/session/${row.sessionId}`,
      };
    }

    return {
      key: 'continue_learning',
      eyebrow: 'LEARN',
      title: 'Continue learning',
      meta: 'Pick up where you left off',
      route: '/learn',
    };
  }

  private async nearestDeadline(principal: StudentPrincipal): Promise<HomeTileDto | null> {
    if (principal.kind !== 'institutional') return null;

    const [hw] = await this.db
      .select({
        id: schema.homework.id,
        title: schema.homework.title,
        dueAt: schema.homework.dueAt,
      })
      .from(schema.homeworkSubmissions)
      .innerJoin(schema.homework, eq(schema.homeworkSubmissions.homeworkId, schema.homework.id))
      .where(
        and(
          eq(schema.homeworkSubmissions.studentId, principal.studentId),
          sql`${schema.homeworkSubmissions.status} IN ('assigned', 'in_progress')`,
          gt(schema.homework.dueAt, new Date()),
        ),
      )
      .orderBy(asc(schema.homework.dueAt))
      .limit(1);

    if (hw) {
      const due = hw.dueAt.toISOString().slice(0, 10);
      return {
        key: 'deadline',
        eyebrow: 'DUE SOON',
        title: hw.title,
        meta: `Due ${due}`,
        route: `/homework/${hw.id}`,
      };
    }

    const [asg] = await this.db
      .select({
        id: schema.assignments.id,
        title: schema.assignments.title,
        dueDate: schema.assignments.dueDate,
      })
      .from(schema.assignmentSubmissions)
      .innerJoin(schema.assignments, eq(schema.assignmentSubmissions.assignmentId, schema.assignments.id))
      .where(
        and(
          eq(schema.assignmentSubmissions.studentId, principal.studentId),
          sql`${schema.assignmentSubmissions.status} IN ('assigned', 'in_progress', 'late')`,
        ),
      )
      .orderBy(asc(schema.assignments.dueDate))
      .limit(1);

    if (!asg?.dueDate) return null;
    return {
      key: 'deadline',
      eyebrow: 'DUE SOON',
      title: asg.title,
      meta: `Due ${asg.dueDate}`,
      route: `/assignments/${asg.id}`,
    };
  }

  private async dueDeckCount(principal: StudentPrincipal): Promise<number> {
    const owner =
      principal.kind === 'institutional'
        ? eq(schema.flashcardDecks.studentId, principal.studentId)
        : eq(schema.flashcardDecks.independentUserId, principal.independentUserId);

    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.flashcards)
      .innerJoin(schema.flashcardDecks, eq(schema.flashcards.deckId, schema.flashcardDecks.id))
      .where(and(owner, lte(schema.flashcards.nextDueAt, new Date())));

    return row?.count ?? 0;
  }

  async todaySchedule(principal: StudentPrincipal) {
    if (principal.kind !== 'institutional') return [];
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);
    if (!student?.classId) return [];

    const dayOfWeek = jsDayToTimetableDay(new Date());
    const teacherName = sql<string>`concat_ws(' ', ${schema.staff.firstName}, ${schema.staff.lastName})`;
    const rows = await this.db
      .select({
        startTime: schema.timetableSlots.startTime,
        endTime: schema.timetableSlots.endTime,
        subjectName: schema.subjects.name,
        teacherName,
        room: schema.timetableSlots.room,
      })
      .from(schema.timetableSlots)
      .leftJoin(schema.subjects, eq(schema.timetableSlots.subjectId, schema.subjects.id))
      .leftJoin(schema.staff, eq(schema.timetableSlots.teacherId, schema.staff.id))
      .where(
        and(
          eq(schema.timetableSlots.classId, student.classId),
          eq(schema.timetableSlots.dayOfWeek, dayOfWeek),
        ),
      )
      .orderBy(asc(schema.timetableSlots.startTime));

    return rows.map((r) => ({
      time: `${r.startTime}–${r.endTime}`,
      title: [r.subjectName, r.teacherName].filter(Boolean).join(' · ') || 'Class',
      room: r.room ?? undefined,
    }));
  }

  private async weeklyGoalProgress(independentUserId: string): Promise<number | null> {
    const weekStart = startOfWeek(new Date());
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.learningEvents)
      .where(
        and(
          eq(schema.learningEvents.independentUserId, independentUserId),
          eq(schema.learningEvents.eventType, 'session.completed'),
          sql`${schema.learningEvents.occurredAt} >= ${weekStart.toISOString()}`,
        ),
      );
    return row?.count ?? 0;
  }
}

function jsDayToTimetableDay(date: Date): number {
  const js = date.getDay();
  return js === 0 ? 7 : js;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
