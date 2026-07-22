import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { LibraryReviewService } from './library-review.service';
import type { Grade } from '@edrion/schemas';

@ApiTags('student-library-review')
@Controller('student/library/review')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class LibraryReviewController {
  constructor(private readonly review: LibraryReviewService) {}

  @Get('queue-summary')
  @RequireStudentPermissions('student.library.use')
  async queueSummary(@CurrentStudent() principal: StudentPrincipal) {
    return this.review.queueSummary(principal);
  }

  @Post('sessions')
  @RequireStudentPermissions('student.library.use')
  async createSession(
    @CurrentStudent() principal: StudentPrincipal,
    @Body() body: { source: string; deck_id?: string },
  ) {
    return this.review.createSession(principal, body);
  }

  @Post('sessions/:id/grades')
  @RequireStudentPermissions('student.library.use')
  async grade(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') sessionId: string,
    @Body()
    body: { client_review_id: string; card_id: string; grade: Grade; elapsed_ms: number },
  ) {
    return this.review.grade(principal, sessionId, body);
  }

  @Post('sessions/:id/end')
  @RequireStudentPermissions('student.library.use')
  async end(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') sessionId: string,
  ) {
    return this.review.endSession(principal, sessionId);
  }

  @Get('prefs')
  @RequireStudentPermissions('student.library.use')
  async getPrefs(@CurrentStudent() principal: StudentPrincipal) {
    return this.review.getPrefs(principal);
  }

  @Patch('prefs')
  @RequireStudentPermissions('student.library.use')
  async patchPrefs(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.review.patchPrefs(principal, body as never);
  }
}
