import type { QualityTranscript } from '../contracts';
import type { QualityCase } from '../fixtures/manifest';
import type { EvalPersona } from '../fixtures/topics';
import { qualityApiAuthHeaders, type QualityApiAuth } from '../api-auth';
import { PERSONA_POLICIES } from '../personas';

export async function runLiveSession(input: {
  apiBase: string;
  auth: QualityApiAuth;
  runId: string;
  qualityCase: QualityCase;
  persona: EvalPersona;
  seed: number;
  limits: { maxCostMicros: number; maxTokens: number; maxDurationMs: number };
}): Promise<QualityTranscript> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.limits.maxDurationMs);
  try {
    const response = await fetch(`${input.apiBase.replace(/\/$/, '')}/petros-quality/live-session`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...qualityApiAuthHeaders(input.auth) },
      body: JSON.stringify({
        source: 'evaluation',
        environment: 'evaluation',
        synthetic: true,
        runId: input.runId,
        case: input.qualityCase,
        personaId: input.persona,
        personaPolicy: PERSONA_POLICIES[input.persona],
        seed: input.seed,
        limits: input.limits,
      }),
    });
    if (!response.ok) throw new Error(`LIVE_SESSION_FAILED: gateway HTTP ${response.status}: ${await response.text()}`);
    const transcript = await response.json() as QualityTranscript;
    if (transcript.environment !== 'evaluation' || !transcript.synthetic || transcript.productionWrites !== 0) {
      throw new Error('LIVE_SESSION_ISOLATION_FAILED: live evaluation response is not isolated');
    }
    return transcript;
  } finally {
    clearTimeout(timer);
  }
}
