import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { askInputSchema, pinAskInputSchema } from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { AskService } from './ask.service';

@ApiTags('student-learn-ask')
@Controller('student/learn/ask')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.learn.use')
export class AskController {
  constructor(private readonly ask: AskService) {}

  @Post()
  askQuestion(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.ask.ask(principal, askInputSchema.parse(body));
  }

  @Post('stream')
  async askStream(
    @CurrentStudent() principal: StudentPrincipal,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    const input = askInputSchema.parse(body);
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
      await this.ask.streamAsk(principal, input, emit);
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

  @Post('pin')
  pin(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.ask.pin(principal, pinAskInputSchema.parse(body));
  }
}
