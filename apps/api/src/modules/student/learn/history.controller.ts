import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { HistoryService } from './history.service';

@ApiTags('student-history')
@Controller('student')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get('history')
  @RequireStudentPermissions('student.history.view')
  list(
    @CurrentStudent() principal: StudentPrincipal,
    @Query('type') type?: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.history.list(principal, type, q, cursor);
  }
}
