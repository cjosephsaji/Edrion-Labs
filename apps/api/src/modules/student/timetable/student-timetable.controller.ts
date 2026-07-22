import { Controller, Get, Headers, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { studentTimetableQuerySchema } from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { TimetableResolverService } from './timetable-resolver.service';

@ApiTags('student-timetable')
@Controller('student/timetable')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentTimetableController {
  constructor(private readonly timetable: TimetableResolverService) {}

  @Get()
  async list(
    @CurrentStudent() principal: StudentPrincipal,
    @Query() query: Record<string, string>,
    @Headers('if-none-match') match: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { from, to } = studentTimetableQuerySchema.parse(query);
    const result = await this.timetable.getStudentTimetable(principal, from, to);
    response.setHeader('etag', result.etag);
    response.setHeader('cache-control', 'private, no-cache');
    if (match === result.etag) {
      response.status(304);
      return;
    }
    return result.payload;
  }

  @Get('period/:occurrenceId')
  period(@CurrentStudent() principal: StudentPrincipal, @Param('occurrenceId') occurrenceId: string) {
    return this.timetable.getPeriodDetail(principal, occurrenceId);
  }
}
