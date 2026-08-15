import { BadGatewayException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { RedisService } from '../../common/redis/redis.service';
import { petrosRouteContextSchema, type PetrosRouteContext } from '@edrion/schemas';
import { PetrosAiRoutingRepository } from './petros-ai-routing.repository';
import { PetrosAiRoutingService } from './petros-ai-routing.service';
import {
  PetrosProviderAdapterRegistry,
  ProviderCallError,
  type PetrosAiInputPart,
  type PetrosAiNormalizedResponse,
} from './petros-provider-adapters';
import { parseStructuredResponse, validatePetrosResponse } from './petros-response-validator';
import { PetrosRoutingError } from './petros-routing-engine';

export interface PetrosAiExecuteRequest {
  context: Omit<PetrosRouteContext, 'requestId'> & { requestId?: string };
  system?: string;
  input: PetrosAiInputPart[];
  responseSchema?: Record<string, unknown>;
  sessionId?: string;
  independentUserId?: string;
  cacheTtlSeconds?: number;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  /** Sensitive raw media and transient voice outputs must never enter the shared response cache. */
  disableCache?: boolean;
}

export interface PetrosAiExecuteResult extends PetrosAiNormalizedResponse {
  requestId: string;
  providerKey: string;
  modelKey: string;
  fallbackTier: number;
  cached: boolean;
  functionKey: string;
  promptVersion: string;
  schemaVersion: string;
  estimatedCostMicros: number;
  responseTimeMs: number;
  retryCount: number;
}

/** The one execution entrance Petros features use. No feature calls a provider directly. */
@Injectable()
export class PetrosAiGatewayService {
  constructor(
    private readonly routing: PetrosAiRoutingService,
    private readonly repo: PetrosAiRoutingRepository,
    private readonly adapters: PetrosProviderAdapterRegistry,
    private readonly redis: RedisService,
  ) {}

  async execute(raw: PetrosAiExecuteRequest): Promise<PetrosAiExecuteResult> {
    const requestId = raw.context.requestId ?? randomUUID();
    const context = petrosRouteContextSchema.parse({ ...raw.context, requestId });
    await this.routing.ensureRegistry();
    const fn = await this.repo.findFunctionByKey(context.functionKey);
    if (!fn) throw new BadGatewayException({ code: 'PETROS_FUNCTION_NOT_REGISTERED', message: 'Petros function is not registered.' });
    const activeVersion = await this.repo.findActiveFunctionVersion(fn.id);
    const system = activeVersion?.promptTemplate || raw.system;
    const responseSchema = activeVersion && Object.keys(activeVersion.responseSchema).length
      ? activeVersion.responseSchema
      : raw.responseSchema;
    let plan;
    try {
      plan = await this.routing.previewRoute(context);
    } catch (error) {
      if (error instanceof PetrosRoutingError) {
        throw new BadGatewayException({
          code: `PETROS_${error.code}`,
          message: 'Petros has no eligible execution route for this action right now.',
          meta: { failureType: 'infrastructure', routingCode: error.code },
        });
      }
      throw error;
    }
    const settings = fn.settings;
    const quota = await this.repo.functionQuotaSnapshot(fn.id, context.studentId, context.institutionId);
    const quotaError =
      (settings.dailyRequestLimit != null && quota.dailyRequests >= settings.dailyRequestLimit && 'DAILY_FUNCTION_LIMIT') ||
      (settings.monthlyRequestLimit != null && quota.monthlyRequests >= settings.monthlyRequestLimit && 'MONTHLY_FUNCTION_LIMIT') ||
      (settings.maxCostPerStudentMicros != null && quota.studentCostMicros >= settings.maxCostPerStudentMicros && 'STUDENT_COST_LIMIT') ||
      (settings.maxInstitutionUsage != null && quota.institutionRequests >= settings.maxInstitutionUsage && 'INSTITUTION_USAGE_LIMIT') ||
      (context.estimatedTokens > settings.maxInputTokens && 'MAX_INPUT_TOKENS');
    if (quotaError) {
      const candidate = plan.selected;
      await this.repo.recordUsage({
        requestId,
        sessionId: raw.sessionId,
        studentId: context.studentId,
        independentUserId: raw.independentUserId,
        institutionId: context.institutionId,
        functionId: fn.id,
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        responseTimeMs: 0,
        status: 'rejected',
        errorCode: quotaError,
        fallbackTier: candidate.tier,
        metadata: { ...raw.metadata, correlationId: raw.correlationId },
      });
      throw new BadGatewayException({ code: quotaError, message: 'This Petros function reached a configured usage or cost limit.' });
    }
    const cacheKey = this.cacheKey(context.functionKey, system, raw.input, fn.activePromptVersion, fn.activeSchemaVersion);
    if (plan.cacheAllowed && settings.caching && !raw.disableCache) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as PetrosAiExecuteResult;
        const [provider, model] = await Promise.all([
          this.repo.findProviderByKey(parsed.providerKey),
          this.repo.findModelByKey((await this.repo.findProviderByKey(parsed.providerKey))?.id ?? '', parsed.modelKey),
        ]);
        if (provider && model) {
          await this.repo.recordUsage({
            requestId,
            sessionId: raw.sessionId,
            studentId: context.studentId,
            independentUserId: raw.independentUserId,
            institutionId: context.institutionId,
            functionId: fn.id,
            providerId: provider.id,
            modelId: model.id,
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: parsed.inputTokens + parsed.outputTokens,
            responseTimeMs: 0,
            status: 'cached',
            fallbackTier: parsed.fallbackTier,
            cacheStatus: 'hit',
            metadata: { ...raw.metadata, correlationId: raw.correlationId },
          });
        }
        return {
          ...parsed,
          requestId,
          cached: true,
          functionKey: fn.key,
          promptVersion: fn.activePromptVersion,
          schemaVersion: fn.activeSchemaVersion,
          estimatedCostMicros: 0,
          responseTimeMs: 0,
          retryCount: 0,
        };
      }
    }

    const errors: string[] = [];
    for (const candidate of plan.attempts) {
      const [provider, model] = await Promise.all([
        this.repo.findProvider(candidate.providerId),
        this.repo.findModel(candidate.modelId),
      ]);
      if (!provider || !model) continue;
      const maxRetries = Math.max(0, Number(settings.maxRetries ?? 0));
      for (let retry = 0; retry <= maxRetries; retry += 1) {
        const started = Date.now();
        try {
          const response = await this.adapters.adapter(provider).execute(provider, model, {
            functionKey: fn.key,
            system,
            input: raw.input,
            responseFormat: fn.responseFormat,
            responseSchema,
            maxOutputTokens: Number(settings.maxOutputTokens),
            temperature: Number(settings.temperature),
            reasoningLevel: settings.reasoningLevel,
            timeoutMs: Number(settings.timeoutMs),
            stream: Boolean(settings.streaming),
          });
          const content = response.kind === 'json' ? parseStructuredResponse(response.content) : response.content;
          const estimatedCostMicros = response.actualCostMicros
            ?? estimateCost(model.pricing, response.inputTokens, response.outputTokens, response.cachedTokens);
          const validationErrors = responseSchema ? validatePetrosResponse(content, responseSchema) : [];
          if (validationErrors.length) {
            throw new ProviderCallError(
              'RESPONSE_VALIDATION_FAILED',
              validationErrors.slice(0, 5).join('; '),
              true,
              { ...response, estimatedCostMicros },
            );
          }
          if (settings.maxCostPerRequestMicros != null && estimatedCostMicros > settings.maxCostPerRequestMicros) {
            throw new ProviderCallError(
              'REQUEST_COST_LIMIT',
              'The response exceeded this function’s per-request cost limit.',
              false,
              { ...response, estimatedCostMicros },
            );
          }
          await this.repo.recordUsage({
            requestId,
            sessionId: raw.sessionId,
            studentId: context.studentId,
            independentUserId: raw.independentUserId,
            institutionId: context.institutionId,
            functionId: fn.id,
            providerId: provider.id,
            modelId: model.id,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            cachedTokens: response.cachedTokens,
            estimatedCostMicros,
            actualCostMicros: response.actualCostMicros,
            responseTimeMs: Date.now() - started,
            status: 'success',
            retryCount: retry,
            fallbackTier: candidate.tier,
            cacheStatus: 'miss',
            metadata: { ...raw.metadata, correlationId: raw.correlationId, providerRequestId: response.providerRequestId, matchedRules: plan.matchedRules.map((rule) => rule.id) },
          });
          const result: PetrosAiExecuteResult = {
            ...response,
            content,
            requestId,
            providerKey: provider.key,
            modelKey: model.modelKey,
            fallbackTier: candidate.tier,
            cached: false,
            functionKey: fn.key,
            promptVersion: fn.activePromptVersion,
            schemaVersion: fn.activeSchemaVersion,
            estimatedCostMicros,
            responseTimeMs: Date.now() - started,
            retryCount: retry,
          };
          if (plan.cacheAllowed && settings.caching && !raw.disableCache) await this.redis.set(cacheKey, JSON.stringify(result), raw.cacheTtlSeconds ?? 3_600);
          return result;
        } catch (error) {
          const typed = error instanceof ProviderCallError ? error : new ProviderCallError('PROVIDER_ERROR', error instanceof Error ? error.message : 'Provider error.', false);
          errors.push(`${provider.key}/${model.modelKey}: ${typed.code}`);
          await this.repo.recordUsage({
            requestId,
            sessionId: raw.sessionId,
            studentId: context.studentId,
            independentUserId: raw.independentUserId,
            institutionId: context.institutionId,
            functionId: fn.id,
            providerId: provider.id,
            modelId: model.id,
            inputTokens: typed.usage?.inputTokens ?? 0,
            outputTokens: typed.usage?.outputTokens ?? 0,
            cachedTokens: typed.usage?.cachedTokens ?? 0,
            estimatedCostMicros: typed.usage?.estimatedCostMicros ?? 0,
            actualCostMicros: typed.usage?.actualCostMicros,
            responseTimeMs: Date.now() - started,
            status: 'failure',
            errorCode: typed.code,
            retryCount: retry,
            fallbackTier: candidate.tier,
            cacheStatus: 'miss',
            metadata: {
              ...raw.metadata,
              correlationId: raw.correlationId,
              error: typed.message.slice(0, 500),
              ...(typed.usage?.providerRequestId ? { providerRequestId: typed.usage.providerRequestId } : {}),
            },
          });
          if (!typed.retryable) break;
        }
      }
    }
    throw new BadGatewayException({
      code: 'PETROS_ALL_ROUTES_FAILED',
      message: 'Petros could not complete this teaching action right now.',
      detail: errors,
    });
  }

  private cacheKey(functionKey: string, system: string | undefined, input: PetrosAiInputPart[], promptVersion: string, schemaVersion: string) {
    const digest = createHash('sha256').update(JSON.stringify({ functionKey, system, input, promptVersion, schemaVersion })).digest('hex');
    return `petros:ai-cache:${digest}`;
  }
}

function estimateCost(pricing: Record<string, number>, inputTokens: number, outputTokens: number, cachedTokens: number): number {
  const uncachedInput = Math.max(0, inputTokens - cachedTokens);
  return Math.round(
    (uncachedInput * Number(pricing.inputPerMillionMicros ?? 0) +
      cachedTokens * Number(pricing.cachedInputPerMillionMicros ?? pricing.inputPerMillionMicros ?? 0) +
      outputTokens * Number(pricing.outputPerMillionMicros ?? 0)) /
      1_000_000,
  );
}
