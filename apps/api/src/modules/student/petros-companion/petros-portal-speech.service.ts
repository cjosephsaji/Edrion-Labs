import { BadGatewayException, BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@edrion/config';
import { randomUUID } from 'node:crypto';
import { API_ENV } from '../../../common/tokens';
import { PetrosAiRoutingService } from '../../petros-ai-routing/petros-ai-routing.service';
import { PetrosAiRoutingRepository } from '../../petros-ai-routing/petros-ai-routing.repository';
import { supportedSpeechVoices, type PetrosSpeechVoice } from '../../petros-ai-routing/petros-speech-capabilities';
import type { InstitutionalStudentPrincipal } from '../student.types';

/** Metadata only. The gateway retains routing, release, quota and retry authority. */
@Injectable()
export class PetrosPortalSpeechService {
  constructor(private readonly routing: PetrosAiRoutingService, private readonly repo: PetrosAiRoutingRepository,
    @Inject(API_ENV) private readonly env: ApiEnv) {}

  context(principal: InstitutionalStudentPrincipal, characters = 2_000) {
    return { functionKey: 'speech.synthesise', topic: 'student portal guidance', sessionType: 'learn' as const,
      inputModality: 'text' as const, language: 'en', institutionId: principal.institutionId, studentId: principal.studentId,
      estimatedTokens: Math.ceil(characters / 4), currentCostMicros: 0, previousFailures: 0, requiredResponseMs: 8_000 };
  }

  async options(principal: InstitutionalStudentPrincipal) {
    if (this.env.PETROS_AI_MODE !== 'live') return { state: 'unavailable' as const, voices: [] as PetrosSpeechVoice[], reason: 'Speech is unavailable in no-cost demo mode.' };
    try {
      const plan = await this.routing.previewRoute({ ...this.context(principal), requestId: randomUUID() });
      const selected = plan.selected;
      const [provider, model] = await Promise.all([this.repo.findProvider(selected.providerId), this.repo.findModel(selected.modelId)]);
      if (!provider?.enabled || provider.paused || provider.healthStatus === 'down' || !provider.credentialEnvelope || !model?.enabled ||
        !['openai', 'openai_compatible'].includes(provider.adapterType)) throw new Error('Unavailable route');
      const supported = supportedSpeechVoices(model.modelKey);
      // Binary Mini TTS responses have no enforced output-token bound or usage
      // reconciliation in the installed adapter. A character price cannot qualify it.
      if (!['tts-1', 'tts-1-hd'].includes(model.modelKey)) return { state: 'unavailable' as const, voices: [] as PetrosSpeechVoice[],
        modelKey: model.modelKey, providerKey: provider.key, reason: 'This speech model needs bounded output-audio-token metering before it can be offered.' };
      const price = Number(model.providerOptions.priceMicrosPerMillionCharacters);
      if (model.providerOptions.pricingUnit !== 'character' || !Number.isFinite(price) || price <= 0) throw new Error('Unpriced route');
      // An account-specific restriction can narrow the installed model contract.
      const configured = model.providerOptions.qualifiedSpeechVoices;
      const voices = supported.filter(voice => !Array.isArray(configured) || configured.includes(voice));
      if (!voices.length) throw new Error('No available voices');
      return { state: 'ready' as const, routeId: selected.routeId, modelKey: model.modelKey, providerKey: provider.key, voices,
        reason: 'Configured eligible route. Provider account access is confirmed by a successful synthesis receipt.' };
    } catch {
      return { state: 'unavailable' as const, voices: [] as PetrosSpeechVoice[], reason: 'No configured, priced, healthy speech route is available. You can keep using text.' };
    }
  }

  async validate(principal: InstitutionalStudentPrincipal, voice?: PetrosSpeechVoice) {
    const options = await this.options(principal);
    if (options.state !== 'ready') throw new BadGatewayException({ code: 'PETROS_SPEECH_UNAVAILABLE', message: options.reason });
    if (!voice || !options.voices.includes(voice)) throw new BadRequestException({ code: 'PETROS_UNSUPPORTED_VOICE',
      message: `Select a supported voice for ${options.modelKey}. Your saved preference has not been changed.`,
      supportedVoices: options.voices, effectiveModel: options.modelKey });
    return options;
  }
}
