import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { DebateSkillsService } from './debate-skills.service';
import { DebateMotionSuggestService } from './debate-motion-suggest.service';
import { DebateCatalogService } from './debate-catalog.service';

@ApiTags('student-debate')
@Controller('student/debate')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.lab.use')
export class DebateMeController {
  constructor(
    private readonly skills: DebateSkillsService,
    private readonly motions: DebateMotionSuggestService,
    private readonly catalog: DebateCatalogService,
  ) {}

  @Get('me/skills')
  meSkills(@CurrentStudent() principal: StudentPrincipal, @Query('format') format?: string) {
    return this.skills.getSkills(principal, format);
  }

  @Post('motions/suggest')
  suggest(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.motions.suggest(principal, body);
  }
}
