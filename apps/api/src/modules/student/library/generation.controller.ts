import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { GenerationCurationService } from './generation-curation.service';

@ApiTags('student-library-generation')
@Controller('student/library/generation')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class GenerationController {
  constructor(private readonly curation: GenerationCurationService) {}

  @Get('items/:itemId/drafts')
  @RequireStudentPermissions('student.library.use')
  listDrafts(@CurrentStudent() principal: StudentPrincipal, @Param('itemId') itemId: string) {
    return this.curation.listDrafts(principal, itemId);
  }

  @Get(':jobId')
  @RequireStudentPermissions('student.library.use')
  getDraft(@CurrentStudent() principal: StudentPrincipal, @Param('jobId') jobId: string) {
    return this.curation.getDraft(principal, jobId);
  }

  @Post(':jobId/save')
  @RequireStudentPermissions('student.library.use')
  save(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('jobId') jobId: string,
    @Body() body: { kept: unknown[]; deck_id?: string },
  ) {
    return this.curation.saveDraft(principal, jobId, body);
  }
}
