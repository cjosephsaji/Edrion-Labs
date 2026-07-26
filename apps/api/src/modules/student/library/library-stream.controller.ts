import { Controller, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { LibraryService } from './library.service';

@ApiTags('student-library-stream')
@Controller('student/library/items')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.library.use')
export class LibraryStreamController {
  constructor(private readonly library: LibraryService) {}

  @Post(':id/summarize/stream')
  async summarizeStream(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.runStream(res, (emit) => this.library.streamSummarize(principal, id, emit));
  }

  @Post(':id/flashcards/stream')
  async flashcardsStream(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.runStream(res, (emit) => this.library.streamFlashcards(principal, id, emit));
  }

  @Post(':id/quiz/stream')
  async quizStream(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.runStream(res, (emit) => this.library.streamQuiz(principal, id, emit));
  }

  private async runStream(
    res: Response,
    work: (emit: (event: Record<string, unknown>) => void) => Promise<void>,
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
      await work(emit);
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
}
