import { describe, expect, it, vi } from 'vitest';
import { PetrosPortalSpeechService } from './petros-portal-speech.service';

const principal = { institutionId: 'fixture-institution', studentId: 'fixture-student' } as never;
function fixture() {
  const provider = { enabled: true, paused: false, healthStatus: 'healthy', credentialEnvelope: 'SYNTHETIC', adapterType: 'openai', key: 'fixture' };
  const model = { enabled: true, modelKey: 'tts-1', providerOptions: { pricingUnit: 'character', priceMicrosPerMillionCharacters: 15_000_000 } as Record<string, unknown> };
  const routing = { previewRoute: vi.fn(async () => ({ selected: { providerId: 'p', modelId: 'm', routeId: 'r' } })) };
  const service = new PetrosPortalSpeechService(routing as never, { findProvider: async () => provider, findModel: async () => model } as never, { PETROS_AI_MODE: 'live' } as never);
  return { service, model, provider, routing };
}
describe('portal model-qualified voice choices', () => {
  it('offers supported legacy alternatives and requires an explicit replacement for stale Cedar/Marin', async () => {
    const f = fixture(); const options = await f.service.options(principal);
    expect(options.voices).toContain('onyx'); expect(options.voices).toContain('nova'); expect(options.voices).not.toContain('cedar');
    for (const voice of ['cedar', 'marin'] as const) await expect(f.service.validate(principal, voice)).rejects.toMatchObject({ response: { code: 'PETROS_UNSUPPORTED_VOICE', supportedVoices: options.voices } });
    await expect(f.service.validate(principal, 'nova')).resolves.toMatchObject({ modelKey: 'tts-1' });
    expect(JSON.stringify(options)).not.toContain('SYNTHETIC');
  });
  it.each(['missing-key', 'paused', 'unhealthy', 'disabled-model', 'unpriced', 'invalid-price', 'routing-denied'] as const)('fails clearly for %s', async reason => {
    const f = fixture();
    if (reason === 'missing-key') f.provider.credentialEnvelope = '';
    if (reason === 'paused') f.provider.paused = true;
    if (reason === 'unhealthy') f.provider.healthStatus = 'down';
    if (reason === 'disabled-model') f.model.enabled = false;
    if (reason === 'unpriced') f.model.providerOptions = {};
    if (reason === 'invalid-price') f.model.providerOptions.priceMicrosPerMillionCharacters = Infinity;
    if (reason === 'routing-denied') f.routing.previewRoute.mockRejectedValue(new Error('budget or authorization'));
    expect(await f.service.options(principal)).toMatchObject({ state: 'unavailable', voices: [] });
    await expect(f.service.validate(principal, 'onyx')).rejects.toMatchObject({ response: { code: 'PETROS_SPEECH_UNAVAILABLE' } });
  });
  it('narrows names to an account-specific qualification list', async () => {
    const f = fixture(); f.model.providerOptions.qualifiedSpeechVoices = ['nova'];
    expect((await f.service.options(principal)).voices).toEqual(['nova']);
  });
  it('keeps Mini TTS unavailable even when incorrectly assigned a character price', async () => {
    const f = fixture(); f.model.modelKey = 'gpt-4o-mini-tts';
    expect(await f.service.options(principal)).toMatchObject({ state: 'unavailable', voices: [], reason: expect.stringContaining('output-audio-token') });
  });
});
