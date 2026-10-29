import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { PetrosVoicePreviewService } from './petros-voice-preview.service';
import { previewWavDuration, voicePreviewSpeechSchema, voicePreviewTranscriptionSchema } from './petros-voice-preview.contract';
import { PetrosVoicePreviewController, withPreviewDisconnect } from './petros-voice-preview.controller';
import { resolveOwnedTransactions } from '../core/student-owned-transactions';

const studentId = '00000000-0000-4000-8000-000000000001';
const routeId = '00000000-0000-4000-8000-000000000002';
const principal = { kind: 'institutional', institutionId: '00000000-0000-4000-8000-000000000003', studentId, permissions: ['student.learn.use'] };
function wav(seconds = 1) {
  const b = Buffer.alloc(44 + Math.round(seconds * 32_000));
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16_000, 24); b.writeUInt32LE(32_000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(b.length - 44, 40);
  return b;
}
function fixture(overrides: Record<string, unknown> = {}) {
  const env = { NODE_ENV: 'test', PETROS_AI_MODE: 'live', REDIS_ENABLED: true,
    PETROS_V2_COMPANION_PLAYGROUND_ENABLED: true, PETROS_V2_COMPANION_PLAYGROUND_TESTER_IDS: studentId,
    PETROS_V2_VOICE_PREVIEW_ENABLED: true, PETROS_V2_VOICE_PREVIEW_PAID_APPROVED: true, PETROS_V2_VOICE_PREVIEW_ISOLATED_APPROVED: true,
    PETROS_V2_VOICE_PREVIEW_APPROVAL_ID: 'synthetic-approval', PETROS_V2_VOICE_PREVIEW_APPROVAL_EXPIRES_AT: new Date(Date.now() + 3_600_000).toISOString(),
    PETROS_V2_VOICE_PREVIEW_MAX_TOTAL_COST_MICROS: 750_000, PETROS_V2_VOICE_PREVIEW_MAX_CALL_COST_MICROS: 10_000, ...overrides };
  const gateway = { execute: vi.fn(async (_request: unknown) => ({ content: { dataBase64: 'AA==', mimeType: 'audio/wav', effectiveVoice: 'onyx' },
    routeId, routeFallbackUsed: false, providerKey: 'openai-live-eval', modelKey: 'tts-1', estimatedCostMicros: 300, actualCostMicros: 300, responseTimeMs: 50 })) };
  const routing = { previewRoute: vi.fn(async (context) => ({ selected: { routeId, providerId: context.functionKey, modelId: context.functionKey } })) };
  const repo = {
    findProvider: vi.fn(async (key) => ({ key: key === 'speech.transcribe' ? 'groq' : 'openai-live-eval', enabled: true, paused: false, healthStatus: 'healthy', adapterType: 'openai_compatible', credentialEnvelope: 'synthetic-only-never-return' })),
    findModel: vi.fn(async (key) => key === 'speech.transcribe'
      ? { enabled: true, modelKey: 'whisper-large-v3-turbo', providerOptions: { pricingUnit: 'audio_hour', priceMicrosPerHour: 40_000 } }
      : { enabled: true, modelKey: 'tts-1', providerOptions: { pricingUnit: 'character', priceMicrosPerMillionCharacters: 15_000_000 } }),
  };
  const redis = { enabled: true, acquireStudentQuota: vi.fn(async () => ({ allowed: true })) };
  const transactionState = { active: 0, committed: 0 };
  const db = { transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
    transactionState.active++;
    try { const result = await work({ execute: vi.fn(async () => []) }); transactionState.committed++; return result; }
    finally { transactionState.active--; }
  }) };
  const service = new PetrosVoicePreviewService(env as never, gateway as never, routing as never, repo as never, redis as never, db as never);
  return { service, gateway, routing, repo, redis, env, db, transactionState };
}

