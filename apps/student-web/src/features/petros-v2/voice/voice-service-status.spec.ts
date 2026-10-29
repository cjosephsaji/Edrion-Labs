import { describe, expect, it } from 'vitest';
import { voiceStatusFailure, voiceStatusSchema } from './voice-service-status';

describe('safe voice status diagnostics', () => {
  it.each([
    [new TypeError('secret URL'), 'Cannot connect'],
    [{ status: 401, message: 'secret session' }, 'Authentication required'],
    [{ status: 404, code: 'PETROS_PREVIEW_DISABLED' }, 'Voice Preview is disabled'],
    [{ status: 404, code: 'PETROS_PREVIEW_TESTER_REQUIRED' }, 'Voice-test authorization required'],
    [{ status: 403 }, 'Voice-test authorization required'],
    [{ status: 500, message: 'secret database' }, 'Temporary voice service failure'],
    [{ name: 'TimeoutError' }, 'timed out'],
    [{ code: 'INVALID_VOICE_STATUS' }, 'invalid status response'],
  ])('classifies safely: %j', (error, expected) => {
    expect(voiceStatusFailure(error)).toContain(expected);
    expect(voiceStatusFailure(error)).not.toContain('secret');
  });
  it.each([null, {}, '<html>Not an API</html>', { state: 'ready', tts: [{}], stt: [] }])('rejects an incompatible status contract: %j', status => {
    expect(voiceStatusSchema.safeParse(status).success).toBe(false);
  });
});
