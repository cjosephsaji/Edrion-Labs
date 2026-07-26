import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { InstitutionalStudentPrincipal, StudentPrincipal } from '../student.types';
import { FeesSummaryService } from '../surfaces/fees-summary.service';
import { StudentHomeService } from './student-home.service';

@ApiTags('student-home')
@Controller('student')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentHomeController {
  constructor(
    private readonly home: StudentHomeService,
    private readonly fees: FeesSummaryService,
  ) {}

  @Get('home')
  getHome(@CurrentStudent() principal: StudentPrincipal) {
    return this.home.getHome(principal);
  }

  @Get('schedule/today')
  todaySchedule(@CurrentStudent() principal: StudentPrincipal) {
    return this.home.todaySchedule(principal);
  }

  @Get('surfaces/fees/summary')
  @RequireStudentPermissions('student.surface.fees.view')
  feesSummary(@CurrentStudent() principal: StudentPrincipal) {
    if (principal.kind !== 'institutional') {
      return { outstandingMinor: 0, dueSoon: [], currency: 'USD' };
    }
    return this.fees.getSummary(principal as InstitutionalStudentPrincipal);
  }
}
