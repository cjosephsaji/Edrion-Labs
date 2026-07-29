import { Body, Controller, Get, Param, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { ExamEngineService } from './exam-engine.service';
import { ExamGenerationService } from './exam-generation.service';
import { ExamSubjectiveGradingService } from './exam-subjective-grading.service';
import type { ExamGenerationSseEvent, ExamGradingSseEvent } from '@edrion/schemas';

@ApiTags('student-lab-mock')
@Controller('student/lab/mock-exams')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.lab.use')
export class ExamEngineController {
  constructor(
    private readonly exams: ExamEngineService,
    private readonly generation: ExamGenerationService,
    private readonly grading: ExamSubjectiveGradingService,
  ) {}

  @Get('past-mistakes')
  pastMistakes(@CurrentStudent() principal: StudentPrincipal) {
    return this.pastMistakes.listForPrincipal(principal);
  }

  @Get()
  list(@CurrentStudent() principal: StudentPrincipal) {
    return this.exams.listExams(principal);
  }

  @Get('defaults')
  defaults(@CurrentStudent() principal: StudentPrincipal) {
    return this.exams.defaults(principal);
  }

  @Get('patterns')
  patterns() {
    return this.exams.listPatterns();
  }

  @Get('wizard/blueprints')
  wizardBlueprints(@CurrentStudent() principal: StudentPrincipal) {
    return this.exams.listWizardBlueprints(principal);
  }

  @Get('past-mistakes')
  pastMistakes(
    @CurrentStudent() principal: StudentPrincipal,
    @Query('windowDays') windowDays?: string,
  ) {
    const n = windowDays === '90' ? 90 : windowDays === '0' ? 0 : 30;
    return this.exams.listPastMistakes(principal, n);
  }

  @Post('wizard')
  createWizard(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.exams.createFromWizard(principal, body);
  }

  @Post('blueprints')
  createBlueprint(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.exams.createBlueprint(principal, body);
  }

  @Post('blueprints/from-pattern/:key')
  duplicatePattern(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('key') key: string,
  ) {
    return this.exams.duplicateFromPattern(principal, key);
  }

  @Get('blueprints/:id')
  getBlueprint(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.exams.getBlueprint(principal, id);
  }

  @Patch('blueprints/:id')
  updateBlueprint(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.exams.updateBlueprint(principal, id, body);
  }

  @Post('check-topic')
  checkTopic(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.exams.checkTopic(principal, body);
  }

  @Post('generate')
  generate(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.exams.generate(principal, body);
  }

  @Post('push-revision')
  pushRevision(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.exams.pushRevision(principal, body);
  }

  /** Legacy create — still supported for older clients. */
  @Post()
  create(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.exams.createLegacy(principal, body);
  }

  @Get(':id')
  get(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.exams.get(principal, id);
  }

  @Post(':id/generate/stream')
  async generateStream(
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
    const emit = (event: ExamGenerationSseEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    try {
      const exam = await this.exams.get(principal, id);
      if (exam.status === 'ready' || exam.status === 'scheduled') {
        emit({
          type: 'saved',
          examId: id,
          questionCount: exam.questions?.length ?? 0,
          status: exam.status === 'scheduled' ? 'scheduled' : 'ready',
        });
      } else {
        await this.generation.generateExam(id, this.exams.principalRef(principal), emit);
      }
    } catch (e) {
      emit({ type: 'error', message: e instanceof Error ? e.message : 'Generation failed' });
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }

  @Get(':id/grade/stream')
  async gradeStream(
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
    const emit = (event: ExamGradingSseEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    try {
      for (let i = 0; i < 60; i++) {
        const exam = await this.exams.get(principal, id, { includeKeys: true });
        const st = exam.attempt?.status;
        if (
          exam.gradingStatus === 'graded' ||
          st === 'graded' ||
          st === 'scored' ||
          st === 'awaiting_self_grade'
        ) {
          emit({
            type: 'done',
            attemptId: exam.attempt!.id,
            awardedMarks: exam.results?.awardedMarks ?? 0,
            maxMarks: exam.results?.maxMarks ?? 0,
          });
          break;
        }
        if (i === 0) {
          emit({
            type: 'grading_started',
            attemptId: exam.attempt?.id ?? id,
            subjectiveCount:
              exam.questions?.filter((q) =>
                ['short_answer', 'long_answer', 'case_based'].includes(String(q.qtype)),
              ).length ?? 0,
          });
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (e) {
      emit({ type: 'error', message: e instanceof Error ? e.message : 'Grading failed' });
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }

  @Post(':id/start')
  start(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.exams.start(principal, id);
  }

  /** Deprecated — always 403 PAUSE_DISABLED. Kept for old clients. */
  @Post(':id/pause')
  pause(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.exams.pause(principal, id);
  }

  @Post(':id/attempt/tab-switch')
  tabSwitch(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.exams.recordTabSwitch(principal, id, body);
  }

  @Put(':id/answers/:qid')
  answer(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('qid') qid: string,
    @Body() body: unknown,
  ) {
    return this.exams.saveAnswer(principal, id, qid, body);
  }

  @Put(':id/attempt/answers/:qid')
  answerAttempt(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('qid') qid: string,
    @Body() body: unknown,
  ) {
    return this.exams.saveAnswer(principal, id, qid, body);
  }

  @Post(':id/finish')
  finish(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.exams.finish(principal, id);
  }

  @Post(':id/submit')
  submit(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.exams.finish(principal, id);
  }

  @Post(':id/self-grade/:questionId')
  selfGrade(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() body: unknown,
  ) {
    return this.grading.recordSelfGrade(principal, id, questionId, body);
  }

  @Post(':id/retake-weak')
  retakeWeak(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.exams.retakeWeak(principal, id);
  }
}
