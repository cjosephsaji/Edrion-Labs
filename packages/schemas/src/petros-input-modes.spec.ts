import { describe, expect, it } from 'vitest';
import {
  createPetrosMediaIntentSchema,
  petrosHandwritingEvaluationSchema,
  petrosHandwritingRecognitionSchema,
  petrosQuestionExtractionSchema,
  submitPetrosVoiceTurnSchema,
} from './petros-input-modes';

const region = { x: 0.1, y: 0.2, width: 0.7, height: 0.2 };

describe('Petros input-mode schemas', () => {
  it('rejects undeclared upload fields and invalid media dimensions', () => {
    const base = {
      kind: 'question_photo',
      filename: 'question.png',
      declaredMimeType: 'image/png',
      sizeBytes: 1_024,
      durationSeconds: null,
      width: 1_200,
      height: 900,
      pageIndex: 0,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    };
    expect(createPetrosMediaIntentSchema.safeParse(base).success).toBe(true);
    expect(createPetrosMediaIntentSchema.safeParse({ ...base, width: 0 }).success).toBe(false);
    expect(createPetrosMediaIntentSchema.safeParse({ ...base, providerApiKey: 'never' }).success).toBe(false);
  });

  it('models multiple photographed questions, low-quality warnings, and student selection', () => {
    const result = petrosQuestionExtractionSchema.parse({
      questions: [
        { id: 'q1', text: 'Find x.', context: 'Diagram A', confidence: 0.91, region, hasDiagram: true, diagramDescription: 'A triangle.', warnings: [] },
        { id: 'q2', text: 'Explain why.', context: '', confidence: 0.51, region: { ...region, y: 0.6 }, hasDiagram: false, diagramDescription: null, warnings: ['Glare obscures one symbol.'] },
      ],
      overallConfidence: 0.62,
      requiresStudentSelection: true,
      requiresRetake: false,
      retakeGuidance: ['Select the intended question and correct the obscured symbol.'],
    });
    expect(result.questions).toHaveLength(2);
    expect(result.requiresStudentSelection).toBe(true);
    expect(result.questions[1]?.warnings[0]).toContain('Glare');
  });

  it('keeps handwriting order, coordinates, uncertainty, and first-break consequences explicit', () => {
    const recognition = petrosHandwritingRecognitionSchema.parse({
      overallConfidence: 0.58,
      requiresCorrection: true,
      lines: [
        { id: 'line-1', order: 1, text: '2x = 6', confidence: 0.96, region, uncertainTokens: [] },
        { id: 'line-2', order: 2, text: 'x = 6 - 2', confidence: 0.43, region: { ...region, y: 0.5 }, uncertainTokens: ['-'] },
      ],
      pageWarnings: ['Confirm line 2 before critique.'],
    });
    const evaluation = petrosHandwritingEvaluationSchema.parse({
      overallConfidence: 0.93,
      firstBreakLineId: 'line-2',
      markLosingLineIds: ['line-2'],
      lines: [
        { lineId: 'line-1', status: 'correct', category: 'none', consequenceOfLineId: null, feedback: 'Valid.', graderCircle: null, markImpact: null, confidence: 0.99 },
        { lineId: 'line-2', status: 'first_break', category: 'method', consequenceOfLineId: null, feedback: 'Division is required.', graderCircle: '6 - 2', markImpact: 'Method mark lost.', confidence: 0.94 },
        { lineId: 'line-3', status: 'consequence_error', category: 'arithmetic', consequenceOfLineId: 'line-2', feedback: 'This follows the earlier break.', graderCircle: '4', markImpact: null, confidence: 0.92 },
      ],
      teachingStep: 'Divide both sides by the coefficient.',
      reattemptPrompt: 'Rewrite line 2 only.',
      accessibleSummary: 'The first break is line 2; line 3 is a consequence.',
      uncertaintyDisclosure: null,
    });
    expect(recognition.lines.map((line) => line.order)).toEqual([1, 2]);
    expect(evaluation.lines[2]).toMatchObject({ status: 'consequence_error', consequenceOfLineId: 'line-2' });
  });

  it('requires an explicit transcript source and keeps interruption separate from language', () => {
    const result = submitPetrosVoiceTurnSchema.parse({
      mediaId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      transcriptCorrection: 'Mujhe denominator samajh nahi aaya.',
      confidence: 'think_so',
      language: 'hi-en',
      mixedLanguage: true,
      interruptPrevious: true,
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    });
    expect(result).toMatchObject({ mixedLanguage: true, interruptPrevious: true });
  });
});
