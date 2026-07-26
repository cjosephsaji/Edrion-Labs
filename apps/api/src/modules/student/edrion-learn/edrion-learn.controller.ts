import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { OrchestratorSessionService } from './orchestrator-session.service';
import { LearnStreamService } from './learn-stream.service';
import { LearnEvidenceService, type RecordAnswerInput } from './learn-evidence.service';
import type { MasteryOutcome } from './mastery-engine';

@ApiTags('student-edrion-learn')
@Controller('student/edrion-learn/sessions')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class EdrionLearnController {
  constructor(
    private readonly sessions: OrchestratorSessionService,
    private readonly stream: LearnStreamService,
    private readonly evidence: LearnEvidenceService,
  ) {}

  @Post()
  create(
    @CurrentStudent() principal: StudentPrincipal,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.sessions.createSession(principal, body, idempotencyKey ?? randomUUID());
  }

  @Get(':id/stream')
  async streamEvents(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Query('lastSeq') lastSeqRaw: string | undefined,
    @Res() res: Response,
  ) {
    const lastSeq = lastSeqRaw ? Number.parseInt(lastSeqRaw, 10) : 0;
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const emit = async () => {
      const events = await this.stream.listEvents(principal, id, lastSeq);
      if (events === null) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Session not found' })}\n\n`);
        return;
      }
      for (const event of events) {
        res.write(`data: ${JSON.stringify({ type: 'event', ...event })}\n\n`);
      }
    };

    try {
      await emit();
      res.write('data: [DONE]\n\n');
    } catch (e) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: e instanceof Error ? e.message : 'Stream failed' })}\n\n`,
      );
    }
    res.end();
  }

  @Post(':id/end')
  end(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.sessions.endSession(principal, id);
  }

  @Post(':id/answers')
  recordAnswer(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') sessionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const input = body as RecordAnswerInput;
    if (!input?.blockId || !input?.questionId || !input?.atomId) {
      throw new NotFoundException();
    }
    return this.evidence.recordAnswer(principal, {
      ...input,
      sessionId,
      idempotencyKey: idempotencyKey ?? randomUUID(),
      outcome: (input.outcome ?? 'correct') as MasteryOutcome,
    });
  }

  @Get(':id')
  get(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.sessions.getSession(principal, id);
  }
}
