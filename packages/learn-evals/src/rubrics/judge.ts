import {
  PETROS_QUALITY_JUDGE_FUNCTION_KEY,
  QUALITY_DIMENSIONS,
  type QualityScore,
  type QualityTranscript,
  type QualityUsage,
} from '../contracts';
import { qualityApiAuthHeaders, type QualityApiAuth } from '../api-auth';

export const JUDGE_PROMPT_VERSION = 'petros-quality-judge.v1';
export const JUDGE_SCHEMA_VERSION = 'petros-quality-judge-response.v1';

export type GatewayJudgeOptions = {
  apiBase: string;
  auth: QualityApiAuth;
  timeoutMs?: number;
};

/**
 * Calls Edrion's provider-independent control plane. The harness never accepts a provider key,
 * model name, or API credential and therefore cannot bypass routing, budgets, or usage metering.
 */
export async function judgeThroughGateway(transcript: QualityTranscript, options: GatewayJudgeOptions): Promise<{ scores: QualityScore[]; usage: QualityUsage }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
  try {
    const response = await fetch(`${options.apiBase.replace(/\/$/, '')}/petros-quality/judge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...qualityApiAuthHeaders(options.auth) },
      signal: controller.signal,
      body: JSON.stringify({
        functionKey: PETROS_QUALITY_JUDGE_FUNCTION_KEY,
        source: 'evaluation',
        environment: 'evaluation',
        promptVersion: JUDGE_PROMPT_VERSION,
        schemaVersion: JUDGE_SCHEMA_VERSION,
        transcript,
      }),
    });
    if (!response.ok) throw new Error(`JUDGE_UNAVAILABLE: gateway HTTP ${response.status}`);
    const payload = await response.json() as { scores?: unknown; usage?: QualityUsage };
    if (!payload.usage || payload.usage.source !== 'evaluation' || payload.usage.functionKey !== PETROS_QUALITY_JUDGE_FUNCTION_KEY) {
      throw new Error('JUDGE_SCHEMA_INVALID: metered evaluation usage is required');
    }
    return { scores: validateJudgeScores(payload.scores), usage: payload.usage };
  } finally {
    clearTimeout(timer);
  }
}

export function validateJudgeScores(value: unknown): QualityScore[] {
  if (!Array.isArray(value)) throw new Error('JUDGE_SCHEMA_INVALID: expected score array');
  const dimensions = new Set(QUALITY_DIMENSIONS);
  const seen = new Set<string>();
  const scores = value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('JUDGE_SCHEMA_INVALID: score entry must be an object');
    const item = entry as Record<string, unknown>;
    if (typeof item.dimension !== 'string' || !dimensions.has(item.dimension as never)) throw new Error(`JUDGE_SCHEMA_INVALID: unknown dimension ${String(item.dimension)}`);
    if (seen.has(item.dimension)) throw new Error(`JUDGE_SCHEMA_INVALID: duplicate dimension ${item.dimension}`);
    seen.add(item.dimension);
    const score = Number(item.score);
    if (!Number.isFinite(score) || score < 1 || score > 5) throw new Error(`JUDGE_SCHEMA_INVALID: score for ${item.dimension} must be 1..5`);
    if (!Array.isArray(item.evidence) || item.evidence.length === 0) throw new Error(`JUDGE_SCHEMA_INVALID: evidence required for ${item.dimension}`);
    if (typeof item.rationale !== 'string' || item.rationale.trim().length < 8) throw new Error(`JUDGE_SCHEMA_INVALID: rationale required for ${item.dimension}`);
    return { ...item, score, maxScore: 5, evaluator: 'gateway_judge' } as QualityScore;
  });
  if (scores.length !== QUALITY_DIMENSIONS.length) throw new Error(`JUDGE_SCHEMA_INVALID: expected ${QUALITY_DIMENSIONS.length} dimensions, received ${scores.length}`);
  return scores;
}
