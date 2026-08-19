import { describe, expect, it } from 'vitest';
import {
  documentQuestionFromSourceContext,
  documentRetryPrompt,
  documentStudyQuestions,
} from './petros-document-grounding';

describe('Petros document grounding', () => {
  it('extracts numbered teacher questions without treating the document title as a concept question', () => {
    const questions = documentStudyQuestions([
      'MODULE 1 REVISION QUESTIONS\n1. Why is grid computing considered the predecessor of cloud computing? Explain.\n2. Differentiate public, private, hybrid, and community cloud deployment models.',
    ]);

    expect(questions).toEqual([
      'Why is grid computing considered the predecessor of cloud computing?',
      'Differentiate public, private, hybrid, and community cloud deployment models.',
    ]);
  });

  it('selects a real question from an uploaded-document citation for each move', () => {
    const context = {
      door: 'uploaded_document',
      citations: [
        {
          excerpt:
            '1. Why is grid computing considered the predecessor of cloud computing?\n2. How does IaaS divide responsibility?',
        },
      ],
    };

    expect(documentQuestionFromSourceContext(context, 1)).toMatch(/^Why is grid computing/);
    expect(documentQuestionFromSourceContext(context, 2)).toBe(
      'How does IaaS divide responsibility?',
    );
  });

  it('creates a meaningful retry instead of stacking internal retry prefixes', () => {
    expect(
      documentRetryPrompt('Why is grid computing considered the predecessor of cloud computing?'),
    ).toBe(
      'What features of grid computing explain why it is considered the predecessor of cloud computing?',
    );
  });
});
