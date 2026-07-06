import { Inject, Injectable } from '@nestjs/common';
import { eq, schema, type Database } from '@edrion/database';
import type { CreateCourseInput, UpsertSyllabusInput, UpdateCourseInput } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { PortalCrudEngine, type CrudConfig } from '../portal-crud.engine';
import { PortalResourceService, resourceConfig } from '../portal-resource.service';
import type { PortalActionContext } from '../portal-action-context';

@Injectable()
export class PortalCoursesService extends PortalResourceService {
  constructor(
    crud: PortalCrudEngine,
    @Inject(DATABASE) private readonly db: Database,
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

  async upsertSyllabus(_ctx: PortalActionContext, courseId: string, input: UpsertSyllabusInput) {
    await this.db.delete(schema.courseSyllabusModules).where(eq(schema.courseSyllabusModules.courseId, courseId));
    for (const m of input.modules) {
      await this.db.insert(schema.courseSyllabusModules).values({
        courseId,
        weekNo: m.weekNo,
        title: m.title,
        topics: m.topics,
        covered: m.covered,
        coveredAt: m.covered ? new Date() : null,
      });
    }
    return this.getSyllabus(_ctx, courseId);
  }

  getSyllabus(_ctx: PortalActionContext, courseId: string) {
    return this.db
      .select()
      .from(schema.courseSyllabusModules)
      .where(eq(schema.courseSyllabusModules.courseId, courseId))
      .orderBy(schema.courseSyllabusModules.weekNo);
  }

  async enroll(_ctx: PortalActionContext, courseId: string, studentIds: string[]) {
    for (const studentId of studentIds) {
      await this.db.insert(schema.courseEnrollments).values({ courseId, studentId }).onConflictDoNothing();
    }
    return { enrolled: studentIds.length };
  }
}
