import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { LabMockService } from './lab-mock.service';

@ApiTags('student-lab-mock')
@Controller('student/lab/mock-exams')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.lab.use')
export class LabMockController {
  constructor(private readonly mock: LabMockService) {}

  @Get('defaults')
  defaults(@CurrentStudent() principal: StudentPrincipal) {
    return this.mock.defaults(principal);
  }

  @Post()
  create(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.mock.create(principal, body);
  }

  @Get(':id')
  get(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.mock.get(principal, id);
  }

  @Post(':id/start')
  start(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.mock.start(principal, id);
  }

  @Put(':id/answers/:qid')
  answer(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('qid') qid: string,
    @Body() body: unknown,
  ) {
    return this.mock.saveAnswer(principal, id, qid, body);
  }

  @Post(':id/finish')
  finish(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.mock.finish(principal, id);
  }

  @Post(':id/retake-weak')
  retakeWeak(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.mock.retakeWeak(principal, id);
  }
}
