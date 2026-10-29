import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import { createHash } from 'node:crypto';
import { can } from '@edrion/permissions';
import {
  CURRICULUM_ALIGNMENT_VERSION, CURRICULUM_RECORD_KINDS, compatibilityCanonicalJson,
  curriculumAlignmentSchema, curriculumAlignmentView, curriculumAlignmentWriteSchema,
  type CurriculumAlignment, type CurriculumAlignmentWrite,
} from '@edrion/schemas';
import type { PortalActionContext } from '../portal-action-context';

type Module = { weekNo: number; title: string; topics: string[] };
type Course = typeof schema.courses.$inferSelect;
const hash = (value: unknown) => createHash('sha256').update(compatibilityCanonicalJson(value)).digest('hex');
// Coverage is teaching activity; it is deliberately absent from curriculum identity.
export const syllabusIdentityHash = (modules: Module[]) => hash(modules.map(({ weekNo, title, topics }) => ({ weekNo, title, topics })).sort((a, b) => a.weekNo - b.weekNo));

export function latestCourseCurriculum(db: Database, institutionId: string, courseId: string) {
  const t = schema.courseCurriculumRevisions;
  return db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.courseId, courseId)))
    .orderBy(desc(t.revision)).limit(1).then((rows) => rows[0]);
}

/** Used by both real syllabus readers, after their current course/owner permission checks. */
export async function readCourseCurriculum(db: Database, course: Course, modules: Module[]) {
  const row = await latestCourseCurriculum(db, course.institutionId, course.id);
  if (!row) return { schemaVersion: CURRICULUM_ALIGNMENT_VERSION, status: 'unmapped' as const, revision: 0, evidence: 'not_assessed' as const };
  const base = { schemaVersion: CURRICULUM_ALIGNMENT_VERSION, revision: row.revision, revisionId: row.id, evidence: 'not_assessed' as const };
  const parsed = curriculumAlignmentSchema.safeParse(row.payload);
  if (row.schemaVersion !== CURRICULUM_ALIGNMENT_VERSION || !parsed.success) return { ...base, status: 'unsupported_version' as const };
  if (row.subjectId !== course.subjectId || row.syllabusHash !== syllabusIdentityHash(modules)) return { ...base, status: 'stale' as const };
  return { ...base, status: 'ready' as const, data: curriculumAlignmentView(parsed.data, Date.now()) };
}

const alignmentBasis = (a: CurriculumAlignment['alignments'][number]) => {
  const { version: _version, status: _status, overrideReason: _override, ...basis } = a;
  return hash(basis);
};

export function requireCurriculumAlignmentTransitionReason(
  prior: CurriculumAlignment['alignments'][number] | undefined,
  next: CurriculumAlignment['alignments'][number],
) {
  if ((next.status === 'rejected' || (prior?.status === 'approved' && next.status !== 'approved')) && !next.overrideReason) {
    throw new BadRequestException({ code: 'CURRICULUM_OVERRIDE_REASON_REQUIRED' });
  }
}

