import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { ExamGenerationService, type ExamPrincipalRef } from './exam-generation.service';
import { ExamSubjectiveGradingService } from './exam-subjective-grading.service';

export const EXAM_GENERATE_JOB = 'exam.generate';
export const EXAM_GRADE_SUBJECTIVE_JOB = 'exam.grade_subjective';
export const EXAM_PRUNE_JOB = 'exam.prune_expired';

export interface ExamGenerateJobData {
  examId: string;
  principalRef: ExamPrincipalRef;
}

export interface ExamGradeJobData {
  examId: string;
  attemptId: string;
  principalRef: ExamPrincipalRef;
}

@Injectable()
export class ExamEngineProcessor implements OnModuleInit {
  private readonly logger = new Logger(ExamEngineProcessor.name);

  constructor(
    private readonly workers: QueueWorkers,
    private readonly jobs: JobsService,
    private readonly generation: ExamGenerationService,
    private readonly grading: ExamSubjectiveGradingService,
  ) {}

  onModuleInit(): void {
    this.workers.register(EXAM_GENERATE_JOB, (job: Job) => this.onGenerate(job.data as ExamGenerateJobData));
    this.workers.register(EXAM_GRADE_SUBJECTIVE_JOB, (job: Job) =>
      this.onGrade(job.data as ExamGradeJobData),
    );
    this.workers.register(EXAM_PRUNE_JOB, () => this.grading.pruneExpiredAttempts());
    void this.jobs.schedule('maintenance', EXAM_PRUNE_JOB, 60 * 60 * 1000);
  }

  async enqueueGenerate(data: ExamGenerateJobData): Promise<string | null> {
    const id = await this.jobs.enqueue('ai', EXAM_GENERATE_JOB, data as unknown as Record<string, unknown>);
    if (!id) {
      // Queues disabled — run inline so local/dev still works.
      await this.onGenerate(data);
    }
    return id;
  }

  async enqueueGrade(data: ExamGradeJobData): Promise<string | null> {
    const id = await this.jobs.enqueue('ai', EXAM_GRADE_SUBJECTIVE_JOB, data as unknown as Record<string, unknown>);
    if (!id) await this.onGrade(data);
    return id;
  }

  private async onGenerate(data: ExamGenerateJobData) {
    try {
      await this.generation.generateExam(data.examId, data.principalRef);
    } catch (e) {
      this.logger.error(`exam.generate failed: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  }

  private async onGrade(data: ExamGradeJobData) {
    try {
      await this.grading.gradeSubjective(data.examId, data.attemptId, data.principalRef);
    } catch (e) {
      this.logger.error(`exam.grade_subjective failed: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  }
}
