import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { studentPreferencesSchema } from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
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

  @Get('preferences')
  @RequireStudentPermissions('student.settings.manage')
  getPreferences(@CurrentStudent() principal: StudentPrincipal) {
    return this.me.getPreferences(principal);
  }

  @Patch('preferences')
  @RequireStudentPermissions('student.settings.manage')
  patchPreferences(
    @CurrentStudent() principal: StudentPrincipal,
    @Body(zodBody(studentPreferencesSchema.partial())) body: Record<string, unknown>,
  ) {
    return this.me.patchPreferences(principal, body);
  }
}