describe('internal voice preview safety and effective routes (mocked, zero paid calls)', () => {
  it.each([
    { PETROS_V2_VOICE_PREVIEW_ENABLED: false }, { PETROS_V2_VOICE_PREVIEW_PAID_APPROVED: false },
    { PETROS_V2_VOICE_PREVIEW_ISOLATED_APPROVED: false }, { NODE_ENV: 'production' }, { REDIS_ENABLED: false },
    { PETROS_AI_MODE: 'demo' }, { PETROS_V2_VOICE_PREVIEW_MAX_TOTAL_COST_MICROS: 0 },
    { PETROS_V2_VOICE_PREVIEW_APPROVAL_ID: '' }, { PETROS_V2_VOICE_PREVIEW_APPROVAL_EXPIRES_AT: '2020-01-01T00:00:00Z' },
  ])('fails closed before any route/database/provider operation: %j', async (overrides) => {
    const f = fixture(overrides);
    expect(await f.service.status(principal as never)).toMatchObject({ state: 'authorization_required', tts: [], stt: [] });
    await expect(f.service.speech(principal as never, { routeId, voice: 'onyx', text: 'Public example.' })).rejects.toMatchObject({ status: 403 });
    expect(f.routing.previewRoute).not.toHaveBeenCalled(); expect(f.repo.findProvider).not.toHaveBeenCalled(); expect(f.gateway.execute).not.toHaveBeenCalled();
    expect(f.db.transaction).not.toHaveBeenCalled();
  });
  it('retains authenticated allowlist and permission admission', async () => {
    const f = fixture();
    await expect(f.service.status({ ...principal, studentId: routeId } as never)).rejects.toMatchObject({ status: 404 });
    await expect(f.service.status({ ...principal, permissions: [] } as never)).rejects.toMatchObject({ status: 404 });
    await expect(f.service.status({ ...principal, passwordChangeRequired: true } as never)).rejects.toMatchObject({ status: 404 });
    expect(f.routing.previewRoute).not.toHaveBeenCalled();
  });
  it('returns only sanitized supported effective route metadata with no provider dispatch', async () => {
    const f = fixture(); const status = await f.service.status(principal as never);
    expect(status).toMatchObject({ state: 'ready', tts: [{ modelKey: 'tts-1', format: 'audio/wav', estimatedCostMicros: 7500 }], stt: [{ modelKey: 'whisper-large-v3-turbo', minimumBillableSeconds: 10, estimatedCostMicros: 112 }] });
    expect(status.tts[0]!.voices).toContain('nova'); expect(status.tts[0]!.voices).not.toContain('cedar');
    expect(JSON.stringify(status)).not.toContain('synthetic-only-never-return'); expect(f.gateway.execute).not.toHaveBeenCalled();
  });
  it('rejects route/voice mismatch before reserving or dispatching', async () => {
    const f = fixture();
    await expect(f.service.speech(principal as never, { routeId, voice: 'cedar', text: 'Public example.' })).rejects.toMatchObject({ response: { code: 'PETROS_PREVIEW_UNSUPPORTED_VOICE' } });
    await expect(f.service.speech(principal as never, { routeId: studentId, voice: 'onyx', text: 'Public example.' })).rejects.toMatchObject({ response: { code: 'PETROS_PREVIEW_ROUTE_CHANGED' } });
    expect(f.redis.acquireStudentQuota).not.toHaveBeenCalled(); expect(f.gateway.execute).not.toHaveBeenCalled();
  });
  it('dispatches through the existing gateway with strict selection, no cache/retries/fallback and bounded accounting', async () => {
    const f = fixture(); const abort = new AbortController();
    expect(await f.service.speech(principal as never, { routeId, voice: 'onyx', text: 'Public example.' }, abort.signal)).toMatchObject({
      effective: { modelKey: 'tts-1', voice: 'onyx' }, actualCostMicros: null, estimatedCostMicros: 300, audio: { mimeType: 'audio/wav' } });
    expect(f.redis.acquireStudentQuota).toHaveBeenCalledWith(expect.objectContaining({ globalLimit: 75, scopeLimit: 75, ttlSeconds: 604800 }));
    expect(f.gateway.execute).toHaveBeenCalledWith(expect.objectContaining({ signal: abort.signal, disableCache: true, maxRetries: 0, maxRouteAttempts: 1,
      speech: { voice: 'onyx', speed: 1, strictVoice: true }, databaseScope: expect.any(Function), routeConstraint: expect.objectContaining({ routeId, modelKey: 'tts-1', maxModalityCostMicros: 10_000 }) }));
  });
  it.each([null, { allowed: false }])('accounting outage/exhaustion prevents dispatch (%j)', async (result) => {
    const f = fixture(); f.redis.acquireStudentQuota.mockResolvedValue(result as never);
    await expect(f.service.speech(principal as never, { routeId, voice: 'onyx', text: 'Public example.' })).rejects.toMatchObject({ response: { code: 'PETROS_PREVIEW_SPENDING_LIMIT' } });
    expect(f.gateway.execute).not.toHaveBeenCalled();
  });
  it('pre-aborted generation never reserves or dispatches', async () => {
    const f = fixture(); const abort = new AbortController(); abort.abort();
    await expect(f.service.speech(principal as never, { routeId, voice: 'onyx', text: 'Public example.' }, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.redis.acquireStudentQuota).not.toHaveBeenCalled(); expect(f.gateway.execute).not.toHaveBeenCalled();
  });
  it('rejects mismatched effective voice audio instead of presenting the requested name', async () => {
    const f = fixture(); f.gateway.execute.mockResolvedValue({ content: { dataBase64: 'AA==', mimeType: 'audio/wav', effectiveVoice: 'nova' } } as never);
    await expect(f.service.speech(principal as never, { routeId, voice: 'onyx', text: 'Public example.' })).rejects.toMatchObject({ response: { code: 'PETROS_PREVIEW_INVALID_AUDIO' } });
  });
  it('transcribes verified WAV through gateway with minimum billed duration and explicit consent', async () => {
    const f = fixture(); f.gateway.execute.mockResolvedValue({ routeId, routeFallbackUsed: false, content: { text: 'What is the slope?' }, providerKey: 'groq', modelKey: 'whisper-large-v3-turbo', estimatedCostMicros: 111, responseTimeMs: 50 } as never);
    const result = await f.service.transcription(principal as never, { routeId, consent: true, audio: { mimeType: 'audio/wav', dataBase64: wav(1).toString('base64') } });
    expect(result).toMatchObject({ transcript: 'What is the slope?', recordingDurationMs: 1000, effective: { voice: null, modelKey: 'whisper-large-v3-turbo' } });
    expect(f.gateway.execute).toHaveBeenCalledWith(expect.objectContaining({ routeConstraint: expect.objectContaining({ units: { audioSeconds: 10 } }), metadata: expect.objectContaining({ consent: true, transient: true }) }));
  });
  it('blocks Mini TTS even with misleading character pricing and explains the metering dependency', async () => {
    const f = fixture(); f.repo.findModel.mockResolvedValue({ enabled: true, modelKey: 'gpt-4o-mini-tts', providerOptions: { pricingUnit: 'character', priceMicrosPerMillionCharacters: 15_000_000 } } as never);
    expect(await f.service.status(principal as never)).toMatchObject({ tts: [], ttsUnavailableReason: expect.stringContaining('output-audio-token') });
    await expect(f.service.speech(principal as never, { routeId, voice: 'cedar', text: 'Public example.' })).rejects.toMatchObject({ response: { code: 'PETROS_PREVIEW_UNAVAILABLE' } });
    expect(f.redis.acquireStudentQuota).not.toHaveBeenCalled(); expect(f.gateway.execute).not.toHaveBeenCalled();
  });
  it.each([{ enabled: false }, { paused: true }, { healthStatus: 'down' }, { credentialEnvelope: null }])('rejects unavailable preview providers before a reservation: %j', async patch => {
    const f = fixture(); const original = await f.repo.findProvider('speech.synthesise');
    f.repo.findProvider.mockResolvedValue({ ...original, ...patch } as never);
    expect(await f.service.status(principal as never)).toMatchObject({ state: 'unavailable', tts: [], stt: [] });
    await expect(f.service.speech(principal as never, { routeId, voice: 'onyx', text: 'Public example.' })).rejects.toMatchObject({ response: { code: 'PETROS_PREVIEW_UNAVAILABLE' } });
    expect(f.redis.acquireStudentQuota).not.toHaveBeenCalled(); expect(f.gateway.execute).not.toHaveBeenCalled();
  });
  it('narrows documented voices to the configured account subset and rejects disabled models', async () => {
    const f = fixture(); const original = await f.repo.findModel('speech.synthesise');
    f.repo.findModel.mockResolvedValue({ ...original, providerOptions: { ...original.providerOptions, qualifiedSpeechVoices: ['nova'] } } as never);
    expect(await f.service.status(principal as never)).toMatchObject({ tts: [{ voices: ['nova'] }] });
    await expect(f.service.speech(principal as never, { routeId, voice: 'onyx', text: 'Public example.' })).rejects.toMatchObject({ response: { code: 'PETROS_PREVIEW_UNSUPPORTED_VOICE' } });
    f.repo.findModel.mockResolvedValue({ ...original, enabled: false } as never);
    await expect(f.service.speech(principal as never, { routeId, voice: 'onyx', text: 'Public example.' })).rejects.toMatchObject({ response: { code: 'PETROS_PREVIEW_UNAVAILABLE' } });
    expect(f.redis.acquireStudentQuota).not.toHaveBeenCalled(); expect(f.gateway.execute).not.toHaveBeenCalled();
  });
  it('discards a mismatched successful route instead of relabeling its audio', async () => {
    const f = fixture(); f.gateway.execute.mockResolvedValue({ routeId: studentId, providerKey: 'other', modelKey: 'tts-1', content: { dataBase64: 'AA==', mimeType: 'audio/wav', effectiveVoice: 'onyx' } } as never);
    await expect(f.service.speech(principal as never, { routeId, voice: 'onyx', text: 'Public example.' })).rejects.toMatchObject({ response: { code: 'PETROS_PREVIEW_ROUTE_CHANGED' } });
  });
  it('bounds malformed/empty/long audio and payload fields before dispatch', () => {
    expect(previewWavDuration(wav(10).toString('base64'))).toBe(10);
    for (const bytes of [wav(0), wav(10.01), Buffer.from('not a wav')]) expect(() => previewWavDuration(bytes.toString('base64'))).toThrow();
    const altered = wav(1); altered.writeUInt32LE(1, 40); expect(() => previewWavDuration(altered.toString('base64'))).toThrow();
    expect(voicePreviewSpeechSchema.safeParse({ routeId, voice: 'onyx', text: 'x'.repeat(501) }).success).toBe(false);
    expect(voicePreviewTranscriptionSchema.safeParse({ routeId, consent: false, audio: { mimeType: 'audio/wav', dataBase64: wav().toString('base64') } }).success).toBe(false);
  });
  it('forwards HTTP disconnect cancellation and removes handlers afterward', async () => {
    const req = new EventEmitter(); const res = new EventEmitter(); let signal: AbortSignal | undefined;
    const result = withPreviewDisconnect(req as never, res as never, async (s) => { signal = s; res.emit('close'); return 'cancelled'; });
    expect(await result).toBe('cancelled'); expect(signal?.aborted).toBe(true);
    expect(req.listenerCount('aborted')).toBe(0); expect(res.listenerCount('close')).toBe(0);
  });
  it('owns short owner-scoped transactions and commits accounting independently of a provider failure', async () => {
    const f = fixture(); const failure = new Error('Synthetic provider failure'); let retainedUsage = 0;
    expect(resolveOwnedTransactions(PetrosVoicePreviewController.prototype.speech, PetrosVoicePreviewController)).toBe(true);
    f.routing.previewRoute.mockImplementation(async () => {
      expect(f.transactionState.active).toBe(1);
      return { selected: { routeId, providerId: 'speech.synthesise', modelId: 'speech.synthesise' } };
    });
    f.gateway.execute.mockImplementation(async (request: unknown) => {
      const raw = request as { databaseScope: <T>(work: () => Promise<T>) => Promise<T> };
      expect(f.transactionState.active).toBe(0);
      await raw.databaseScope(async () => { expect(f.transactionState.active).toBe(1); retainedUsage++; });
      expect(f.transactionState.active).toBe(0);
      throw failure;
    });
    await expect(f.service.speech(principal as never, { routeId, voice: 'onyx', text: 'Public example.' })).rejects.toBe(failure);
    expect(f.transactionState).toEqual({ active: 0, committed: 3 }); expect(retainedUsage).toBe(1);
  });
});

describe('actionable voice service status and fail-closed prices', () => {
  it.each([
    [{ PETROS_V2_VOICE_PREVIEW_ENABLED: false }, 'preview_disabled'],
    [{ PETROS_V2_VOICE_PREVIEW_PAID_APPROVED: false }, 'spending_approval_required'],
    [{ PETROS_V2_VOICE_PREVIEW_ISOLATED_APPROVED: false }, 'isolated_runtime_required'],
    [{ PETROS_V2_VOICE_PREVIEW_APPROVAL_EXPIRES_AT: '2000-01-01' }, 'spending_approval_required'],
    [{ PETROS_V2_VOICE_PREVIEW_MAX_CALL_COST_MICROS: 0 }, 'spending_approval_required'],
    [{ PETROS_V2_VOICE_PREVIEW_MAX_TOTAL_COST_MICROS: NaN }, 'spending_approval_required'],
  ])('returns a distinct safe prerequisite %j', async (env, reasonCode) => {
    const f = fixture(env); expect(await f.service.status(principal as never)).toMatchObject({ reasonCode });
    expect(f.gateway.execute).not.toHaveBeenCalled(); expect(f.db.transaction).not.toHaveBeenCalled();
  });
  it('distinguishes disabled backend admission from tester authorization', async () => {
    const f = fixture({ PETROS_V2_COMPANION_PLAYGROUND_ENABLED: false });
    await expect(f.service.status(principal as never)).rejects.toMatchObject({ response: { code: 'PETROS_PREVIEW_DISABLED' } });
    f.env.PETROS_V2_COMPANION_PLAYGROUND_ENABLED = true;
    await expect(f.service.status({ ...principal, studentId: routeId } as never)).rejects.toMatchObject({ response: { code: 'PETROS_PREVIEW_TESTER_REQUIRED' } });
  });
  it.each([0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid prices before spend: %s', async price => {
    const f = fixture(); f.repo.findModel.mockResolvedValue({ enabled: true, modelKey: 'tts-1', providerOptions: { pricingUnit: 'character', priceMicrosPerMillionCharacters: price } } as never);
    expect(await f.service.status(principal as never)).toMatchObject({ reasonCode: 'no_qualified_provider', tts: [] });
    await expect(f.service.speech(principal as never, { routeId, voice: 'onyx', text: 'Public example.' })).rejects.toMatchObject({ status: 502 });
    expect(f.redis.acquireStudentQuota).not.toHaveBeenCalled(); expect(f.gateway.execute).not.toHaveBeenCalled();
  });
  it('reports a database/routing failure without exposing its raw details', async () => {
    const f = fixture(); f.routing.previewRoute.mockRejectedValue(new Error('secret database role failure'));
    const status = await f.service.status(principal as never);
    expect(status).toMatchObject({ reasonCode: 'temporary_service_failure', state: 'unavailable' });
    expect(JSON.stringify(status)).not.toContain('secret'); expect(f.gateway.execute).not.toHaveBeenCalled();
  });
});
