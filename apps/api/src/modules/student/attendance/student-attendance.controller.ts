import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentAttendanceService } from './student-attendance.service';

@ApiTags('student-attendance')
@Controller('student/attendance')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard)
@RequireStudentPermissions('student.attendance.view')
export class StudentAttendanceController {
  constructor(private readonly service: StudentAttendanceService) {}

  @Get()
  list(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.service.summary(principal);
  }
}