/** Caller holds the course lock and owns the transaction + audit. */
export async function appendCourseCurriculum(db: Database, ctx: PortalActionContext, course: Course,
  modules: Module[], raw: CurriculumAlignmentWrite) {
  const input = curriculumAlignmentWriteSchema.parse(raw);
  if (input.payload.alignments.some((a) => a.status !== 'proposed' || a.overrideReason) && !can(ctx.principal.permissions, 'academics.alignments.approve')) {
    throw new ForbiddenException({ code: 'CURRICULUM_APPROVAL_AUTHORITY' });
  }
  if (modules.length > 52 || new Set(modules.map((m) => m.weekNo)).size !== modules.length) {
    throw new BadRequestException({ code: 'CURRICULUM_MODULE_BOUNDS' });
  }
  if (input.payload.moduleObjectives.some((m) => !modules.some((actual) => actual.weekNo === m.weekNo))) {
    throw new BadRequestException({ code: 'CURRICULUM_MODULE_REFERENCE_MISSING' });
  }
  const institutionId = ctx.principal.institutionId;
  const t = schema.courseCurriculumRevisions;
  const latest = await latestCourseCurriculum(db, institutionId, course.id);
  const [receipt] = await db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.courseId, course.id), eq(t.commandId, input.commandId))).limit(1);
  const syllabusHash = syllabusIdentityHash(modules);
  const requestHash = hash({ input, modules, subjectId: course.subjectId });
  if (receipt) {
    if (receipt.id !== latest?.id || receipt.requestHash !== requestHash) throw new ConflictException({ code: 'CURRICULUM_RETRY_CONFLICT' });
    return { row: receipt, replayed: true };
  }
  if ((latest?.revision ?? 0) !== input.expectedRevision) throw new ConflictException({ code: 'CURRICULUM_REVISION_CONFLICT' });
  const previous = latest ? curriculumAlignmentSchema.safeParse(latest.payload) : null;
  if (latest && (!previous?.success || latest.schemaVersion !== CURRICULUM_ALIGNMENT_VERSION)) {
    throw new ConflictException({ code: 'CURRICULUM_VERSION_UNSUPPORTED', message: 'Restore a compatible reader before changing this curriculum.' });
  }
  if (previous?.success && previous.data.alignments.some((a) => a.status === 'approved' && !input.payload.alignments.some((next) => next.id === a.id))) {
    throw new ConflictException({ code: 'CURRICULUM_REJECTION_REQUIRED', message: 'Reject an approved alignment explicitly before removing it from the current manifest.' });
  }
  for (const a of input.payload.alignments) {
    const prior = previous?.success ? previous.data.alignments.find((p) => p.id === a.id) : undefined;
    const unchangedApproval = prior?.status === 'approved' && hash(prior) === hash(a);
    if ((a.status !== 'proposed' && !unchangedApproval) || a.overrideReason) {
      if (!can(ctx.principal.permissions, 'academics.alignments.approve')) throw new ForbiddenException({ code: 'CURRICULUM_APPROVAL_AUTHORITY' });
    }
    if (a.status === 'approved' && !unchangedApproval &&
      (!prior || prior.status !== 'proposed' || alignmentBasis(prior) !== alignmentBasis(a))) {
      throw new ConflictException({ code: 'CURRICULUM_REVIEW_REQUIRED', message: 'Propose the exact objective and standard versions before approval.' });
    }
    requireCurriculumAlignmentTransitionReason(prior, a);
  }
  // Immutable records protect identities even after a record disappears from a later manifest.
  for (const kind of CURRICULUM_RECORD_KINDS) {
    for (const record of input.payload[kind]) {
      const r = schema.courseCurriculumRecords;
      const [existing] = await db.select().from(r).where(and(eq(r.institutionId, institutionId), eq(r.courseId, course.id),
        eq(r.kind, kind), eq(r.recordId, record.id))).orderBy(desc(r.recordVersion)).limit(1);
      const contentHash = hash(record);
      if (existing?.recordVersion === record.version && existing.contentHash === contentHash) continue;
      if (record.version !== (existing?.recordVersion ?? 0) + 1) throw new ConflictException({ code: 'CURRICULUM_RECORD_VERSION_CONFLICT' });
      await db.insert(r).values({ institutionId, courseId: course.id, kind, recordId: record.id,
        recordVersion: record.version, contentHash, content: record, actorId: ctx.principal.institutionUserId });
    }
  }
  const [row] = await db.insert(t).values({ institutionId, courseId: course.id, revision: input.expectedRevision + 1,
    schemaVersion: CURRICULUM_ALIGNMENT_VERSION, commandId: input.commandId, requestHash, syllabusHash,
    subjectId: course.subjectId, payload: input.payload, actorId: ctx.principal.institutionUserId, reason: input.reason }).returning();
  return { row: row!, replayed: false };
}

/** Course sources require explicit enrollment evidence for this exact class. Matching names are insufficient. */
export async function resolveProposalCourse(db: Database, institutionId: string, classId: string, subjectId: string, sourceCourseId: string | null) {
  if (!sourceCourseId) return null;
  const c = schema.courses, st = schema.students, en = schema.courseEnrollments;
  const [course] = await db.select().from(c).where(and(eq(c.id, sourceCourseId), eq(c.institutionId, institutionId),
    eq(c.subjectId, subjectId), eq(c.status, 'active'))).limit(1);
  if (!course) return null;
  const students = await db.select({ id: st.id }).from(st).where(and(eq(st.institutionId,institutionId),eq(st.classId,classId),eq(st.status,'enrolled')));
  if (!students.length) return null;
  const enrollments = await db.select({ id: en.studentId }).from(en).where(and(eq(en.institutionId,institutionId),eq(en.courseId,sourceCourseId)));
  return students.every(s=>enrollments.some(e=>e.id===s.id)) ? course : null;
}
