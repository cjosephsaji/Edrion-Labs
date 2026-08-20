import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, or, schema, type Database } from '@edrion/database';
import type { StudentSurfaceKey } from '@edrion/shared-types';
import {
  resolvePetrosRoute,
  type PetrosEntityType,
  type PetrosPageCandidate,
  type PetrosSurface,
} from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { SurfaceGateService } from '../surfaces/surface-gate.service';
import type { InstitutionalStudentPrincipal } from '../student.types';

/**
 * A candidate the API itself resolved. `title`/`summary` here come from the database,
 * never from the browser. Client-supplied text is a navigation hint only.
 */
export type ResolvedCandidate = {
  ref: string;
  entityType: PetrosEntityType;
  entityId: string | null;
  title: string;
  summary: string;
  href: string | null;
  /** Facts the model may quote. Values are already permission- and surface-filtered. */
  facts: Record<string, string | number | null>;
};

export type ResolvedPageContext = {
  route: string;
  surface: PetrosSurface;
  label: string;
  /** IANA zone of the student's institution; previews and dates render in it. */
  timeZone: string;
  /** Resolved once per turn and carried, so the prompt does not re-query it. */
  clock: { timeZone: string; localNow: string; isoNow: string };
  support: 'supported' | 'unavailable' | 'hidden';
  reason?: string;
  candidates: ResolvedCandidate[];
  focus: ResolvedCandidate | null;
  /** Refs the client sent that the API could not verify. Never shown to the model as fact. */
  unresolvedRefs: string[];
};

/** Entity type -> the permission and surface that must both allow it. */
/** Homework rows a student may see at all, matching the homework repository. */
const VISIBLE_HOMEWORK_STATUSES = ['assigned', 'closed'];

const ENTITY_GATES: Record<
  PetrosEntityType,
  { permission?: string; surface?: StudentSurfaceKey }
> = {
  assignment: { permission: 'student.assignments.view' },
  homework: { permission: 'student.homework.view' },
  exam_schedule: { permission: 'student.exams.view', surface: 'exams' },
  result: { permission: 'student.surface.results.view', surface: 'results' },
  report_card: { permission: 'student.report_cards.view' },
  material: { permission: 'student.classes.view' },
  document: { permission: 'student.surface.documents.view', surface: 'documents' },
  announcement: {},
  notification: {},
  timetable_slot: { permission: 'student.classes.view' },
  calendar_event: { permission: 'student.calendar.view' },
  course: { permission: 'student.courses.view' },
  class: { permission: 'student.classes.view' },
  learning_path_step: { permission: 'student.learn.use' },
  reflection_recommendation: { permission: 'student.learn.use' },
  artifact: { permission: 'student.learn.use' },
  petros_session: { permission: 'student.learn.use' },
  attendance_summary: { permission: 'student.attendance.view', surface: 'attendance' },
  planner_item: { permission: 'student.learn.use' },
  screen: {},
};

