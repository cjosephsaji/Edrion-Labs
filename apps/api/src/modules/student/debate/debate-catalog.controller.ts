import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { DebateCatalogService } from './debate-catalog.service';

@ApiTags('student-debate')
@Controller('student/debate')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.lab.use')
export class DebateCatalogController {
  constructor(private readonly catalog: DebateCatalogService) {}

  @Get('formats')
  formats(
    @CurrentStudent() principal: StudentPrincipal,
    @Query('buildable') buildable?: string,
  ) {
    return this.catalog.listFormats(principal, buildable !== 'false');
  }

  @Get('motions')
  motions(
    @CurrentStudent() principal: StudentPrincipal,
    @Query('q') q?: string,
    @Query('difficulty') difficulty?: string,
    @Query('format') formatKey?: string,
  ) {
    return this.catalog.listMotions(principal, {
      q,
      difficulty: difficulty ? Number(difficulty) : undefined,
      formatKey,
    });
  }
}
