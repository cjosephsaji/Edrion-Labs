import { z } from 'zod';

const route = z.object({
  routeId: z.string().min(1), providerKey: z.string().min(1), modelKey: z.string().min(1),
  voices: z.array(z.string()), format: z.enum(['audio/wav']).nullable(),
  estimatedCostMicros: z.number().finite().nonnegative(), priceUnit: z.enum(['character', 'audio_hour']),
  priceMicrosPerUnit: z.number().finite().positive(), minimumBillableSeconds: z.number().finite().nonnegative(),
  timing: z.enum(['none', 'input_segments']),
});
export const voiceStatusSchema = z.object({
  state: z.enum(['authorization_required', 'unavailable', 'ready']), reason: z.string(),
  reasonCode: z.string().optional(), ttsUnavailableReason: z.string().optional(),
  tts: z.array(route).max(8), stt: z.array(route).max(8),
  limits: z.object({ maxTextCharacters: z.number().int().positive(), maxAudioBytes: z.number().int().positive(), maxRecordingSeconds: z.number().positive() }),
  maximumTotalCostMicros: z.number().finite().nonnegative(), reservedCostPerCallMicros: z.number().finite().nonnegative(),
  privacy: z.object({ transient: z.literal(true), providerRetention: z.string() }),
});

/** Never echo an upstream exception, URL, credential or database error into the UI. */
export function voiceStatusFailure(error: unknown): string {
  const e = error as { status?: number; code?: string; name?: string } | null;
  if (e?.code === 'PETROS_PREVIEW_DISABLED') return 'Voice Preview is disabled. An operator must enable it in an approved test environment.';
  if (e?.code === 'PETROS_PREVIEW_TESTER_REQUIRED') return 'Voice-test authorization required. Ask the test operator to check your tester access.';
  if (e?.status === 401) return 'Authentication required. Sign in again, then refresh voice status.';
  if (e?.status === 403) return 'Voice-test authorization required. Check your learning permission and voice-test approval with the test operator.';
  if (e?.status === 404) return 'Voice Preview is unavailable or tester access is missing. Ask the test operator to check the feature and tester authorization.';
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'Voice status timed out. Check the test API connection and retry.';
  if (e?.name === 'TypeError') return 'Cannot connect to the voice API. Check that the approved test API is running and reachable.';
  if (e?.code === 'INVALID_VOICE_STATUS') return 'The voice API returned an invalid status response. Ask the test operator to check API compatibility.';
  return 'Temporary voice service failure. Retry shortly or continue with local narration and text.';
}
