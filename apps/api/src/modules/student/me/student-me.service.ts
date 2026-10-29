import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';
import { permissionsList } from '../student.types';
import { evaluatePermissions, STUDENT_DEFAULT_ROLES } from '@edrion/permissions';
import { SurfacesService } from '../surfaces/surfaces.service';

export type StudentMeResponse = {
  kind: 'institutional' | 'independent';
  passwordChangeRequired: boolean;
  fullName: string;
  email: string | null;
  studentId: string | null;
  institutionId: string | null;
  campusId: string | null;
  programmeName: string | null;
  className: string | null;
  sectionName: string | null;
  termName: string | null;
  academicYearName: string | null;
  permissions: string[];
  surfaces: Record<string, boolean>;
};

@Injectable()
export class StudentMeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly surfaces: SurfacesService,
  ) {}

  async getMe(principal: StudentPrincipal): Promise<StudentMeResponse> {
    const evaluated = evaluatePermissions({ roleKeys: ['student'] }, STUDENT_DEFAULT_ROLES);
    const surfaces = await this.surfaces.resolveForPrincipal(principal);

    if (principal.kind === 'independent') {
      return {
        kind: 'independent',
        passwordChangeRequired: false,
        fullName: principal.fullName,
        email: principal.email,
        studentId: null,
        institutionId: null,
        campusId: null,
        programmeName: null,
        className: null,
        sectionName: null,
        termName: null,
        academicYearName: null,
        permissions: permissionsList(evaluated),
        surfaces,
      };
    }

    const [enrolment, classRow, term, year] = await Promise.all([
      this.db
        .select({
          programmeName: schema.departments.name,
          gradeName: schema.gradeLevels.name,
        })
        .from(schema.studentEnrollments)
        .leftJoin(
          schema.departmentGradeLevels,
          eq(schema.studentEnrollments.programmeLevelId, schema.departmentGradeLevels.id),
        )
        .leftJoin(schema.departments, eq(schema.departmentGradeLevels.departmentId, schema.departments.id))
        .leftJoin(schema.gradeLevels, eq(schema.studentEnrollments.gradeLevelId, schema.gradeLevels.id))
        .where(
          and(
            eq(schema.studentEnrollments.studentId, principal.studentId),
            eq(schema.studentEnrollments.status, 'active'),
          ),
        )
        .orderBy(desc(schema.studentEnrollments.enrolledOn))
        .limit(1)
        .then((r) => r[0]),
      this.db
        .select({ name: schema.classes.name, section: schema.classes.section })
        .from(schema.students)
        .leftJoin(schema.classes, eq(schema.students.classId, schema.classes.id))
        .where(eq(schema.students.id, principal.studentId))
        .limit(1)
        .then((r) => r[0]),
      this.db
        .select({ name: schema.academicTerms.name })
        .from(schema.academicTerms)
        .where(
          and(
            eq(schema.academicTerms.institutionId, principal.institutionId),
            eq(schema.academicTerms.isCurrent, true),
          ),
        )
        .limit(1)
        .then((r) => r[0]),
      this.db
        .select({ name: schema.academicYears.name })
        .from(schema.academicYears)
        .where(
          and(
            eq(schema.academicYears.institutionId, principal.institutionId),
            eq(schema.academicYears.isCurrent, true),
          ),
        )
        .limit(1)
        .then((r) => r[0]),
    ]);

    return {
      kind: 'institutional',
      passwordChangeRequired: Boolean(principal.passwordChangeRequired),
      fullName: principal.fullName,
      email: principal.email,
      studentId: principal.studentId,
      institutionId: principal.institutionId,
      campusId: principal.campusId,
      programmeName: enrolment?.programmeName ?? enrolment?.gradeName ?? null,
      className: classRow?.name ?? null,
      sectionName: classRow?.section ?? null,
      termName: term?.name ?? null,
      academicYearName: year?.name ?? null,
      permissions: permissionsList(evaluated),
      surfaces,
    };
  }
}
