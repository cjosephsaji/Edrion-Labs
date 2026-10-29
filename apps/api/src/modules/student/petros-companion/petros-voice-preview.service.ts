import { BadGatewayException, BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ApiEnv } from '@edrion/config';
import { runInStudentTenant, runOutsideTenant, type Database } from '@edrion/database';
import type { PetrosRouteContext } from '@edrion/schemas';
import type { z } from 'zod';
import { API_ENV, DATABASE } from '../../../common/tokens';
import { RedisService } from '../../../common/redis/redis.service';
import { PetrosAiGatewayService, type PetrosAiExecuteResult } from '../../petros-ai-routing/petros-ai-gateway.service';
import { PetrosAiRoutingRepository } from '../../petros-ai-routing/petros-ai-routing.repository';
import { PetrosAiRoutingService } from '../../petros-ai-routing/petros-ai-routing.service';
import { supportedSpeechVoices } from '../../petros-ai-routing/petros-speech-capabilities';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { previewWavDuration, VOICE_PREVIEW_LIMITS, voicePreviewSpeechSchema, voicePreviewTranscriptionSchema } from './petros-voice-preview.contract';

type FunctionKey = 'speech.synthesise' | 'speech.transcribe';
export interface PetrosPreviewRoute {
  routeId: string; providerKey: string; modelKey: string; voices: readonly string[];
  format: 'audio/wav' | null; estimatedCostMicros: number; priceUnit: 'character' | 'audio_hour';
  priceMicrosPerUnit: number; minimumBillableSeconds: number; timing: 'none' | 'input_segments';
}

