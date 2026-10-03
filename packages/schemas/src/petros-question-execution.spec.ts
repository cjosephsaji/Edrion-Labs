import { describe, expect, it } from 'vitest';
import {
  PETROS_QUESTION_EXECUTION_VERSION,
  petrosQuestionExecutionSchema,
  petrosQuestionExecutionCommandSchema,
  petrosQuestionJobSchema,
} from './petros-question-execution';

describe('durable document question contracts', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const pending = {
    schemaVersion: PETROS_QUESTION_EXECUTION_VERSION,
    id,
    sessionId: id,
    idempotencyKey: id,
    state: 'queued',
    version: 1,
    attempts: 0,
    processingEnabled: false,
    retryable: false,
    errorCode: null,
    result: null,
  };
  it('rejects false completion, impossible retry/attempt states and unknown wire keys', () => {
    expect(petrosQuestionExecutionSchema.parse(pending)).toEqual(pending);
    for (const patch of [
      { state: 'succeeded' },
      { state: 'running' },
      { retryable: true },
      { attempts: 4 },
      { studentId: id },
    ])
      expect(petrosQuestionExecutionSchema.safeParse({ ...pending, ...patch }).success).toBe(false);
  });
  it('bounds commands and admits only scoped IDs into the dispatch queue', () => {
    expect(petrosQuestionExecutionCommandSchema.parse({ version: 2, action: 'cancel' })).toEqual({
      version: 2,
      action: 'cancel',
    });
    expect(
      petrosQuestionExecutionCommandSchema.safeParse({ version: 0, action: 'retry' }).success,
    ).toBe(false);
    const job = { id, institutionId: id, studentId: id };
    expect(petrosQuestionJobSchema.parse(job)).toEqual(job);
    expect(petrosQuestionJobSchema.safeParse({ ...job, question: 'private text' }).success).toBe(
      false,
    );
  });
});
