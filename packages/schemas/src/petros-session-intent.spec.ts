import { describe, expect, it } from 'vitest';
import {
  PETROS_SESSION_INTENT_SCHEMA_VERSION,
  petrosAssistantQuestionSchema,
  petrosSessionIntentSchema,
  resolvePetrosSessionIntentSchema,
} from './petros-session-intent';

const id = (prefix: string) => `${prefix.repeat(8)}-${prefix.repeat(4)}-4${prefix.repeat(3)}-8${prefix.repeat(3)}-${prefix.repeat(12)}`;

describe('Petros Stage 8 intent contract', () => {
  it.each(['result_repair', 'upcoming_exam', 'uploaded_document', 'learning_path', 'assistant_handoff'] as const)(
    'validates a complete %s intent',
    (door) => {
      const intent = petrosSessionIntentSchema.parse({
        schemaVersion: PETROS_SESSION_INTENT_SCHEMA_VERSION,
        id: id('1'),
        door,
        institutionId: id('2'),
        campusId: null,
        studentId: id('3'),
        permissionContext: ['student.learn.use'],
        sessionType: door === 'result_repair' ? 'repair' : door === 'upcoming_exam' ? 'revise' : door === 'assistant_handoff' ? 'doubt' : 'learn',
        goal: 'Reach one bounded learning outcome from verified context.',
        targetConcepts: ['Integration by parts'],
        scope: { summary: 'Verified source scope', boundaries: ['Stay within this source.'], curriculum: [], knownFailureDetails: [], learningPathPosition: null },
        time: { budgetSeconds: 900, deadline: null, examDate: null },
        emotionalRegister: door === 'result_repair' ? 'flat_practical' : 'responsive_neutral',
        registerFactors: ['Use a bounded and respectful opening.'],
        sourceEntityIds: [id('4')],
        citations: [],
        language: 'en',
        accessibility: [],
        returnDestination: { href: '/results', label: 'Results', resumeToken: id('5') },
        policyDisclosures: ['Source permissions stay in force.'],
        sourceFingerprint: 'a'.repeat(64),
        idempotencyKey: id('6'),
        correlationId: id('7'),
        status: 'resolved',
        expiresAt: '2099-01-01T00:00:00.000Z',
        createdAt: '2026-08-12T00:00:00.000Z',
      });
      expect(intent.door).toBe(door);
    },
  );

  it('requires a transferred question only for an assistant handoff', () => {
    const result = resolvePetrosSessionIntentSchema.safeParse({
      door: 'assistant_handoff', sourceId: '/results', idempotencyKey: id('1'), timeBudgetSeconds: 900,
    });
    expect(result.success).toBe(false);
    expect(petrosAssistantQuestionSchema.safeParse({ question: 'When is it?', route: '/exams', idempotencyKey: id('2') }).success).toBe(true);
  });

  it('rejects external return URLs and unbounded emotional labels', () => {
    expect(resolvePetrosSessionIntentSchema.safeParse({ door: 'result_repair', sourceId: id('1'), idempotencyKey: id('2'), route: 'https://example.com' }).success).toBe(false);
    expect(petrosSessionIntentSchema.shape.emotionalRegister.safeParse('clinically_depressed').success).toBe(false);
  });
});
