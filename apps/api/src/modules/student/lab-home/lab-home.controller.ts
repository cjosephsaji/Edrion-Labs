import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import {
  CurrentStudent,
  RequireStudentPermissions,
  StudentRateLimit,
} from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { LabHomeService } from './lab-home.service';

@ApiTags('student-lab')
@Controller('student/lab')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentRateLimitGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.lab.use')
export class LabHomeController {
  constructor(private readonly labHome: LabHomeService) {}

  @Get('home')
  @StudentRateLimit(120, 60)
  home(@CurrentStudent() principal: StudentPrincipal) {
    return this.labHome.home(principal);
  }
}
