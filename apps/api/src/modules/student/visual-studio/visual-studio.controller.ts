import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  visualApplyProposalInputSchema,
  visualAlternativeInputSchema,
  visualCanvasCreateInputSchema,
  visualCanvasListQuerySchema,
  visualCanvasPatchInputSchema,
  visualExpandInputSchema,
  visualGenerateInputSchema,
  visualJobEventsQuerySchema,
  visualMemoryCheckInputSchema,
  visualNodeQuizInputSchema,
  visualProposalInputSchema,
  visualQuizSubmitInputSchema,
  visualRevisionListQuerySchema,
  visualRevisionQueueInputSchema,
  visualRevisionRestoreInputSchema,
} from '@edrion/schemas';
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
import { VisualStudioService } from './visual-studio.service';

@ApiTags('student-visual')
@Controller('student/visual')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentRateLimitGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.lab.use')
export class VisualStudioController {
  constructor(private readonly visual: VisualStudioService) {}

  @Get('quota')
  @StudentRateLimit(120, 60)
  peekQuota(@CurrentStudent() principal: StudentPrincipal) {
    return this.visual.peekQuota(principal);
  }

  @Post('propose')
  @StudentRateLimit(20, 60)
  propose(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    const input = visualProposalInputSchema.parse(body);
    return this.visual.propose(principal, input);
  }

  @Post('generate')
  @StudentRateLimit(20, 60)
  @HttpCode(202)
  generate(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    const input = visualGenerateInputSchema.parse(body);
    return this.visual.generate(principal, input);
  }

  @Post('expand')
  @StudentRateLimit(20, 60)
  @HttpCode(202)
  expand(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    const input = visualExpandInputSchema.parse(body);
    return this.visual.expand(principal, input);
  }

  @Post('alternative')
  @StudentRateLimit(20, 60)
  @HttpCode(202)
  alternative(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    const input = visualAlternativeInputSchema.parse(body);
    return this.visual.alternative(principal, input);
  }

  @Post('node-quiz')
  @StudentRateLimit(20, 60)
  @HttpCode(202)
  nodeQuiz(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    const input = visualNodeQuizInputSchema.parse(body);
    return this.visual.nodeQuiz(principal, input);
  }

  @Post('node-quiz/:quizId/submit')
  @StudentRateLimit(60, 60)
  submitQuiz(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('quizId') quizId: string,
    @Body() body: unknown,
  ) {
    const input = visualQuizSubmitInputSchema.parse(body);
    return this.visual.submitQuiz(principal, quizId, input);
  }

  @Post('check-memory')
  @StudentRateLimit(20, 60)
  @HttpCode(202)
  checkMemory(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    const input = visualMemoryCheckInputSchema.parse(body);
    return this.visual.checkMemory(principal, input);
  }

  @Get('jobs/:jobId/events')
  @StudentRateLimit(12, 600)
  async jobEvents(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('jobId') jobId: string,
    @Query() query: unknown,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Res() res: Response,
  ) {
    const parsed = visualJobEventsQuerySchema.parse(query);
    const after = parsed.after ?? (lastEventId ? Number(lastEventId) : 0);
    await this.visual.streamJobEvents(principal, jobId, Number.isFinite(after) ? after : 0, res);
  }

  @Post('canvases')
  @StudentRateLimit(120, 60)
  createCanvas(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    const input = visualCanvasCreateInputSchema.parse(body);
    return this.visual.createCanvas(principal, input);
  }

  @Get('canvases')
  @StudentRateLimit(120, 60)
  listCanvases(@CurrentStudent() principal: StudentPrincipal, @Query() query: unknown) {
    const parsed = visualCanvasListQuerySchema.parse(query);
    return this.visual.listCanvases(principal, parsed);
  }

  @Get('canvases/:id')
  @StudentRateLimit(120, 60)
  getCanvas(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.visual.getCanvas(principal, id);
  }

  @Patch('canvases/:id')
  @StudentRateLimit(120, 60)
  patchCanvas(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = visualCanvasPatchInputSchema.parse(body);
    return this.visual.patchCanvas(principal, id, input);
  }

  @Delete('canvases/:id')
  @HttpCode(204)
  @StudentRateLimit(120, 60)
  async deleteCanvas(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Res() res: Response,
  ) {
    const version = Number(ifMatch);
    if (!Number.isInteger(version) || version < 1) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'If-Match version header required' });
      return;
    }
    await this.visual.deleteCanvas(principal, id, version);
    res.status(204).send();
  }

  @Get('canvases/:id/revisions')
  @StudentRateLimit(120, 60)
  listRevisions(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const { limit } = visualRevisionListQuerySchema.parse(query);
    return this.visual.listRevisions(principal, id, limit);
  }

  @Post('canvases/:id/revisions/:revisionId/restore')
  @StudentRateLimit(60, 60)
  restoreRevision(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Body() body: unknown,
  ) {
    const input = visualRevisionRestoreInputSchema.parse(body);
    return this.visual.restoreRevision(principal, id, revisionId, input);
  }

  @Post('canvases/:id/revision-queue')
  @StudentRateLimit(60, 60)
  revisionQueue(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = visualRevisionQueueInputSchema.parse(body);
    return this.visual.revisionQueue(principal, id, input);
  }

  @Post('canvases/:id/apply-proposal')
  @StudentRateLimit(60, 60)
  applyProposal(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = visualApplyProposalInputSchema.parse(body);
    return this.visual.applyProposal(principal, id, input);
  }

  @Get('memory/topics')
  @StudentRateLimit(120, 60)
  memoryTopics(@CurrentStudent() principal: StudentPrincipal) {
    return this.visual.memoryTopics(principal);
  }

  @Get('legacy/:artifactId')
  @StudentRateLimit(120, 60)
  legacyLookup(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('artifactId') artifactId: string,
  ) {
    return this.visual.legacyLookup(principal, artifactId);
  }
}