/** Internal, public-sample diagnostic. Uses the existing gateway; owns no conversation engine. */
@Injectable()
export class PetrosVoicePreviewService {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv,
    private readonly gateway: PetrosAiGatewayService, private readonly routing: PetrosAiRoutingService,
    private readonly repo: PetrosAiRoutingRepository, private readonly redis: RedisService,
    @Inject(DATABASE) private readonly db: Database) {}

  /** Commit each metadata/accounting operation independently; never hold a transaction over HTTP. */
  private databaseScope(principal: InstitutionalStudentPrincipal) {
    return <T>(work: () => Promise<T>) => runOutsideTenant(() => runInStudentTenant(this.db,
      { institutionId: principal.institutionId, studentId: principal.studentId, institutionUserId: principal.institutionUserId }, work));
  }

  private admit(principal: InstitutionalStudentPrincipal) {
    const ids = this.env.PETROS_V2_COMPANION_PLAYGROUND_TESTER_IDS.split(',').map(id => id.trim()).slice(0, 32);
    if (!this.env.PETROS_V2_COMPANION_PLAYGROUND_ENABLED)
      throw new NotFoundException({ code: 'PETROS_PREVIEW_DISABLED', message: 'Voice Preview is disabled.' });
    if (!ids.includes(principal.studentId) || principal.passwordChangeRequired ||
      !(principal.permissions.includes('student.learn.use') || principal.permissions.includes('*')))
      throw new NotFoundException({ code: 'PETROS_PREVIEW_TESTER_REQUIRED', message: 'Voice-test authorization required.' });
  }

  private gate() {
    if (!this.env.PETROS_V2_VOICE_PREVIEW_ENABLED)
      return { code: 'preview_disabled', message: 'Voice Preview is disabled. No provider request has been made.' };
    if (!this.env.PETROS_V2_VOICE_PREVIEW_ISOLATED_APPROVED || this.env.NODE_ENV === 'production')
      return { code: 'isolated_runtime_required', message: 'An approved isolated non-production runtime with restricted database access is required.' };
    if (!this.env.PETROS_V2_VOICE_PREVIEW_PAID_APPROVED)
      return { code: 'spending_approval_required', message: 'Paid voice auditions require separate approval. No provider request has been made.' };
    const expires = Date.parse(this.env.PETROS_V2_VOICE_PREVIEW_APPROVAL_EXPIRES_AT);
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(this.env.PETROS_V2_VOICE_PREVIEW_APPROVAL_ID) || !Number.isFinite(expires) ||
      expires <= Date.now() || expires > Date.now() + 86_400_000 ||
      !Number.isSafeInteger(this.env.PETROS_V2_VOICE_PREVIEW_MAX_CALL_COST_MICROS) || this.env.PETROS_V2_VOICE_PREVIEW_MAX_CALL_COST_MICROS <= 0 ||
      !Number.isSafeInteger(this.env.PETROS_V2_VOICE_PREVIEW_MAX_TOTAL_COST_MICROS) ||
      this.env.PETROS_V2_VOICE_PREVIEW_MAX_TOTAL_COST_MICROS < this.env.PETROS_V2_VOICE_PREVIEW_MAX_CALL_COST_MICROS)
      return { code: 'spending_approval_required', message: 'A current approval identity, expiry within 24 hours and bounded spending envelope are required.' };
    if (this.env.PETROS_AI_MODE !== 'live' || !this.env.REDIS_ENABLED || !this.redis.enabled)
      return { code: 'accounting_unavailable', message: 'Live gateway mode and available shared audition accounting are required.' };
    return null;
  }
  private gateReason() { return this.gate()?.message ?? null; }

  private context(principal: InstitutionalStudentPrincipal, functionKey: FunctionKey): PetrosRouteContext {
    return { requestId: randomUUID(), functionKey, institutionId: principal.institutionId, studentId: principal.studentId,
      topic: 'approved public voice preview', sessionType: 'learn', inputModality: functionKey === 'speech.synthesise' ? 'text' : 'audio',
      language: 'en', estimatedTokens: 125, currentCostMicros: 0, previousFailures: 0, requiredResponseMs: 8_000 };
  }

  private async route(principal: InstitutionalStudentPrincipal, functionKey: FunctionKey): Promise<PetrosPreviewRoute> {
    const scope = this.databaseScope(principal);
    const plan = await scope(() => this.routing.previewRoute(this.context(principal, functionKey)));
    const candidate = plan.selected;
    if (!candidate) throw new Error('Unavailable preview route');
    const [provider, model] = await scope(() => Promise.all([this.repo.findProvider(candidate.providerId), this.repo.findModel(candidate.modelId)]));
    if (!provider?.credentialEnvelope || !provider.enabled || provider.paused || provider.healthStatus === 'down' || !model?.enabled ||
      !['openai', 'openai_compatible'].includes(provider.adapterType)) throw new Error('Unavailable preview route');
    const options = model.providerOptions;
    const configured = options.qualifiedSpeechVoices;
    const voices = functionKey === 'speech.synthesise' ? supportedSpeechVoices(model.modelKey)
      .filter(voice => !Array.isArray(configured) || configured.includes(voice)) : [];
    const speech = functionKey === 'speech.synthesise';
    // Input-audio minimum is provider-specific. Preview currently qualifies the installed Groq Whisper routes only.
    // Mini-TTS bills output audio tokens; a character-only setting cannot safely bound its cost.
    if (speech && model.modelKey.startsWith('gpt-4o-mini-tts')) throw new Error('MINI_TTS_METERING_UNBOUNDED');
    if (speech ? !['tts-1', 'tts-1-hd'].includes(model.modelKey) || !voices.length || options.pricingUnit !== 'character'
      : provider.key !== 'groq' || !['whisper-large-v3', 'whisper-large-v3-turbo'].includes(model.modelKey) || options.pricingUnit !== 'audio_hour') throw new Error('Unpriced preview route');
    const price = Number(speech ? options.priceMicrosPerMillionCharacters : options.priceMicrosPerHour);
    const minimum = speech ? 0 : Math.max(10, Number(options.minimumBillableSeconds ?? 0));
    const cost = speech ? Math.ceil(VOICE_PREVIEW_LIMITS.maxTextCharacters * price / 1_000_000)
      : Math.ceil(Math.max(VOICE_PREVIEW_LIMITS.maxRecordingSeconds, minimum) * price / 3_600);
    if (!Number.isSafeInteger(price) || price <= 0 || !Number.isFinite(minimum) || minimum < 0 || !Number.isSafeInteger(cost) || cost <= 0 || cost > this.env.PETROS_V2_VOICE_PREVIEW_MAX_CALL_COST_MICROS) throw new Error('Unbounded preview price');
    return { routeId: candidate.routeId, providerKey: provider.key, modelKey: model.modelKey, voices,
      format: speech ? 'audio/wav' : null, estimatedCostMicros: cost, priceUnit: speech ? 'character' : 'audio_hour',
      priceMicrosPerUnit: price, minimumBillableSeconds: minimum, timing: speech ? 'none' : 'input_segments' };
  }

  async status(principal: InstitutionalStudentPrincipal) {
    this.admit(principal);
    const gate = this.gate();
    const base = { limits: VOICE_PREVIEW_LIMITS, privacy: { transient: true, providerRetention: 'Provider account retention policies apply; do not record private learner or assessment content.' },
      maximumTotalCostMicros: this.env.PETROS_V2_VOICE_PREVIEW_MAX_TOTAL_COST_MICROS,
      reservedCostPerCallMicros: this.env.PETROS_V2_VOICE_PREVIEW_MAX_CALL_COST_MICROS };
    if (gate) return { ...base, state: 'authorization_required' as const, reasonCode: gate.code, reason: gate.message, tts: [], stt: [] };
    const results = await Promise.allSettled([this.route(principal, 'speech.synthesise'), this.route(principal, 'speech.transcribe')]);
    const tts = results[0].status === 'fulfilled' ? [results[0].value] : [];
    const stt = results[1].status === 'fulfilled' ? [results[1].value] : [];
    const temporary = results.some(result => result.status === 'rejected' && !['Unavailable preview route', 'Unpriced preview route', 'Unbounded preview price', 'MINI_TTS_METERING_UNBOUNDED'].includes(result.reason?.message));
    return { ...base, reasonCode: tts.length || stt.length ? 'ready' : temporary ? 'temporary_service_failure' : 'no_qualified_provider', state: tts.length || stt.length ? 'ready' as const : 'unavailable' as const,
      ...(!tts.length ? { ttsUnavailableReason: results[0].status === 'rejected' && results[0].reason?.message === 'MINI_TTS_METERING_UNBOUNDED'
        ? 'Cedar and Marin require Mini TTS. This adapter has no enforced output-audio-token bound or provider usage reconciliation; character reservations cannot authorize it. Mini TTS remains unavailable.'
        : 'No priced eligible speech route is available. Refresh after route qualification.' } : {}),
      reason: tts.length || stt.length ? 'Configured eligible routes only; account entitlement, sound and bill reconciliation remain unqualified. No provider call was made by this status check.'
        : temporary ? 'Temporary voice service failure. Ask the test operator to check routing and restricted database access. No provider request has been made.'
        : 'No qualified speech provider is available. Ask the test operator to check credentials, model qualification and pricing. No provider request has been made.', tts, stt };
  }

  private async selected(principal: InstitutionalStudentPrincipal, functionKey: FunctionKey, routeId: string) {
    this.admit(principal);
    const reason = this.gateReason();
    if (reason) throw new ForbiddenException({ code: 'PETROS_PREVIEW_AUTHORIZATION_REQUIRED', message: reason });
    let route: PetrosPreviewRoute;
    try { route = await this.route(principal, functionKey); }
    catch { throw new BadGatewayException({ code: 'PETROS_PREVIEW_UNAVAILABLE', message: 'No priced eligible preview route is available.' }); }
    if (route.routeId !== routeId) throw new BadRequestException({ code: 'PETROS_PREVIEW_ROUTE_CHANGED', message: 'The effective route changed. Refresh the preview routes.' });
    return route;
  }

  private async reserve(signal?: AbortSignal) {
    signal?.throwIfAborted();
    const id = this.env.PETROS_V2_VOICE_PREVIEW_APPROVAL_ID;
    const limit = Math.floor(this.env.PETROS_V2_VOICE_PREVIEW_MAX_TOTAL_COST_MICROS / this.env.PETROS_V2_VOICE_PREVIEW_MAX_CALL_COST_MICROS);
    // Conservative slots persist seven days, beyond the <=24h approval. Failed/aborted calls are never refunded.
    const reservation = await this.redis.acquireStudentQuota({ globalKey: `petros:voice-preview:${id}:calls`, scopeKey: `petros:voice-preview:${id}:scope`,
      idempotencyKey: `petros:voice-preview:${id}:${randomUUID()}`, globalLimit: limit, scopeLimit: limit, ttlSeconds: 7 * 86_400 });
    if (!reservation?.allowed) throw new ForbiddenException({ code: 'PETROS_PREVIEW_SPENDING_LIMIT', message: 'The preview spending envelope is exhausted or shared accounting is unavailable.' });
    signal?.throwIfAborted();
  }

  private receipt(result: PetrosAiExecuteResult, route: PetrosPreviewRoute, voice: string | null) {
    if (result.routeId !== route.routeId || result.providerKey !== route.providerKey || result.modelKey !== route.modelKey)
      throw new BadGatewayException({ code: 'PETROS_PREVIEW_ROUTE_CHANGED', message: 'The successful route does not match the authorized preview. Audio was discarded.' });
    return { requestedVoice: voice, fallback: { voice: false, route: result.routeFallbackUsed },
      effective: { routeId: result.routeId, providerKey: result.providerKey, modelKey: result.modelKey, voice },
      estimatedCostMicros: result.estimatedCostMicros, actualCostMicros: null,
      metering: 'Gateway metered estimate in micro-USD; provider invoice cost is not supplied.', responseTimeMs: result.responseTimeMs };
  }

  async speech(principal: InstitutionalStudentPrincipal, raw: z.infer<typeof voicePreviewSpeechSchema>, signal?: AbortSignal) {
    const input = voicePreviewSpeechSchema.parse(raw);
    const route = await this.selected(principal, 'speech.synthesise', input.routeId);
    if (!route.voices.includes(input.voice)) throw new BadRequestException({ code: 'PETROS_PREVIEW_UNSUPPORTED_VOICE', message: 'This voice is unavailable on the effective model.' });
    await this.reserve(signal);
    const result = await runOutsideTenant(() => this.gateway.execute({ context: this.context(principal, 'speech.synthesise'), input: [{ type: 'text', text: input.text }],
      speech: { voice: input.voice, speed: input.speed ?? 1, strictVoice: true }, signal, disableCache: true, maxRetries: 0, maxRouteAttempts: 1,
      databaseScope: this.databaseScope(principal),
      authorizeAttempt: async () => { const reason = this.gateReason(); if (reason) throw new ForbiddenException({ code: 'PETROS_PREVIEW_AUTHORIZATION_REQUIRED', message: reason }); },
      routeConstraint: { ...route, maxModalityCostMicros: this.env.PETROS_V2_VOICE_PREVIEW_MAX_CALL_COST_MICROS, units: { characters: input.text.length } },
      metadata: { surface: 'petros_v2_voice_preview', transient: true, approvalId: this.env.PETROS_V2_VOICE_PREVIEW_APPROVAL_ID } }));
    const audio = result.content as { dataBase64?: string; mimeType?: string; effectiveVoice?: string } | null;
    if (!audio?.dataBase64 || audio.effectiveVoice !== input.voice || !audio.mimeType?.startsWith('audio/'))
      throw new BadGatewayException({ code: 'PETROS_PREVIEW_INVALID_AUDIO', message: 'The gateway did not return the requested voice audio.' });
    return { ...this.receipt(result, route, audio.effectiveVoice), audio: { dataBase64: audio.dataBase64, mimeType: audio.mimeType }, transcript: input.text };
  }

  async transcription(principal: InstitutionalStudentPrincipal, raw: z.infer<typeof voicePreviewTranscriptionSchema>, signal?: AbortSignal) {
    const input = voicePreviewTranscriptionSchema.parse(raw);
    const route = await this.selected(principal, 'speech.transcribe', input.routeId);
    const seconds = previewWavDuration(input.audio.dataBase64);
    await this.reserve(signal);
    const result = await runOutsideTenant(() => this.gateway.execute({ context: this.context(principal, 'speech.transcribe'),
      input: [{ type: 'audio', dataBase64: input.audio.dataBase64, mediaType: input.audio.mimeType }], signal,
      databaseScope: this.databaseScope(principal),
      disableCache: true, maxRetries: 0, maxRouteAttempts: 1,
      authorizeAttempt: async () => { const reason = this.gateReason(); if (reason) throw new ForbiddenException({ code: 'PETROS_PREVIEW_AUTHORIZATION_REQUIRED', message: reason }); },
      routeConstraint: { ...route, maxModalityCostMicros: this.env.PETROS_V2_VOICE_PREVIEW_MAX_CALL_COST_MICROS, units: { audioSeconds: Math.max(seconds, route.minimumBillableSeconds) } },
      metadata: { surface: 'petros_v2_voice_preview', transient: true, consent: true, approvalId: this.env.PETROS_V2_VOICE_PREVIEW_APPROVAL_ID } }));
    const content = result.content as { text?: string } | null;
    if (!content?.text?.trim()) throw new BadGatewayException({ code: 'PETROS_PREVIEW_EMPTY_TRANSCRIPT', message: 'No transcript was returned. You can type your question.' });
    return { ...this.receipt(result, route, null), transcript: content.text.trim().slice(0, 2_000), recordingDurationMs: Math.round(seconds * 1_000) };
  }
}
