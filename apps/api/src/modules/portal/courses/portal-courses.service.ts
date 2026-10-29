import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, runInInstitutionTenant, schema, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import { can } from '@edrion/permissions';
import type { CreateCourseInput, UpsertSyllabusInput, UpdateCourseInput } from '@edrion/schemas';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../../common/tokens';
import { PortalCrudEngine, type CrudConfig } from '../portal-crud.engine';
import { PortalResourceService, resourceConfig } from '../portal-resource.service';
import { basePortalAudit, type PortalActionContext } from '../portal-action-context';
import { resolveCurrentStaffId } from '../current-staff';
import { appendCourseCurriculum, readCourseCurriculum, syllabusIdentityHash } from './course-curriculum.repository';

@Injectable()
export class PortalCoursesService extends PortalResourceService {
  constructor(
    crud: PortalCrudEngine,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {
    super(crud);
  }

  protected readonly configs: Record<string, CrudConfig> = {
    courses: resourceConfig(schema.courses, {
      module: 'portal-courses',
      entityType: 'course',
      actionPrefix: 'course',
      search: [schema.courses.code, schema.courses.name],
      sortable: { code: schema.courses.code, name: schema.courses.name, createdAt: schema.courses.createdAt },
      snapshot: (r) => ({ code: r.code, name: r.name }),
    }),
  };

  createCourse(ctx: PortalActionContext, input: CreateCourseInput) {
    return this.create('courses', ctx, {
      institutionId: ctx.principal.institutionId,
      code: input.code,
      name: input.name,
      credits: input.credits ?? null,
      professorTeacherId: input.professorTeacherId ?? null,
      termId: input.termId ?? null,
      officeHours: input.officeHours ?? null,
      gradingScheme: input.gradingScheme,
      attendanceRequiredPct: input.attendanceRequiredPct,
    });
  }

  async updateCourse(ctx: PortalActionContext, id: string, input: UpdateCourseInput) {
    const { version, ...patch } = input;
    return this.update('courses', ctx, id, { ...patch, version });
  }

  async upsertSyllabus(ctx: PortalActionContext, courseId: string, input: UpsertSyllabusInput, negotiated = false, reviewAuthorized = false) {
    if (!can(ctx.principal.permissions, 'syllabus.manage')) throw new ForbiddenException({ code: 'FORBIDDEN' });
    if (input.curriculum && !this.env.PETROS_CURRICULUM_ALIGNMENT_ENABLED) throw new ConflictException({ code: 'CURRICULUM_ALIGNMENT_DISABLED' });
    if (input.curriculum?.payload.alignments.some((a) => a.status !== 'proposed' || a.overrideReason) && !reviewAuthorized) {
      throw new ForbiddenException({ code: 'CURRICULUM_REVIEW_ROUTE_REQUIRED', message: 'Use the permissioned syllabus review command for alignment decisions.' });
    }
    return runInInstitutionTenant(this.db, ctx.principal.institutionId, async () => {
      const course = await this.requireSyllabusCourse(ctx, courseId);
      const previousModules = await this.modules(courseId);
      const result = input.curriculum ? await appendCourseCurriculum(this.db, ctx, course, input.modules, input.curriculum) : null;
      if (result?.replayed) {
        if (syllabusIdentityHash(previousModules) !== result.row.syllabusHash) throw new ConflictException({ code: 'CURRICULUM_RETRY_STALE' });
        return this.getSyllabus(ctx, courseId, negotiated);
      }
      await this.db.delete(schema.courseSyllabusModules).where(eq(schema.courseSyllabusModules.courseId, courseId));
      for (const m of input.modules) {
        await this.db.insert(schema.courseSyllabusModules).values({ courseId, weekNo: m.weekNo, title: m.title,
          topics: m.topics, covered: m.covered, coveredAt: m.covered ? new Date() : null });
      }
      await this.audit.logAudit({ ...basePortalAudit(ctx), action: result ? 'standard.alignment_changed' : 'course.syllabus.update',
        module: 'portal-courses', entityType: 'course', entityId: courseId, reason: input.curriculum?.reason,
        newState: { modules: input.modules.length, curriculumRevision: result?.row.revision ?? null },
      } as AuditEventInput);
      return this.getSyllabus(ctx, courseId, negotiated);
    }, ctx.principal.institutionUserId);
  }

  async getSyllabus(ctx: PortalActionContext, courseId: string, negotiated = false) {
    const course = await this.requireSyllabusCourse(ctx, courseId);
    const modules = await this.modules(courseId);
    // Legacy clients receive the original array; new readers never infer objectives from topic text.
    if (!negotiated) return modules;
    const t = schema.courseCurriculumRevisions;
    const history = await this.db.select({ revision: t.revision, reason: t.reason, recordedAt: t.createdAt })
      .from(t).where(and(eq(t.institutionId, ctx.principal.institutionId), eq(t.courseId, courseId)))
      .orderBy(desc(t.revision)).limit(25);
    return { modules, curriculum: await readCourseCurriculum(this.db, course, modules), history };
  }

  private modules(courseId: string) {
    return this.db
      .select()
      .from(schema.courseSyllabusModules)
      .where(eq(schema.courseSyllabusModules.courseId, courseId))
      .orderBy(schema.courseSyllabusModules.weekNo);
  }

  private async requireSyllabusCourse(ctx: PortalActionContext, courseId: string) {
    await this.get('courses', ctx, courseId); // Existing institution/campus scope owner.
    const [course] = await this.db.select().from(schema.courses).where(and(eq(schema.courses.id, courseId),
      eq(schema.courses.institutionId, ctx.principal.institutionId))).for('no key update');
    if (!course || course.status !== 'active') throw new NotFoundException({ code: 'NOT_FOUND' });
    // Explicit course management authority or the assigned instructor; a syllabus key alone is not global access.
    if (!can(ctx.principal.permissions, 'courses.manage')) {
      const staffId = await resolveCurrentStaffId(this.db, ctx.principal);
      if (!staffId || course.professorTeacherId !== staffId) throw new ForbiddenException({ code: 'COURSE_SCOPE_REQUIRED' });
      const [staff] = await this.db.select({ id: schema.staff.id }).from(schema.staff).where(and(
        eq(schema.staff.id, staffId), eq(schema.staff.institutionId, ctx.principal.institutionId), eq(schema.staff.status, 'active'))).for('share');
      if (!staff) throw new ForbiddenException({ code: 'COURSE_SCOPE_REQUIRED' });
    }
    return course;
  }

  async enroll(ctx: PortalActionContext, courseId: string, studentIds: string[]) {
    for (const studentId of studentIds) {
      await this.db
        .insert(schema.courseEnrollments)
        .values({ institutionId: ctx.principal.institutionId, courseId, studentId })
        .onConflictDoNothing();
    }
    return { enrolled: studentIds.length };
  }
}
