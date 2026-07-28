import { Inject, Injectable } from '@nestjs/common';
import type { LearningEventInput } from '@edrion/schemas';
import { learningEventInputSchema, learningEventPayloadSchemas } from '@edrion/schemas';
import type { Database } from '@edrion/database';
import { ERROR_REPORTER } from '../../../common/tokens';
import type { ErrorReporter } from '@edrion/observability';
import type { StudentPrincipal } from '../student.types';
import { LearningEventsRepository } from './learning-events.repository';

export interface LearningEventLogInput extends LearningEventInput {
  principal?: StudentPrincipal;
  requestId?: string;
}

@Injectable()
export class LearningEventsWriter {
  constructor(
    private readonly repo: LearningEventsRepository,
    @Inject(ERROR_REPORTER) private readonly errors: ErrorReporter,
  ) {}

  /** Fire-and-forget path used by non-critical surfaces. Swallows errors. */
  async log(input: LearningEventLogInput): Promise<void> {
    try {
      await this.write(input);
    } catch (err) {
      this.errors.captureException(err, { module: 'learning-events' });
    }
  }

  /**
   * Strict path for Learn mastery writebacks (DEC-9 / AC10). Propagates errors
   * so the surrounding transaction can roll back. Optional `tx` joins the
   * caller's transaction.
   */
  async logStrict(input: LearningEventLogInput, tx?: Database): Promise<void> {
    await this.write(input, tx);
  }

  private async write(input: LearningEventLogInput, tx?: Database): Promise<void> {
    const parsed = learningEventInputSchema.parse(input);
    const schemaForType =
      learningEventPayloadSchemas[parsed.eventType as keyof typeof learningEventPayloadSchemas];
    if (schemaForType) {
      schemaForType.parse(parsed.payload);
    }

    const principal = input.principal;
    const base = {
      eventType: parsed.eventType,
      payload: parsed.payload,
      topicKey: parsed.topicKey ?? null,
      subjectLabel: parsed.subjectLabel ?? null,
      contextType: parsed.contextType ?? null,
      contextId: parsed.contextId ?? null,
      actorKind: parsed.actorKind ?? 'student',
      actorId: parsed.actorId ?? null,
      requestId: input.requestId ?? null,
    };

    if (principal?.kind === 'institutional') {
      await this.repo.insert(
        {
          ...base,
          institutionId: principal.institutionId,
          campusId: principal.campusId,
          studentId: principal.studentId,
        },
        tx,
      );
      return;
    }
    if (principal?.kind === 'independent') {
      await this.repo.insert(
        {
          ...base,
          independentUserId: principal.independentUserId,
        },
        tx,
      );
      return;
    }

    await this.repo.insert(base, tx);
  }
}
