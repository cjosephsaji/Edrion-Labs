import { Inject, Injectable } from '@nestjs/common';
import type { LearningEventInput } from '@edrion/schemas';
import { learningEventInputSchema, learningEventPayloadSchemas } from '@edrion/schemas';
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

  async log(input: LearningEventLogInput): Promise<void> {
    try {
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
        await this.repo.insert({
          ...base,
          institutionId: principal.institutionId,
          campusId: principal.campusId,
          studentId: principal.studentId,
        });
        return;
      }
      if (principal?.kind === 'independent') {
        await this.repo.insert({
          ...base,
          independentUserId: principal.independentUserId,
        });
        return;
      }

      await this.repo.insert(base);
    } catch (err) {
      this.errors.captureException(err, { module: 'learning-events' });
    }
  }
}
