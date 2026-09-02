import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, schema, sql, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { resolveCurrentStaffId } from '../current-staff';
import type { PortalActionContext } from '../portal-action-context';

export interface TeachingAssignment {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  teacherId: string | null;
  teacherName: string | null;
  /** True when the signed-in user is the teacher of record for this subject. */
  isMine: boolean;
  /** Class id plus any course teaching this subject — where its content can live. */
  contextIds: string[];
  counts: { materials: number; notes: number; drafts: number; updates: number };
}

/**
 * The teaching workspace is keyed on the assignment — one subject taught to one class — because
 * that is the unit a teacher actually works in. `class_subject_teachers` already records it.
 */
@Injectable()
export class PortalTeachingService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Assignments the signed-in user can publish to.
   *
   * A teacher sees the subjects they are the teacher of record for. Someone with no staff row —
   * an owner or admin signing in to post on a teacher's behalf — sees every assignment, each
   * labelled with the teacher who owns it, so they always know whose subject they are writing in.
   */
  async mine(ctx: PortalActionContext): Promise<{ items: TeachingAssignment[]; scope: 'own' | 'all' }> {
    const institutionId = ctx.principal.institutionId;
    const staffId = await resolveCurrentStaffId(this.db, ctx.principal);

    const cst = schema.classSubjectTeachers;
    const rows = await this.db
      .select({
        classId: cst.classId,
        className: schema.classes.name,
        subjectId: cst.subjectId,
        subjectName: schema.subjects.name,
        subjectCode: schema.subjects.code,
        teacherId: cst.teacherId,
        teacherFirst: schema.staff.firstName,
        teacherLast: schema.staff.lastName,
      })
      .from(cst)
      .innerJoin(schema.classes, eq(schema.classes.id, cst.classId))
      .innerJoin(schema.subjects, eq(schema.subjects.id, cst.subjectId))
      .leftJoin(schema.staff, eq(schema.staff.id, cst.teacherId))
      .where(
        staffId
          ? and(eq(cst.institutionId, institutionId), eq(cst.teacherId, staffId))
          : eq(cst.institutionId, institutionId),
      )
      .orderBy(asc(schema.classes.name), asc(schema.subjects.name));

    // A course teaching the same subject is a second home for that subject's content.
    const courseRows = rows.length
      ? await this.db
          .select({ id: schema.courses.id, subjectId: schema.courses.subjectId })
          .from(schema.courses)
          .where(
            and(
              eq(schema.courses.institutionId, institutionId),
              inArray(schema.courses.subjectId, [...new Set(rows.map((r) => r.subjectId))]),
            ),
          )
      : [];
    const coursesBySubject = new Map<string, string[]>();
    for (const c of courseRows) {
      if (!c.subjectId) continue;
      coursesBySubject.set(c.subjectId, [...(coursesBySubject.get(c.subjectId) ?? []), c.id]);
    }
    const contextsFor = (r: { classId: string; subjectId: string }) => [
      r.classId,
      ...(coursesBySubject.get(r.subjectId) ?? []),
    ];

    const counts = await this.countsFor(
      institutionId,
      rows.map((r) => ({ classId: r.classId, subjectId: r.subjectId, contextIds: contextsFor(r) })),
    );

    return {
      scope: staffId ? 'own' : 'all',
      items: rows.map((r) => ({
        classId: r.classId,
        className: r.className,
        subjectId: r.subjectId,
        subjectName: r.subjectName,
        subjectCode: r.subjectCode,
        teacherId: r.teacherId,
        teacherName: [r.teacherFirst, r.teacherLast].filter(Boolean).join(' ') || null,
        isMine: Boolean(staffId) && r.teacherId === staffId,
        contextIds: contextsFor(r),
        counts: counts.get(`${r.classId}:${r.subjectId}`) ?? {
          materials: 0,
          notes: 0,
          drafts: 0,
          updates: 0,
        },
      })),
    };
  }

  /** Header for one assignment: names, the teacher of record, and how many students will see it. */
  async assignment(ctx: PortalActionContext, classId: string, subjectId: string) {
    const all = await this.mine(ctx);
    const match = all.items.find((a) => a.classId === classId && a.subjectId === subjectId);
    if (!match) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'That subject is not taught to that class, or it is not yours to publish to.',
      });
    }
    const [{ count } = { count: 0 }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.institutionId, ctx.principal.institutionId),
          eq(schema.students.classId, classId),
        ),
      );
    return { ...match, studentCount: count };
  }

  /** One grouped query per content type, rather than a query per card. */
  private async countsFor(
    institutionId: string,
    pairs: Array<{ classId: string; subjectId: string; contextIds: string[] }>,
  ) {
    const out = new Map<string, { materials: number; notes: number; drafts: number; updates: number }>();
    if (!pairs.length) return out;

    const subjectIds = [...new Set(pairs.map((p) => p.subjectId))];
    // Content filed against a course counts toward the class that studies that subject, so map
    // every context back to its assignment before tallying.
    const classForContext = new Map<string, string>();
    for (const p of pairs) {
      for (const ctxId of p.contextIds) classForContext.set(`${ctxId}:${p.subjectId}`, p.classId);
    }
    const bump = (
      contextId: string,
      subjectId: string,
      key: 'materials' | 'notes' | 'drafts' | 'updates',
      n: number,
    ) => {
      const classId = classForContext.get(`${contextId}:${subjectId}`);
      if (!classId) return;
      const k = `${classId}:${subjectId}`;
      const cur = out.get(k) ?? { materials: 0, notes: 0, drafts: 0, updates: 0 };
      cur[key] += n;
      out.set(k, cur);
    };

    const materials = await this.db
      .select({
        contextId: schema.classMaterials.contextId,
        subjectId: schema.classMaterials.subjectId,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.classMaterials)
      .where(
        and(
          eq(schema.classMaterials.institutionId, institutionId),
          inArray(schema.classMaterials.subjectId, subjectIds),
        ),
      )
      .groupBy(schema.classMaterials.contextId, schema.classMaterials.subjectId);
    for (const r of materials) if (r.subjectId) bump(r.contextId, r.subjectId, 'materials', r.n);

    const notes = await this.db
      .select({
        contextId: schema.classNotes.contextId,
        subjectId: schema.classNotes.subjectId,
        status: schema.classNotes.status,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.classNotes)
      .where(
        and(
          eq(schema.classNotes.institutionId, institutionId),
          inArray(schema.classNotes.subjectId, subjectIds),
        ),
      )
      .groupBy(schema.classNotes.contextId, schema.classNotes.subjectId, schema.classNotes.status);
    for (const r of notes) {
      if (!r.subjectId) continue;
      bump(r.contextId, r.subjectId, r.status === 'published' ? 'notes' : 'drafts', r.n);
    }

    const updates = await this.db
      .select({
        contextId: schema.classStreamPosts.contextId,
        subjectId: schema.classStreamPosts.subjectId,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.classStreamPosts)
      .where(
        and(
          eq(schema.classStreamPosts.institutionId, institutionId),
          inArray(schema.classStreamPosts.subjectId, subjectIds),
        ),
      )
      .groupBy(schema.classStreamPosts.contextId, schema.classStreamPosts.subjectId);
    for (const r of updates) if (r.subjectId) bump(r.contextId, r.subjectId, 'updates', r.n);

    return out;
  }
}
