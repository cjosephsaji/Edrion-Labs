import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { RevisionService } from './revision.service';

@ApiTags('student-learn-revision')
@Controller('student/learn/revision')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.learn.use')
export class RevisionController {
  constructor(private readonly revision: RevisionService) {}

  @Get()
  queue(@CurrentStudent() principal: StudentPrincipal) {
    return this.revision.getQueue(principal);
  }

  @Post(':topicId/refresh')
  refresh(@CurrentStudent() principal: StudentPrincipal, @Param('topicId') topicId: string) {
    return this.revision.refresh(principal, topicId);
  }
}
