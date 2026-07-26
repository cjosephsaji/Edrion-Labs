import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { LabDebateService } from './lab-debate.service';

@ApiTags('student-lab-debate')
@Controller('student/lab/debates')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.lab.use')
export class LabDebateController {
  constructor(private readonly debate: LabDebateService) {}

  @Get('motions')
  motions() {
    return this.debate.motions();
  }

  @Post()
  create(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.debate.create(principal, body);
  }

  @Post('join/:token')
  join(@CurrentStudent() principal: StudentPrincipal, @Param('token') token: string) {
    return this.debate.join(principal, token);
  }

  @Get(':id/lobby')
  lobby(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.debate.lobby(principal, id);
  }

  @Get(':id')
  get(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Query('after') after?: string,
  ) {
    return this.debate.get(principal, id, after ? Number(after) : undefined);
  }

  @Post(':id/turns')
  turn(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.debate.submitTurn(principal, id, body);
  }

  @Post(':id/finish')
  finish(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.debate.finish(principal, id);
  }
}
