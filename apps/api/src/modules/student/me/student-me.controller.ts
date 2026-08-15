import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { StudentMeService } from './student-me.service';

@ApiTags('student-me')
@Controller('student')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentMeController {
  constructor(private readonly me: StudentMeService) {}

  @Get('me')
  getMe(@CurrentStudent() principal: StudentPrincipal) {
    return this.me.getMe(principal);
  }
}
