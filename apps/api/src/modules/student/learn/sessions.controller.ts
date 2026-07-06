import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import {
  createSessionInputSchema,
  hintInputSchema,
  intentInputSchema,
} from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { RouterService } from '../learn-ai/router.service';
import { SessionsService } from './sessions.service';

@ApiTags('student-learn')
@Controller('student/learn')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.learn.use')
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly router: RouterService,
  ) {}

  @Post('intent')
  intent(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    const input = intentInputSchema.parse(body);
    return this.router.route(principal, input.text);
  }

  @Post('sessions')
  create(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.sessions.create(principal, createSessionInputSchema.parse(body));
  }

  @Get('sessions/:id')
  get(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.sessions.get(principal, id);
  }

  @Get('sessions/:id/stream')
  async stream(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
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
      await this.sessions.streamPending(principal, id, emit);
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
    @Body() body: Record<string, unknown>,
  ) {
    return this.sessions.answer(principal, id, blockId, body);
  }

  @Post('sessions/:id/blocks/:blockId/hint')
  hint(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @Body() body: unknown,
  ) {
    const { rung } = hintInputSchema.parse(body);
    return this.sessions.hint(principal, id, blockId, rung);
  }

  @Post('sessions/:id/pause')
  pause(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.sessions.pause(principal, id);
  }

  @Post('sessions/:id/resume')
  resume(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.sessions.resume(principal, id);
  }

  @Post('sessions/:id/finish')
  finish(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.sessions.finish(principal, id);
  }
}
