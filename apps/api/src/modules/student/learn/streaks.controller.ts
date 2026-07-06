import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { StreaksService } from './streaks.service';

@ApiTags('student-learn-streaks')
@Controller('student/learn/streaks')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.learn.use')
export class StreaksController {
  constructor(private readonly streaks: StreaksService) {}

  @Get()
  get(@CurrentStudent() principal: StudentPrincipal) {
    return this.streaks.get(principal);
  }
}
