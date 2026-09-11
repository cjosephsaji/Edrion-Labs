import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  petrosDocumentTeachingPlanSchema,
  petrosDocumentTeachingProgressSchema,
  petrosDocumentTeachingStateSchema,
  type PetrosLearningSessionDocument,
} from '@edrion/schemas';
import { PetrosDocumentTeaching } from './petros-document-teaching';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  speak: vi.fn(),
  stop: vi.fn(),
}));
const apiMock = {
  get: mocks.get,
  post: mocks.post,
};
const plan = petrosDocumentTeachingPlanSchema.parse({
  schemaVersion: 'petros.document-teaching.v1',
  experience: 'document-teaching-v1',
  generatorVersion: 'test',
  documentId: '11111111-1111-4111-8111-111111111111',
  documentVersion: 1,
  sourceFingerprint: 'a'.repeat(64),
  topicId: 'topic-1',
  title: 'Water cycle',
  overview: 'Follow how water changes and moves.',
  objectives: ['Explain the cycle'],
  prerequisites: [],
  sourceComplete: true,
  sourcePageCount: 2,
  coveredPages: [2, 3],
  generatedAt: new Date().toISOString(),
  scenes: [
    {
      id: 'scene-1',
      title: 'Notice the movement',
      concept: 'Evaporation',
      introduction: 'Water can move into the air.',
      explanation:
        'Heat gives water particles enough energy to leave the surface.',
      question: 'Explain evaporation in your own words.',
      activity: 'annotated_text',
      responseType: 'explanation',
      choices: [],
      hint: 'Connect heat to movement.',
      example: 'A puddle shrinking in sunlight.',
      sourceRefs: [{ page: 2 }],
      target: 'center',
    },
    {
      id: 'scene-2',
      title: 'Apply the idea',
      concept: 'Condensation',
      introduction: 'Now use the model.',
      explanation: 'Cooling can bring water back together.',
      question: 'What would you predict on a cold surface?',
      activity: 'scenario',
      responseType: 'explanation',
      choices: [],
      hint: 'Start with cooling.',
      example: 'Drops on a chilled glass.',
      sourceRefs: [{ page: 3 }],
      target: 'right',
    },
  ],
  diagnostic: {
    prompt: 'What do you already know?',
    responseType: 'explanation',
    choices: [],
    hint: 'A sentence is enough.',
  },
});
const state = () =>
  petrosDocumentTeachingStateSchema.parse({
    experience: 'document-teaching-v1',
    plan,
    scene: 0,
    unlocked: 0,
    mode: null,
    level: 'balanced',
    diagnosticComplete: false,
    scenes: Object.fromEntries(
      plan.scenes.map((scene) => [
        scene.id,
        petrosDocumentTeachingProgressSchema.parse({}),
      ]),
    ),
    commands: [],
  });

vi.mock('@/lib/api-client', () => ({
  useStudentApi: () => apiMock,
  newIdempotencyKey: () => '11111111-1111-4111-8111-111111111111',
  formatApiError: (error: Error) => error.message,
}));
vi.mock('./use-petros-voice', () => ({
  usePetrosVoice: () => ({
    speak: mocks.speak,
    stopSpeaking: mocks.stop,
    startListening: vi.fn(),
    stopListening: vi.fn(),
    speaking: false,
    listening: false,
  }),
}));
vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} />
  ),
}));

let document: PetrosLearningSessionDocument;
beforeEach(() => {
  vi.clearAllMocks();
  document = {
    id: '22222222-2222-4222-8222-222222222222',
    version: 0,
    status: 'active',
    documentTeaching: state(),
  } as PetrosLearningSessionDocument;
  mocks.get.mockResolvedValue(structuredClone(document));
  mocks.post.mockImplementation(
    async (_path: string, action: Record<string, unknown>) => {
      if (action.action === 'mode')
        document.documentTeaching!.mode = action.mode as 'voice' | 'text';
      document.version += 1;
      return structuredClone(document);
    },
  );
});
afterEach(cleanup);

describe('Petros generic document teaching', () => {
  it('starts with a concrete learning goal while keeping audio optional', async () => {
    render(<PetrosDocumentTeaching sessionId={document.id} />);
    expect(await screen.findByRole('heading', { name: 'Explain the cycle' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start learning' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        expect.stringContaining('/document-teaching'),
        expect.objectContaining({ action: 'mode' }),
      ),
    );
  });

  it('renders source references and a skippable diagnostic', async () => {
    document.documentTeaching!.mode = 'text';
    mocks.get.mockResolvedValue(structuredClone(document));
    render(<PetrosDocumentTeaching sessionId={document.id} />);
    expect(await screen.findByRole('heading', { name: 'Choose where to begin' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start with the explanation' })).toBeTruthy();
  });

  it('lets learners continue through teaching without answering a question', async () => {
    document.documentTeaching!.mode = 'text';
    document.documentTeaching!.diagnosticComplete = true;
    Object.assign(document.documentTeaching!.plan.scenes[0]!, {
      phase: 'concrete_opening',
      purpose: 'teaching',
      response: { kind: 'none' },
      taskId: 'objective-1-explain',
    });
    mocks.get.mockResolvedValue(structuredClone(document));
    render(<PetrosDocumentTeaching sessionId={document.id} />);

    expect(await screen.findByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.queryByText('Explain evaporation in your own words.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(
      expect.stringContaining('/document-teaching'),
      expect.objectContaining({ action: 'complete', scene: 0 }),
    ));
  });
});