@Injectable()
export class PetrosStudentContextService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly surfaceGate: SurfaceGateService,
  ) {}

  private has(principal: InstitutionalStudentPrincipal, permission?: string) {
    if (!permission) return true;
    return principal.permissions.includes(permission) || principal.permissions.includes('*');
  }

  private async allows(principal: InstitutionalStudentPrincipal, entityType: PetrosEntityType) {
    const gate = ENTITY_GATES[entityType];
    if (!this.has(principal, gate.permission)) return false;
    if (gate.surface && !(await this.surfaceGate.isSurfaceEnabled(principal, gate.surface))) {
      return false;
    }
    return true;
  }

  /**
   * Resolves the client's navigation hint into authoritative records.
   *
   * Rules enforced here, not in the prompt:
   * - a candidate the student does not own is dropped, not denied loudly;
   * - a candidate behind a disabled surface or missing permission is dropped;
   * - focus is whatever the student explicitly selected, never array position;
   * - an unsupported route resolves to zero candidates and a stated reason.
   */
  async resolve(
    principal: InstitutionalStudentPrincipal,
    input: {
      route: string;
      surface: PetrosSurface;
      candidates: PetrosPageCandidate[];
      focusRef?: string;
    },
  ): Promise<ResolvedPageContext> {
    const rule = resolvePetrosRoute(input.route);
    const clock = await this.clock(principal);
    const timeZone = clock.timeZone;
    const base = {
      route: rule.route,
      surface: rule.surface,
      label: rule.label,
      timeZone,
      clock,
      support: rule.support,
      ...(rule.reason ? { reason: rule.reason } : {}),
    };

    if (rule.support !== 'supported') {
      return { ...base, candidates: [], focus: null, unresolvedRefs: [] };
    }

    const byType = new Map<PetrosEntityType, PetrosPageCandidate[]>();
    for (const candidate of input.candidates.slice(0, 40)) {
      if (!candidate.entityId) continue;
      const list = byType.get(candidate.entityType) ?? [];
      list.push(candidate);
      byType.set(candidate.entityType, list);
    }

    const resolved: ResolvedCandidate[] = [];
    for (const [entityType, group] of byType) {
      if (!(await this.allows(principal, entityType))) continue;
      const ids = [...new Set(group.map((candidate) => candidate.entityId as string))];
      const rows = await this.lookup(principal, entityType, ids, timeZone);
      for (const candidate of group) {
        const row = rows.get(candidate.entityId as string);
        if (!row) continue;
        resolved.push({
          ref: candidate.ref,
          entityType,
          entityId: candidate.entityId as string,
          title: row.title,
          // The database record wins over the client hint on every field a model can quote.
          summary: row.summary,
          href: row.href ?? candidate.href ?? null,
          facts: row.facts,
        });
      }
    }

    const resolvedRefs = new Set(resolved.map((candidate) => candidate.ref));
    const unresolvedRefs = input.candidates
      .map((candidate) => candidate.ref)
      .filter((ref) => !resolvedRefs.has(ref));

    const focus = input.focusRef
      ? (resolved.find((candidate) => candidate.ref === input.focusRef) ?? null)
      : null;

    return { ...base, candidates: resolved, focus, unresolvedRefs };
  }

  /** Owner-scoped lookup per entity type. Every query filters by student and institution. */
  private async lookup(
    principal: InstitutionalStudentPrincipal,
    entityType: PetrosEntityType,
    ids: string[],
    timeZone: string,
  ): Promise<Map<string, LookupRow>> {
    const out = new Map<string, LookupRow>();
    if (!ids.length) return out;
    const institutionId = principal.institutionId;
    const studentId = principal.studentId;

    switch (entityType) {
      case 'assignment': {
        // Same visibility rule as GET /student/assignments: published, and reachable by
        // class, course enrolment or an explicit assignee row. Using assignees alone would
        // hide most of the student's own work.
        const visibility = await this.assignmentVisibility(principal);
        if (!visibility) return out;
        const rows = await this.db
          .select({
            id: schema.assignments.id,
            title: schema.assignments.title,
            subject: schema.subjects.name,
            dueDate: schema.assignments.dueDate,
            aiPolicy: schema.assignments.aiPolicy,
            maxPoints: schema.assignments.maxPoints,
            status: schema.assignmentSubmissions.status,
            pointsAwarded: schema.assignmentSubmissions.pointsAwarded,
            feedback: schema.assignmentSubmissions.feedback,
          })
          .from(schema.assignments)
          .leftJoin(schema.subjects, eq(schema.subjects.id, schema.assignments.subjectId))
          .leftJoin(
            schema.assignmentSubmissions,
            and(
              eq(schema.assignmentSubmissions.assignmentId, schema.assignments.id),
              eq(schema.assignmentSubmissions.studentId, studentId),
            ),
          )
          .where(
            and(
              eq(schema.assignments.institutionId, institutionId),
              eq(schema.assignments.status, 'published'),
              inArray(schema.assignments.id, ids),
              visibility,
            ),
          );
        for (const row of rows) {
          out.set(row.id, {
            title: row.title,
            summary: [row.subject, row.dueDate ? `due ${humanDate(row.dueDate, timeZone)}` : null, row.status ?? 'assigned']
              .filter(Boolean)
              .join(' \u00b7 '),
            href: `/assignments/${row.id}`,
            facts: {
              subject: row.subject ?? null,
              dueDate: humanDate(row.dueDate, timeZone),
              submissionStatus: row.status ?? 'assigned',
              pointsAwarded: row.pointsAwarded ?? null,
              maxPoints: row.maxPoints ?? null,
              aiPolicy: row.aiPolicy ?? null,
              teacherFeedback: row.feedback ?? null,
            },
          });
        }
        return out;
      }

      case 'homework': {
        // Same rule as GET /student/homework: one submission row per student, and only
        // homework whose own status is visible to students.
        const rows = await this.db
          .select({
            id: schema.homework.id,
            title: schema.homework.title,
            subject: schema.subjects.name,
            dueAt: schema.homework.dueAt,
            aiPolicy: schema.homework.aiPolicy,
            status: schema.homeworkSubmissions.status,
            marks: schema.homeworkSubmissions.totalMarks,
            maxMarks: schema.homeworkSubmissions.totalMax,
            teacherNote: schema.homeworkSubmissions.teacherNote,
          })
          .from(schema.homeworkSubmissions)
          .innerJoin(schema.homework, eq(schema.homework.id, schema.homeworkSubmissions.homeworkId))
          .leftJoin(schema.subjects, eq(schema.subjects.id, schema.homework.subjectId))
          .where(
            and(
              eq(schema.homeworkSubmissions.studentId, studentId),
              eq(schema.homework.institutionId, institutionId),
              inArray(schema.homework.status, VISIBLE_HOMEWORK_STATUSES),
              inArray(schema.homework.id, ids),
            ),
          );
        for (const row of rows) {
          out.set(row.id, {
            title: row.title,
            summary: [row.subject, row.dueAt ? `due ${humanDate(row.dueAt, timeZone)}` : null, row.status ?? 'assigned']
              .filter(Boolean)
              .join(' \u00b7 '),
            href: `/homework/${row.id}`,
            facts: {
              subject: row.subject ?? null,
              dueAt: humanDate(row.dueAt, timeZone),
              submissionStatus: row.status ?? 'assigned',
              marks: row.marks ?? null,
              maxMarks: row.maxMarks ?? null,
              aiPolicy: row.aiPolicy ?? null,
              teacherNote: row.teacherNote ?? null,
            },
          });
        }
        return out;
      }

      case 'exam_schedule': {
        const classId = await this.classId(principal);
        if (!classId) return out;
        const rows = await this.db
          .select({
            id: schema.examSchedules.id,
            examName: schema.exams.name,
            subject: schema.subjects.name,
            examDate: schema.examSchedules.examDate,
            startTime: schema.examSchedules.startTime,
            syllabus: schema.examSchedules.syllabusNote,
          })
          .from(schema.examSchedules)
          .innerJoin(schema.exams, eq(schema.exams.id, schema.examSchedules.examId))
          .leftJoin(schema.subjects, eq(schema.subjects.id, schema.examSchedules.subjectId))
          .where(
            and(
              eq(schema.examSchedules.institutionId, institutionId),
              eq(schema.examSchedules.classId, classId),
              eq(schema.examSchedules.published, true),
              inArray(schema.examSchedules.id, ids),
            ),
          );
        for (const row of rows) {
          out.set(row.id, {
            title: `${row.subject ?? 'Exam'} \u2014 ${row.examName}`,
            summary: [row.examDate, row.startTime].filter(Boolean).join(' '),
            href: '/exams',
            facts: {
              subject: row.subject ?? null,
              examDate: humanDate(row.examDate, timeZone),
              startTime: row.startTime ?? null,
              publishedSyllabus: row.syllabus ?? null,
            },
          });
        }
        return out;
      }

      case 'result': {
        const rows = await this.db
          .select({
            id: schema.gradeEntries.id,
            assessment: schema.gradeEntries.assessmentName,
            subject: schema.subjects.name,
            marks: schema.gradeEntries.marksObtained,
            maxMarks: schema.gradeEntries.maxMarks,
            grade: schema.gradeEntries.letterGrade,
            remarks: schema.gradeEntries.remarks,
          })
          .from(schema.gradeEntries)
          .leftJoin(schema.subjects, eq(schema.subjects.id, schema.gradeEntries.subjectId))
          .where(
            and(
              eq(schema.gradeEntries.studentId, studentId),
              eq(schema.gradeEntries.institutionId, institutionId),
              eq(schema.gradeEntries.published, true),
              inArray(schema.gradeEntries.id, ids),
            ),
          );
        for (const row of rows) {
          out.set(row.id, {
            title: `${row.subject ?? 'Subject'} \u2014 ${row.assessment}`,
            summary: `${row.marks ?? '\u2014'} / ${row.maxMarks ?? '\u2014'}`,
            href: '/results',
            facts: {
              subject: row.subject ?? null,
              assessment: row.assessment,
              marksObtained: row.marks ?? null,
              maxMarks: row.maxMarks ?? null,
              grade: row.grade ?? null,
              teacherRemarks: row.remarks ?? null,
            },
          });
        }
        return out;
      }

      case 'material': {
        const contexts = await this.materialContexts(principal);
        if (!contexts.length) return out;
        const rows = await this.db
          .select({
            id: schema.classMaterials.id,
            title: schema.classMaterials.title,
            description: schema.classMaterials.description,
            kindLabel: schema.classMaterials.kindLabel,
            weekNo: schema.classMaterials.weekNo,
            contextType: schema.classMaterials.contextType,
            contextId: schema.classMaterials.contextId,
          })
          .from(schema.classMaterials)
          .where(
            and(
              eq(schema.classMaterials.institutionId, institutionId),
              inArray(schema.classMaterials.id, ids),
            ),
          );
        const allowed = new Set(contexts.map((ctx) => `${ctx.type}:${ctx.id}`));
        for (const row of rows) {
          if (!allowed.has(`${row.contextType}:${row.contextId}`)) continue;
          out.set(row.id, {
            title: row.title,
            summary: [row.kindLabel, row.weekNo ? `week ${row.weekNo}` : null]
              .filter(Boolean)
              .join(' \u00b7 '),
            href: '/materials',
            facts: {
              kind: row.kindLabel,
              weekNo: row.weekNo ?? null,
              description: row.description ?? null,
            },
          });
        }
        return out;
      }

      case 'announcement': {
        const rows = await this.db
          .select({
            id: schema.announcements.id,
            title: schema.announcements.title,
            body: schema.announcements.body,
            category: schema.announcements.category,
            publishedAt: schema.announcements.publishedAt,
          })
          .from(schema.announcements)
          .where(
            and(
              eq(schema.announcements.institutionId, institutionId),
              eq(schema.announcements.status, 'published'),
              inArray(schema.announcements.id, ids),
            ),
          );
        for (const row of rows) {
          out.set(row.id, {
            title: row.title,
            summary: (row.body ?? '').slice(0, 300),
            href: '/announcements',
            facts: {
              category: row.category ?? null,
              publishedAt: humanDate(row.publishedAt, timeZone),
            },
          });
        }
        return out;
      }

      case 'petros_session': {
        const rows = await this.db
          .select({
            id: schema.petrosLearningSessions.id,
            topic: schema.petrosLearningSessions.topic,
            status: schema.petrosLearningSessions.status,
            sessionType: schema.petrosLearningSessions.sessionType,
            updatedAt: schema.petrosLearningSessions.updatedAt,
          })
          .from(schema.petrosLearningSessions)
          .where(
            and(
              eq(schema.petrosLearningSessions.studentId, studentId),
              eq(schema.petrosLearningSessions.institutionId, institutionId),
              inArray(schema.petrosLearningSessions.id, ids),
            ),
          );
        for (const row of rows) {
          out.set(row.id, {
            title: row.topic,
            summary: `${row.sessionType} session \u00b7 ${row.status}`,
            href: `/petros/session?session=${row.id}`,
            facts: {
              status: row.status,
              sessionType: row.sessionType,
              lastActivity: humanDate(row.updatedAt, timeZone),
            },
          });
        }
        return out;
      }

      case 'learning_path_step': {
        const rows = await this.db
          .select({
            id: schema.learningPathItems.id,
            title: schema.learnTopics.title,
            subjectLabel: schema.learnTopics.subjectLabel,
            sequence: schema.learningPathItems.sequence,
            status: schema.learningPathItems.status,
            whyHere: schema.learningPathItems.whyHere,
          })
          .from(schema.learningPathItems)
          .innerJoin(schema.learningPaths, eq(schema.learningPaths.id, schema.learningPathItems.pathId))
          .innerJoin(schema.learnTopics, eq(schema.learnTopics.id, schema.learningPathItems.topicId))
          .where(
            and(
              eq(schema.learningPaths.studentId, studentId),
              inArray(schema.learningPathItems.id, ids),
            ),
          );
        for (const row of rows) {
          out.set(row.id, {
            title: row.title,
            summary: [`step ${row.sequence}`, row.status, row.subjectLabel].filter(Boolean).join(' \u00b7 '),
            href: '/learning-path',
            facts: {
              subject: row.subjectLabel,
              step: row.sequence,
              status: row.status,
              whyItIsHere: row.whyHere ?? null,
            },
          });
        }
        return out;
      }

      case 'artifact': {
        const rows = await this.db
          .select({
            id: schema.petrosSavedArtifacts.id,
            content: schema.petrosSavedArtifacts.content,
            kind: schema.petrosSavedArtifacts.kind,
            dueAt: schema.petrosSavedArtifacts.dueAt,
          })
          .from(schema.petrosSavedArtifacts)
          .where(
            and(
              eq(schema.petrosSavedArtifacts.studentId, studentId),
              eq(schema.petrosSavedArtifacts.institutionId, institutionId),
              inArray(schema.petrosSavedArtifacts.id, ids),
            ),
          );
        for (const row of rows) {
          out.set(row.id, {
            title: row.content.title,
            summary: [row.kind, row.dueAt ? `review due ${humanDate(row.dueAt, timeZone)}` : null]
              .filter(Boolean)
              .join(' \u00b7 '),
            href: `/petros/artifacts?artifact=${row.id}`,
            facts: {
              kind: row.kind,
              reviewDue: humanDate(row.dueAt, timeZone),
            },
          });
        }
        return out;
      }

      case 'document': {
        const rows = await this.db
          .select({
            id: schema.studentDocuments.id,
            title: schema.studentDocuments.title,
            type: schema.studentDocuments.type,
            issuedAt: schema.studentDocuments.issuedAt,
          })
          .from(schema.studentDocuments)
          .where(
            and(
              eq(schema.studentDocuments.studentId, studentId),
              eq(schema.studentDocuments.institutionId, institutionId),
              eq(schema.studentDocuments.published, true),
              inArray(schema.studentDocuments.id, ids),
            ),
          );
        for (const row of rows) {
          out.set(row.id, {
            title: row.title,
            summary: humanize(row.type),
            href: '/documents',
            facts: { type: humanize(row.type), issued: humanDate(row.issuedAt, timeZone) },
          });
        }
        return out;
      }

      case 'report_card': {
        const rows = await this.db
          .select({
            id: schema.reportCards.id,
            termLabel: schema.reportCards.termLabel,
            gpa: schema.reportCards.gpa,
            publishedAt: schema.reportCards.publishedAt,
          })
          .from(schema.reportCards)
          .where(
            and(
              eq(schema.reportCards.studentId, studentId),
              eq(schema.reportCards.institutionId, institutionId),
              eq(schema.reportCards.status, 'published'),
              inArray(schema.reportCards.id, ids),
            ),
          );
        for (const row of rows) {
          out.set(row.id, {
            title: row.termLabel,
            summary: [row.gpa ? `GPA ${row.gpa}` : null, humanDate(row.publishedAt, timeZone)]
              .filter(Boolean)
              .join(' \u00b7 '),
            href: `/report-cards/${row.id}`,
            facts: { gpa: row.gpa ?? null, published: humanDate(row.publishedAt, timeZone) },
          });
        }
        return out;
      }

      case 'course': {
        const rows = await this.db
          .select({
            id: schema.courses.id,
            name: schema.courses.name,
            code: schema.courses.code,
          })
          .from(schema.courseEnrollments)
          .innerJoin(schema.courses, eq(schema.courses.id, schema.courseEnrollments.courseId))
          .where(
            and(
              eq(schema.courseEnrollments.studentId, studentId),
              eq(schema.courseEnrollments.institutionId, institutionId),
              inArray(schema.courses.id, ids),
            ),
          );
        for (const row of rows) {
          out.set(row.id, {
            title: row.name,
            summary: row.code,
            href: `/courses/${row.id}`,
            facts: { code: row.code },
          });
        }
        return out;
      }

      case 'timetable_slot': {
        const classId = await this.classId(principal);
        if (!classId) return out;
        // The portal addresses a slot as "<slotId>:<date>" because one slot repeats weekly.
        const bySlot = new Map<string, string[]>();
        for (const id of ids) {
          const slotId = id.split(':')[0]!;
          bySlot.set(slotId, [...(bySlot.get(slotId) ?? []), id]);
        }
        const rows = await this.db
          .select({
            id: schema.timetableSlots.id,
            subject: schema.subjects.name,
            startTime: schema.timetableSlots.startTime,
            endTime: schema.timetableSlots.endTime,
            room: schema.timetableSlots.room,
            label: schema.timetableSlots.label,
          })
          .from(schema.timetableSlots)
          .leftJoin(schema.subjects, eq(schema.subjects.id, schema.timetableSlots.subjectId))
          .where(
            and(
              eq(schema.timetableSlots.institutionId, institutionId),
              eq(schema.timetableSlots.classId, classId),
              inArray(schema.timetableSlots.id, [...bySlot.keys()]),
            ),
          );
        for (const row of rows) {
          for (const original of bySlot.get(row.id) ?? []) {
            const date = original.split(':')[1] ?? null;
            out.set(original, {
              title: row.subject ?? row.label ?? 'Class',
              summary: [date, `${row.startTime}\u2013${row.endTime}`, row.room]
                .filter(Boolean)
                .join(' \u00b7 '),
              href: '/timetable',
              facts: {
                subject: row.subject ?? null,
                date,
                startTime: row.startTime,
                endTime: row.endTime,
                room: row.room ?? null,
              },
            });
          }
        }
        return out;
      }

      case 'attendance_summary': {
        const rows = await this.db
          .select({
            subjectId: schema.attendanceRollups.subjectId,
            subject: schema.subjects.name,
            attended: schema.attendanceRollups.attended,
            conducted: schema.attendanceRollups.conducted,
            pct: schema.attendanceRollups.pct,
            zone: schema.attendanceRollups.zone,
          })
          .from(schema.attendanceRollups)
          .leftJoin(schema.subjects, eq(schema.subjects.id, schema.attendanceRollups.subjectId))
          .where(
            and(
              eq(schema.attendanceRollups.studentId, studentId),
              eq(schema.attendanceRollups.institutionId, institutionId),
            ),
          );
        for (const row of rows) {
          if (!row.subjectId || !ids.includes(row.subjectId)) continue;
          // Older rows stored a percentage where the writer stores a fraction.
          const raw = row.pct == null ? null : Number(row.pct);
          const pct = raw == null || !Number.isFinite(raw) ? null : Math.round((raw > 1 ? raw : raw * 100) * 10) / 10;
          out.set(row.subjectId, {
            title: row.subject ?? 'Attendance',
            summary: `${row.attended}/${row.conducted}${pct == null ? '' : ` \u00b7 ${pct}%`}`,
            href: '/attendance',
            facts: {
              subject: row.subject ?? null,
              attended: row.attended,
              conducted: row.conducted,
              percentage: pct,
              standing: row.zone,
            },
          });
        }
        return out;
      }

      // Entity types that are not individually addressable yet resolve to nothing, which is the
      // honest outcome: Petros states he cannot confirm that item rather than inventing it.
      default:
        return out;
    }
  }

  /**
   * The institution's wall clock. Without this the model has no idea what "tomorrow"
   * means and will invent a date from its training data.
   */
  async clock(principal: InstitutionalStudentPrincipal, now = new Date()) {
    const [row] = await this.db
      .select({ timezone: schema.institutions.timezone })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, principal.institutionId))
      .limit(1);
    const timeZone = row?.timezone || 'UTC';
    let localNow: string;
    try {
      localNow = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'long',
        hour12: false,
      }).format(now);
    } catch {
      localNow = now.toISOString();
    }
    return { timeZone, localNow, isoNow: now.toISOString() };
  }

  /** Class OR course enrolment OR explicit assignee, mirroring the assignments module. */
  async assignmentVisibility(principal: InstitutionalStudentPrincipal) {
    const [classId, courses, assignees] = await Promise.all([
      this.classId(principal),
      this.db
        .select({ courseId: schema.courseEnrollments.courseId })
        .from(schema.courseEnrollments)
        .where(
          and(
            eq(schema.courseEnrollments.studentId, principal.studentId),
            eq(schema.courseEnrollments.institutionId, principal.institutionId),
          ),
        ),
      this.db
        .select({ assignmentId: schema.assignmentAssignees.assignmentId })
        .from(schema.assignmentAssignees)
        .where(eq(schema.assignmentAssignees.studentId, principal.studentId)),
    ]);
    const parts = [
      classId ? eq(schema.assignments.classId, classId) : undefined,
      courses.length
        ? inArray(schema.assignments.courseId, courses.map((row) => row.courseId))
        : undefined,
      assignees.length
        ? inArray(schema.assignments.id, assignees.map((row) => row.assignmentId))
        : undefined,
    ].filter((part): part is NonNullable<typeof part> => Boolean(part));
    if (!parts.length) return null;
    return parts.length === 1 ? parts[0]! : or(...parts);
  }

  private classId(principal: InstitutionalStudentPrincipal) {
    return this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.id, principal.studentId),
          eq(schema.students.institutionId, principal.institutionId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]?.classId ?? null);
  }

  /** Material visibility follows class membership plus course enrolment, same as /materials. */
  private async materialContexts(principal: InstitutionalStudentPrincipal) {
    const [classId, courses] = await Promise.all([
      this.classId(principal),
      this.db
        .select({ courseId: schema.courseEnrollments.courseId })
        .from(schema.courseEnrollments)
        .where(
          and(
            eq(schema.courseEnrollments.studentId, principal.studentId),
            eq(schema.courseEnrollments.institutionId, principal.institutionId),
          ),
        ),
    ]);
    const contexts: Array<{ type: string; id: string }> = [];
    if (classId) contexts.push({ type: 'class', id: classId });
    for (const course of courses) contexts.push({ type: 'course', id: course.courseId });
    return contexts;
  }
}

type LookupRow = {
  title: string;
  summary: string;
  href: string | null;
  facts: ResolvedCandidate['facts'];
};

/**
 * Dates reach the model already written the way the student reads them. Handing over a raw
 * ISO string makes Petros quote "2026-07-31" back at them mid-sentence.
 */
/** Turns a stored enum-ish value into something a student reads. */
function humanize(value: string | null | undefined) {
  if (!value) return '';
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function humanDate(value: Date | string | null | undefined, timeZone: string) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
