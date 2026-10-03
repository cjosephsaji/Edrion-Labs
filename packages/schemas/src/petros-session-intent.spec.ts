import { describe, expect, it } from 'vitest';
import { petrosSessionIntentSchema as previousReader } from './__fixtures__/petros-session-intent-89c1ca2';
import {
  PETROS_SESSION_INTENT_SCHEMA_VERSION,
  petrosAssistantQuestionSchema,
  petrosSessionIntentSchema,
  petrosTeachingPlanningSchema,
  petrosSessionIntentV1,
  resolvePetrosSessionIntentSchema,
  startPetrosSessionIntentSchema,
} from './petros-session-intent';

const id = (prefix: string) => `${prefix.repeat(8)}-${prefix.repeat(4)}-4${prefix.repeat(3)}-8${prefix.repeat(3)}-${prefix.repeat(12)}`;

describe('Petros Stage 8 intent contract', () => {
  it('allows a persistent document plan to expose more than twelve concepts', () => {
    const topics = Array.from({ length: 20 }, (_, index) => ({
      id: `concept-${index + 1}`,
      title: `Concept ${index + 1}`,
      summary: `A substantive source-grounded concept numbered ${index + 1}.`,
      pageStart: index + 1,
      pageEnd: index + 1,
      estimatedMinutes: 10,
      keyTerms: [],
      likelyDoubts: [],
    }));
    expect(petrosTeachingPlanningSchema.parse({
      organization: 'concepts', topics, suggestedTopicId: 'concept-1',
      suggestedPriority: 'understand', deadline: null, outlineCacheKey: null,
      outlineStatus: 'generated', estimatedTotalMinutes: 200,
    }).topics).toHaveLength(20);
  });

  it('keeps citations aligned with a document map larger than the legacy lesson cap', () => {
    const citations = Array.from({ length: 32 }, (_, index) => ({
      sourceType: 'document' as const,
      sourceId: id('4'),
      version: '1:fixture',
      label: 'Class 12 integrals guide',
      page: index + 1,
      section: `Concept ${index + 1}`,
      excerpt: `Source-grounded concept ${index + 1}`,
    }));
    expect(petrosSessionIntentSchema.shape.citations.parse(citations)).toHaveLength(32);
  });

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
      expect(previousReader.parse(petrosSessionIntentV1(intent))).toEqual(intent);
      if (door === 'uploaded_document') {
        const enriched = petrosSessionIntentSchema.parse({ ...intent,
          planning: { organization: 'concepts', topics: Array.from({ length: 32 }, (_, index) => ({
            id: `concept-${index + 1}`, title: `Concept ${index + 1}`, summary: 'A grounded concept.',
            pageStart: index + 1, pageEnd: index + 1, estimatedMinutes: 60, keyTerms: [], likelyDoubts: [],
            prerequisites: ['Foundation'], difficulty: 'foundation',
          })), suggestedTopicId: 'concept-1', suggestedPriority: 'understand', deadline: null,
            outlineCacheKey: 'synthetic', outlineStatus: 'generated', estimatedTotalMinutes: 1_920 },
          documentReadiness: { schemaVersion: 'petros.document-source.v1', sourceVersion: 'a'.repeat(64), status: 'ready',
            extraction: 'digital_text', indexing: 'not_built', selectedPages: [1], unavailablePages: [], omittedPageCount: 0,
            scopeReady: true, coverage: 'extracted_text_only', teaching: 'not_assessed', reasons: [] },
          citations: [{ sourceType: 'document', topicId: 'concept-1', sourceId: id('4'), version: 'a'.repeat(64), label: 'Physical page 1', page: 1, section: null, excerpt: 'Text',
            locator: { schemaVersion: 'petros.document-source.v1', kind: 'pdf_page_text', sourceVersion: 'a'.repeat(64),
              objectId: id('4'), unitId: id('5'), page: 1, textSha256: 'b'.repeat(64), start: 0, end: 4, offsetEncoding: 'utf16' } }],
        });
        expect(previousReader.safeParse(enriched).success).toBe(false);
        const previous = previousReader.parse(petrosSessionIntentV1(enriched));
        expect(previous).not.toHaveProperty('documentReadiness');
        expect(previous.citations[0]).not.toHaveProperty('locator');
        expect(previous.citations[0]).not.toHaveProperty('topicId');
        expect(previous.planning).not.toHaveProperty('organization');
        expect(previous.planning!.topics).toHaveLength(12);
        expect(previous.planning!.topics[0]).not.toHaveProperty('prerequisites');
        expect(previous.planning!.estimatedTotalMinutes).toBe(1_440);
        expect(enriched.planning!.topics).toHaveLength(32);
        expect(petrosSessionIntentSchema.parse(previous)).toEqual(previous);
      }
    },
  );

  it('requires a transferred question only for an assistant handoff', () => {
    const result = resolvePetrosSessionIntentSchema.safeParse({
      door: 'assistant_handoff', sourceId: '/results', idempotencyKey: id('1'), timeBudgetSeconds: 900,
    });
    expect(result.success).toBe(false);
    expect(petrosAssistantQuestionSchema.safeParse({ question: 'When is it?', route: '/exams', idempotencyKey: id('2') }).success).toBe(true);
    expect(petrosAssistantQuestionSchema.safeParse({
      question: 'What is this?',
      route: '/assignments',
      sourceId: id('3'),
      selectedCard: { title: 'Cloud revision', description: 'Due tomorrow', href: `/assignments/${id('3')}` },
      idempotencyKey: id('4'),
    }).success).toBe(true);
  });

  it('rejects external return URLs and unbounded emotional labels', () => {
    expect(resolvePetrosSessionIntentSchema.safeParse({ door: 'result_repair', sourceId: id('1'), idempotencyKey: id('2'), route: 'https://example.com' }).success).toBe(false);
    expect(petrosSessionIntentSchema.shape.emotionalRegister.safeParse('clinically_depressed').success).toBe(false);
  });

  it('accepts a bounded pre-teaching selection and rejects unknown priorities', () => {
    expect(startPetrosSessionIntentSchema.safeParse({
      idempotencyKey: id('1'),
      plan: { topicId: 'topic-1-2', priority: 'exam_prep', timeBudgetSeconds: 900, existingDoubt: 'Why does this happen?' },
    }).success).toBe(true);
    expect(startPetrosSessionIntentSchema.safeParse({
      idempotencyKey: id('1'),
      plan: { topicId: 'topic-1-2', priority: 'get_answers', timeBudgetSeconds: 900, existingDoubt: null },
    }).success).toBe(false);
  });
});
