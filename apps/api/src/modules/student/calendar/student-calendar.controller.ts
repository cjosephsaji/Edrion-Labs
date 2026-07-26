import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createPlannerItemSchema, updatePlannerItemSchema, type CreatePlannerItemInput, type UpdatePlannerItemInput } from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentCalendarService } from './student-calendar.service';

@ApiTags('student-calendar')
@Controller('student')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentCalendarController {
  constructor(private readonly service: StudentCalendarService) {}

  @Get('calendar')
  @RequireStudentPermissions('student.calendar.view')
  calendar(@CurrentStudent() principal: StudentPrincipal, @Query('month') month: string) {
    requireInstitutional(principal);
    return this.service.getCalendar(principal, month ?? new Date().toISOString().slice(0, 7));
  }

  @Post('planner')
  @RequireStudentPermissions('student.planner.manage')
  createPlanner(@CurrentStudent() principal: StudentPrincipal, @Body(zodBody(createPlannerItemSchema)) body: CreatePlannerItemInput) {
    return this.service.createPlanner(principal, body);
  }

  @Patch('planner/:id')
  @RequireStudentPermissions('student.planner.manage')
  updatePlanner(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body(zodBody(updatePlannerItemSchema)) body: UpdatePlannerItemInput,
  ) {
    return this.service.updatePlanner(principal, id, body);
  }

  @Delete('planner/:id')
  @RequireStudentPermissions('student.planner.manage')
  deletePlanner(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string, @Query('version') version: string) {
    return this.service.deletePlanner(principal, id, Number(version));
  }
}
