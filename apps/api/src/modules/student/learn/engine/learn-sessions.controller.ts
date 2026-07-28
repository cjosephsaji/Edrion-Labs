import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { intentInputSchema, patchTopicProfileInputSchema, topicProfileV1Schema } from '@edrion/schemas';
import { z } from 'zod';
import { Public } from '../../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../../common/decorators';
import { StudentAuthGuard } from '../../core/student-auth.guard';
import { StudentPermissionsGuard } from '../../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../../core/student.decorators';
import type { StudentPrincipal } from '../../student.types';
import { RouterService } from '../../learn-ai/router.service';
import { PedagogyOrchestratorService } from './pedagogy-orchestrator.service';
import { TopicProfileService } from './profile.service';
import { streamReconnectQuerySchema } from '@edrion/schemas';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

const evalSeedProfileSchema = z.object({
  topicKey: z.string().min(1),
  title: z.string().min(1),
  profile: topicProfileV1Schema,
});

@ApiTags('student-learn')
@Controller('student/learn')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.learn.use')
export class LearnSessionsController {
  constructor(
    private readonly orchestrator: PedagogyOrchestratorService,
    private readonly router: RouterService,
    private readonly profiles: TopicProfileService,
  ) {}

  @Post('intent')
  intent(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    const input = intentInputSchema.parse(body);
    return this.router.route(principal, input.text);
  }

  /**
   * Eval harness only — requires `LEARN_EVAL_SECRET` env and matching `x-learn-eval-secret` header.
   * Seeds a frozen human_override topic profile so evals skip the profiler LLM.
   */
  @Post('eval/seed-profile')
  async seedEvalProfile(
    @CurrentStudent() principal: StudentPrincipal,
    @Headers('x-learn-eval-secret') secret: string | undefined,
    @Body() body: unknown,
  ) {
    const expected = process.env.LEARN_EVAL_SECRET;
    if (!expected || secret !== expected) {
      throw new ForbiddenException({ code: 'EVAL_FORBIDDEN', message: 'Eval seeding is disabled.' });
    }
    const input = evalSeedProfileSchema.parse(body);
    const row = await this.profiles.upsertFrozenEvalProfile(principal, input);
    return { id: row.id, topicKey: row.topicKey };
  }

  /**
   * Hyperspec §2.3 / PM-052: owner (independent) may override their own profiles.
   * Institution-scoped profiles require staff `learn.profile.override` (portal),
   * which is out of the student surface — institutional students get 403 here.
   */
  @Patch('topic-profiles/:id')
  async patchTopicProfile(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (principal.kind !== 'independent') {
      throw new ForbiddenException({
        code: 'PROFILE_OVERRIDE_STAFF_ONLY',
        message: 'Institution topic profiles are overridden by staff with learn.profile.override.',
      });
    }
    const input = patchTopicProfileInputSchema.parse(body);
    const updated = await this.profiles.patchOverride(
      principal,
      id,
      input,
      principal.independentUserId,
    );
    if (!updated) throw new NotFoundException({ code: 'PROFILE_NOT_FOUND', message: 'Topic profile not found.' });
    return {
      id: updated.id,
      topicKey: updated.topicKey,
      title: updated.title,
      profile: updated.profile,
      source: updated.source,
      expiresAt: updated.expiresAt,
      version: updated.version,
    };
  }

  @Post('sessions')
  create(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.orchestrator.createSession(principal, body);
  }

  @Get('sessions/:id')
  get(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.orchestrator.getSession(principal, id);
  }

  @Get('sessions/:id/stream')
  async stream(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    const { lastSeq } = streamReconnectQuerySchema.parse(query);
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const emit = (event: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    try {
      await this.orchestrator.stream(principal, id, lastSeq ?? 0, emit);
    } catch (e) {
      const err = e as { response?: { code?: string; message?: string }; message?: string };
      emit({
        type: 'error',
        code: err.response?.code ?? 'STREAM_FAILED',
        message: err.response?.message ?? err.message ?? 'Stream failed',
      });
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  @Post('sessions/:id/blocks/:blockId/answer')
  answer(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @Body() body: unknown,
  ) {
    return this.orchestrator.answerBlock(principal, id, blockId, body);
  }

  @Post('sessions/:id/blocks/:blockId/interact')
  interact(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @Body() body: unknown,
  ) {
    return this.orchestrator.interactBlock(principal, id, blockId, body);
  }

  @Post('sessions/:id/ask')
  ask(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string, @Body() body: unknown) {
    return this.orchestrator.askSession(principal, id, body);
  }

  @Post('sessions/:id/commit-artifacts')
  commit(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string, @Body() body: unknown) {
    return this.orchestrator.commitArtifacts(principal, id, body);
  }

  @Post('sessions/:id/pause')
  pause(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.orchestrator.pause(principal, id);
  }

  @Post('sessions/:id/resume')
  resume(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.orchestrator.resume(principal, id);
  }

  @Post('sessions/:id/end')
  end(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string, @Body() body: unknown) {
    return this.orchestrator.end(principal, id, body);
  }
}
