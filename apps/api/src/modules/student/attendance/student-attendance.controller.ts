import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  attendanceCoverageQuerySchema,
  attendanceSubjectQuerySchema,
  attendanceSummaryQuerySchema,
} from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentAttendanceService } from './student-attendance.service';

@ApiTags('student-attendance')
@Controller('student/attendance')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentAttendanceController {
  constructor(private readonly service: StudentAttendanceService) {}

  @Get('summary')
  @RequireStudentPermissions('student.attendance.view')
  summary(@CurrentStudent() principal: StudentPrincipal, @Query() query: unknown) {
    requireInstitutional(principal);
    const parsed = attendanceSummaryQuerySchema.parse(query);
    return this.service.summary(principal, parsed.term_id);
  }

  @Get('subjects/:subjectId')
  @RequireStudentPermissions('student.attendance.view')
  subject(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('subjectId') subjectId: string,
    @Query() query: unknown,
  ) {
    requireInstitutional(principal);
    const parsed = attendanceSubjectQuerySchema.parse(query);
    return this.service.subjectDetail(principal, subjectId, parsed.cursor);
  }

  @Get('coverage')
  @RequireStudentPermissions('student.attendance.view')
  coverage(@CurrentStudent() principal: StudentPrincipal, @Query() query: unknown) {
    requireInstitutional(principal);
    const parsed = attendanceCoverageQuerySchema.parse(query);
    return this.service.coverage(principal, parsed.start, parsed.end);
  }
}
