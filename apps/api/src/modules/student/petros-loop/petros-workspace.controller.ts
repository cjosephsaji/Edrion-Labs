import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { CurrentStudent, RequireStudentPermissions, StudentRateLimit } from '../core/student.decorators';
import { StudentOwnsTransactions } from '../core/student-owned-transactions';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import type { StudentPrincipal } from '../student.types';
import { PetrosWorkspaceService } from './petros-workspace.service';

@Controller('student/petros/sessions/:sessionId/blocks/:blockId/workspace')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(60, 60)
export class StudentPetrosWorkspaceController {
  constructor(private readonly service: PetrosWorkspaceService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @StudentOwnsTransactions()
  read(@CurrentStudent() principal: StudentPrincipal, @Param('sessionId') session: string, @Param('blockId') block: string) {
    requireInstitutional(principal);
    return this.service.read(principal, session, block);
  }
  @Put()
  @Header('Cache-Control', 'private, no-store')
  @StudentOwnsTransactions()
  async command(@CurrentStudent() principal: StudentPrincipal, @Param('sessionId') session: string,
    @Param('blockId') block: string, @Body() command: unknown,
    @Req() request: Request) {
    requireInstitutional(principal);
    const abort = new AbortController();
    const cancel = () => abort.abort();
    request.once('aborted', cancel);
    try { return await this.service.command(principal, session, block, command, abort.signal); }
    finally { request.off('aborted', cancel); }
  }
  @Post('cancel')
  @Header('Cache-Control', 'private, no-store')
  @StudentOwnsTransactions()
  cancel(@CurrentStudent() principal: StudentPrincipal, @Param('sessionId') session: string,
    @Param('blockId') block: string, @Body() command: unknown) {
    requireInstitutional(principal);
    return this.service.cancel(principal, session, block, command);
  }

  @Post('predictions')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @StudentOwnsTransactions()
  issuePrediction(@CurrentStudent() principal: StudentPrincipal, @Param('sessionId') session: string,
    @Param('blockId') block: string, @Body() request: unknown) {
    requireInstitutional(principal);
    return this.service.issuePrediction(principal, session, block, request);
  }

  @Post('predictions/answer')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @StudentOwnsTransactions()
  answerPrediction(@CurrentStudent() principal: StudentPrincipal, @Param('sessionId') session: string,
    @Param('blockId') block: string, @Body() answer: unknown) {
    requireInstitutional(principal);
    return this.service.answerPrediction(principal, session, block, answer);
  }
}
