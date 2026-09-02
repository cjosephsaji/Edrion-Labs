import { describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '@edrion/config';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { PetrosInputModesService, conciseSpokenText } from './petros-input-modes.service';

const principal: InstitutionalStudentPrincipal = {
  kind: 'institutional',
  institutionId: '11111111-1111-4111-8111-111111111111',
  campusId: null,
  institutionUserId: '22222222-2222-4222-8222-222222222222',
  studentId: '33333333-3333-4333-8333-333333333333',
  email: 'student@example.test',
  fullName: 'Test Student',
  lastAuthAt: new Date(),
  permissions: [],
};

const now = new Date('2026-08-12T12:00:00.000Z');

function media(patch: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    schemaVersion: 'petros.media.v1',
    institutionId: principal.institutionId,
    studentId: principal.studentId,
    storageObjectId: '55555555-5555-4555-8555-555555555555',
    sessionId: null,
    kind: 'question_photo',
    mode: 'snap_question',
    state: 'needs_confirmation',
    filename: 'question.png',
    declaredMimeType: 'image/png',
    detectedMimeType: 'image/png',
    sizeBytes: 256,
    durationMs: null,
    width: 640,
    height: 480,
    pageIndex: 0,
    transform: { rotationDegrees: 0, crop: null },
    checksumSha256: 'a'.repeat(64),
    duplicateOf: null,
    scanStatus: 'clean',
    structuredResult: {},
    correctionAudit: {},
    failureCode: null,
    idempotencyKey: '66666666-6666-4666-8666-666666666666',
    correlationId: '77777777-7777-4777-8777-777777777777',
    uploadExpiresAt: new Date(now.getTime() + 60_000),
    rawMediaExpiresAt: new Date(now.getTime() + 3_600_000),
    confirmedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

function harness(initial = media()) {
  let current = initial;
  const repo = {
    findMedia: vi.fn(async () => current),
    findMediaByKey: vi.fn(async () => undefined),
    dailyMediaCount: vi.fn(async () => 0),
    createMedia: vi.fn(),
    updateMedia: vi.fn(async (_scope, _id, patch) => { current = { ...current, ...patch, updatedAt: now }; return current; }),
    listJobs: vi.fn(async () => []),
    findJobByKey: vi.fn(async () => undefined),
    createJob: vi.fn(async (input) => ({ id: '88888888-8888-4888-8888-888888888888', createdAt: now, updatedAt: now, ...input })),
    updateJob: vi.fn(async () => undefined),
    recordEvent: vi.fn(async (input) => ({ id: '99999999-9999-4999-8999-999999999999', ...input })),
    findDuplicate: vi.fn(async () => undefined),
  };
  const storage = {
    getOwned: vi.fn(async () => ({ storageKey: 'petros/test', id: initial.storageObjectId })),
    readBuffer: vi.fn(async () => Buffer.from('voice fixture')),
  };
  const gateway = { execute: vi.fn() };
  const loop = {
    create: vi.fn(),
    continue: vi.fn(),
    document: vi.fn(),
  };
  const env = {
    NODE_ENV: 'test',
    SESSION_COOKIE_SECRET: 'test-cookie-secret',
    PETROS_MEDIA_SIGNING_SECRET: 'test-media-secret',
    PETROS_MEDIA_MAX_IMAGE_BYTES: 8_000_000,
    PETROS_MEDIA_MAX_AUDIO_BYTES: 4_000_000,
    PETROS_MEDIA_MAX_AUDIO_SECONDS: 45,
    PETROS_MEDIA_MAX_PIXELS: 20_000_000,
    PETROS_MEDIA_DAILY_UPLOAD_LIMIT: 30,
    PETROS_MEDIA_IMAGE_RETENTION_HOURS: 24,
    PETROS_MEDIA_AUDIO_RETENTION_HOURS: 2,
  } as ApiEnv;
  const audit = { logAudit: vi.fn() };
  const service = new PetrosInputModesService(repo as never, storage as never, gateway as never, loop as never, env, audit as never);
  return { service, repo, storage, gateway, loop, current: () => current };
}

describe('Petros input-mode service', () => {
  it('speaks the active prompt without leaking render schema metadata', () => {
    const result = conciseSpokenText({
      topic: 'photosynthesis',
      maxMoves: 5,
      blocks: [{
        status: 'current', sequence: 2,
        content: { schemaVersion: 'petros.render.v2', type: 'misconception_demolition', title: 'Plants and food', correction: 'Plants make glucose.' },
        questions: [{ active: true, prompt: 'Where does the carbon in glucose come from?', choices: [{ label: 'Soil' }, { label: 'Carbon dioxide' }], attempts: [] }],
      }],
    } as never);
    expect(result).toBe('Move 2 of 5. Where does the carbon in glucose come from? Options: Soil, Carbon dioxide.');
    expect(result).not.toContain('petros.render');
    expect(result.length).toBeLessThanOrEqual(360);
  });

  it('makes the student-corrected snapped question the source of truth and starts a bounded Doubt session', async () => {
    const extraction = {
      questions: [{ id: 'q1', text: 'Solve x + 2 = 7', context: '', confidence: 0.9, region: { x: 0, y: 0, width: 1, height: 1 }, hasDiagram: false, diagramDescription: null, warnings: [] }],
      overallConfidence: 0.9,
      requiresStudentSelection: false,
      requiresRetake: false,
      retakeGuidance: [],
    };
    const h = harness(media({ structuredResult: { questionExtraction: extraction } }));
    h.loop.create.mockResolvedValue({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', blocks: [], status: 'active' });
    const result = await h.service.confirmQuestion(principal, media().id, {
      selectedQuestionId: 'q1',
      correctedQuestion: 'Solve x + 3 = 7',
      stuckPoint: 'setting_up',
      idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    expect(h.loop.create).toHaveBeenCalledWith(principal, expect.objectContaining({
      sessionType: 'doubt',
      maxMoves: 3,
      learnerContext: expect.objectContaining({ photographedQuestion: 'Solve x + 3 = 7', correctionConfirmed: true }),
      sourceContext: expect.objectContaining({ door: 'snap_question' }),
    }));
    expect(result.opening).toMatchObject({ selected: 'setting_up', completeSolutionIncluded: false });
    expect(h.current().structuredResult).toMatchObject({ confirmedQuestion: { text: 'Solve x + 3 = 7', studentSourceOfTruth: true } });
    expect(h.current().correctionAudit).toMatchObject({ corrected: true });
    expect(JSON.stringify(h.current().correctionAudit)).not.toContain('Solve x + 2 = 7');
  });

  it('uses a typed question as the source of truth when photo processing has no capable route', async () => {
    const h = harness(media({ state: 'retryable_failure', failureCode: 'PETROS_QUESTION_EXTRACTION_UNAVAILABLE' }));
    h.loop.create.mockResolvedValue({ id: 'abababab-abab-4bab-8bab-abababababab', blocks: [], status: 'active' });
    await h.service.confirmQuestion(principal, media().id, {
      selectedQuestionId: 'manual',
      correctedQuestion: 'Why does the product rule appear in integration by parts?',
      stuckPoint: 'understanding',
      idempotencyKey: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
    });
    expect(h.loop.create).toHaveBeenCalledWith(principal, expect.objectContaining({
      sessionType: 'doubt',
      learnerContext: expect.objectContaining({ photographedQuestion: 'Why does the product rule appear in integration by parts?' }),
    }));
    expect(h.current().correctionAudit).toMatchObject({ corrected: true, extractedTextHash: null, manualFallback: true });
  });

  it('routes voice transcription through the independent speech function and bypasses cache', async () => {
    const voice = media({ kind: 'voice_turn', mode: 'voice', state: 'ready_for_processing', filename: 'turn.webm', declaredMimeType: 'audio/webm', detectedMimeType: 'audio/webm', durationMs: 10_000, width: null, height: null });
    const h = harness(voice);
    h.gateway.execute.mockResolvedValue({
      content: { text: 'The denominator changes.', language: 'en', confidence: 0.82, uncertainSegments: [] },
      requestId: 'request-1', providerKey: 'speech-provider', modelKey: 'stt-model', fallbackTier: 1, cached: false,
      functionKey: 'speech.transcribe', promptVersion: '1', schemaVersion: '1', estimatedCostMicros: 17, responseTimeMs: 240, retryCount: 1,
    });
    const result = await h.service.process(principal, voice.id, { idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', language: 'en' });
    expect(h.gateway.execute).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ functionKey: 'speech.transcribe', inputModality: 'audio', language: 'en' }),
      disableCache: true,
    }));
    expect(h.repo.createJob).toHaveBeenCalledWith(expect.objectContaining({ kind: 'speech_transcription', functionKey: 'speech.transcribe', maxAttempts: 3 }));
    expect(result.transcription).toMatchObject({ text: 'The denominator changes.', confidence: 0.82 });
    expect(h.repo.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ providerKey: 'speech-provider', modelKey: 'stt-model', cacheHit: false, fallbackTier: 1 }));
  });

  it('creates an exact finite five-minute session and records the explicit expansion guard', async () => {
    const h = harness();
    const session = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', blocks: [{ id: 'block-1' }], status: 'active' };
    h.loop.create.mockResolvedValue(session);
    const result = await h.service.startFiveMinute(principal, {
      concept: 'photosynthesis', goal: 'Understand the energy conversion', language: 'en', idempotencyKey: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    });
    expect(h.loop.create).toHaveBeenCalledWith(principal, expect.objectContaining({ timeBudgetSeconds: 300, maxMoves: 4, sourceContext: expect.objectContaining({ door: 'five_minute' }) }));
    expect(result.finitePromise).toEqual({ seconds: 300, moves: 4, expansionRequiresChoice: true });
    expect(h.repo.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ mode: 'five_minute', mediaUnits: { promisedSeconds: 300, maxMoves: 4 }, payload: { explicitExpansionRequired: true } }));
  });

  it('uses the caller tenant and student in every media lookup', async () => {
    const h = harness();
    (h.repo.findMedia as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    const other = { ...principal, institutionId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', studentId: '12121212-1212-4121-8121-121212121212' };
    await expect(h.service.read(other, media().id)).rejects.toMatchObject({ status: 404 });
    expect(h.repo.findMedia).toHaveBeenCalledWith({ institutionId: other.institutionId, studentId: other.studentId }, media().id);
  });
});
