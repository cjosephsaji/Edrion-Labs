import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { analyticsRangeSchema, type AnalyticsRange } from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { StudentAnalyticsService } from './student-analytics.service';

@ApiTags('student-analytics')
@Controller('student/analytics')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentAnalyticsController {
  constructor(private readonly service: StudentAnalyticsService) {}

  @Get()
  @RequireStudentPermissions('student.analytics.view')
  get(@CurrentStudent() principal: StudentPrincipal, @Query('range') rangeRaw?: string) {
    const range = analyticsRangeSchema.catch('week').parse(rangeRaw ?? 'week') as AnalyticsRange;
    return this.service.getAnalytics(principal, range);
  }
}
