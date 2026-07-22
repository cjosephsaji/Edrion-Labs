import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { studentComponentDetailQuerySchema, studentTermResultsQuerySchema } from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentResultsService } from './student-results.service';

@ApiTags('student-results')
@Controller('student/results')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentResultsController {
  constructor(private readonly service: StudentResultsService) {}

  @Get('term')
  @RequireStudentPermissions('student.surface.results.view')
  term(@CurrentStudent() principal: StudentPrincipal, @Query() query: unknown) {
    requireInstitutional(principal);
    const parsed = studentTermResultsQuerySchema.parse(query);
    return this.service.termResults(principal, parsed.term_id);
  }

  @Get('cgpa')
  @RequireStudentPermissions('student.surface.results.view')
  cgpa(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.service.cgpa(principal);
  }

  @Get(':termId/:subjectId/components')
  @RequireStudentPermissions('student.surface.results.view')
  components(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('termId') termId: string,
    @Param('subjectId') subjectId: string,
    @Query() query: unknown,
  ) {
    requireInstitutional(principal);
    const parsed = studentComponentDetailQuerySchema.parse({ ...query as object, term_id: termId, subject_id: subjectId });
    return this.service.componentDetail(principal, subjectId, termId, parsed.cursor, parsed.limit);
  }
}
