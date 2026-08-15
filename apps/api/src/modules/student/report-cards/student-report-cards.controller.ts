import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentReportCardsService } from './student-report-cards.service';

@ApiTags('student-report-cards')
@Controller('student/report-cards')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard)
@RequireStudentPermissions('student.report_cards.view')
export class StudentReportCardsController {
  constructor(private readonly service: StudentReportCardsService) {}

  @Get()
  list(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.service.list(principal);
  }

  @Get(':id')
  detail(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.service.detail(principal, id);
  }
}
