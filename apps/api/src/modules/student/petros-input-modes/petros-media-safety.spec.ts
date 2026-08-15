import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '@edrion/config';
import {
  inspectAndSanitiseMedia,
  scanMedia,
  signMediaAccess,
  verifyMediaAccess,
} from './petros-media-safety';

function pngChunk(type: string, data: Buffer) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  return chunk;
}

function pngWithExif() {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(640, 0);
  ihdr.writeUInt32BE(480, 4);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('eXIf', Buffer.from('GPSLatitude=51.5;GPSLongitude=-0.1')),
    pngChunk('IDAT', Buffer.from([0x00])),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('Petros media safety', () => {
  it('sniffs MIME, strips location metadata, retains dimensions, and hashes sanitised bytes', () => {
    const inspected = inspectAndSanitiseMedia(pngWithExif(), 'image/png', 'question_photo');
    expect(inspected).toMatchObject({ detectedMimeType: 'image/png', width: 640, height: 480, metadataStripped: true });
    expect(inspected.sanitised.includes(Buffer.from('GPSLatitude'))).toBe(false);
    expect(inspected.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects declared MIME mismatches and unsupported content', () => {
    expect(() => inspectAndSanitiseMedia(pngWithExif(), 'image/jpeg', 'question_photo')).toThrow(/does not match/i);
    expect(() => inspectAndSanitiseMedia(Buffer.from('plain text'), 'image/png', 'question_photo')).toThrow(/not supported/i);
  });

  it('quarantines the licensed EICAR test signature in the deterministic test scanner', async () => {
    const result = await scanMedia(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'), { NODE_ENV: 'test', PETROS_MEDIA_SCAN_URL: undefined } as ApiEnv);
    expect(result).toEqual({ clean: false, engine: 'local-signature-v1', signature: 'EICAR_TEST_FILE' });
  });

  it('fails closed in production when no external scanner is configured', async () => {
    await expect(scanMedia(Buffer.from('safe-looking bytes'), {
      NODE_ENV: 'production',
      PETROS_MEDIA_SCAN_URL: undefined,
    } as ApiEnv)).rejects.toThrow(/remains quarantined/i);
  });

  it('uses student-bound short-lived signatures and rejects expiry or tampering', () => {
    const expiresEpochSeconds = Math.floor(Date.now() / 1_000) + 60;
    const input = { mediaId: 'media-1', studentId: 'student-1', expiresEpochSeconds, secret: 'test-signing-secret' };
    const token = signMediaAccess(input);
    expect(verifyMediaAccess({ ...input, token })).toBe(true);
    expect(verifyMediaAccess({ ...input, studentId: 'student-2', token })).toBe(false);
    expect(verifyMediaAccess({ ...input, expiresEpochSeconds: 1, token })).toBe(false);
  });
});
