import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { ApiEnv } from '@edrion/config';

export const PETROS_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PETROS_AUDIO_MIMES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
] as const;

export type MediaInspection = {
  detectedMimeType: string;
  sanitised: Buffer;
  checksumSha256: string;
  width: number | null;
  height: number | null;
  metadataStripped: boolean;
};

export function inspectAndSanitiseMedia(
  buffer: Buffer,
  declaredMimeType: string,
  expectedKind: 'question_photo' | 'handwriting_page' | 'voice_turn',
): MediaInspection {
  const detectedMimeType = sniffMime(buffer);
  const allowed = expectedKind === 'voice_turn' ? PETROS_AUDIO_MIMES : PETROS_IMAGE_MIMES;
  if (!detectedMimeType || !allowed.includes(detectedMimeType as never)) {
    throw new BadRequestException({
      code: 'PETROS_MEDIA_UNSUPPORTED_TYPE',
      message: `This ${expectedKind === 'voice_turn' ? 'audio' : 'image'} format is not supported.`,
    });
  }
  if (normaliseMime(declaredMimeType) !== detectedMimeType) {
    throw new BadRequestException({
      code: 'PETROS_MEDIA_MIME_MISMATCH',
      message: 'The file content does not match its declared media type.',
    });
  }
  const sanitised = detectedMimeType.startsWith('image/')
    ? stripImageMetadata(buffer, detectedMimeType)
    : Buffer.from(buffer);
  const dimensions = imageDimensions(sanitised, detectedMimeType);
  return {
    detectedMimeType,
    sanitised,
    checksumSha256: createHash('sha256').update(sanitised).digest('hex'),
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    metadataStripped: !sanitised.equals(buffer),
  };
}

export async function scanMedia(
  buffer: Buffer,
  env: ApiEnv,
): Promise<{ clean: boolean; engine: string; signature: string | null }> {
  if (env.PETROS_MEDIA_SCAN_URL) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(env.PETROS_MEDIA_SCAN_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          ...(env.PETROS_MEDIA_SCAN_TOKEN
            ? { authorization: `Bearer ${env.PETROS_MEDIA_SCAN_TOKEN}` }
            : {}),
        },
        body: new Uint8Array(buffer),
        signal: controller.signal,
      });
      const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok || typeof result.clean !== 'boolean') {
        throw new ServiceUnavailableException({
          code: 'PETROS_MEDIA_SCAN_UNAVAILABLE',
          message: 'The safety scan could not finish. The file remains quarantined and can be retried.',
        });
      }
      return {
        clean: result.clean,
        engine: typeof result.engine === 'string' ? result.engine.slice(0, 120) : 'external',
        signature:
          typeof result.signature === 'string' ? result.signature.slice(0, 240) : null,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        code: 'PETROS_MEDIA_SCAN_UNAVAILABLE',
        message: 'The safety scan could not finish. The file remains quarantined and can be retried.',
      });
    } finally {
      clearTimeout(timer);
    }
  }

  if (env.NODE_ENV === 'production') {
    throw new ServiceUnavailableException({
      code: 'PETROS_MEDIA_SCAN_UNAVAILABLE',
      message: 'The safety scan is not configured. The file remains quarantined and can be retried.',
    });
  }

  // Local signature scanning is deterministic development/test protection, not an AV claim.
  const eicar = buffer.includes(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'));
  return {
    clean: !eicar,
    engine: 'local-signature-v1',
    signature: eicar ? 'EICAR_TEST_FILE' : null,
  };
}

export function signMediaAccess(input: {
  mediaId: string;
  studentId: string;
  expiresEpochSeconds: number;
  secret: string;
}) {
  return createHmac('sha256', input.secret)
    .update(`${input.mediaId}.${input.studentId}.${input.expiresEpochSeconds}`)
    .digest('hex');
}

export function verifyMediaAccess(input: {
  mediaId: string;
  studentId: string;
  expiresEpochSeconds: number;
  token: string;
  secret: string;
}) {
  if (input.expiresEpochSeconds < Math.floor(Date.now() / 1_000)) return false;
  const expected = signMediaAccess(input);
  const actual = Buffer.from(input.token, 'hex');
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
}

function normaliseMime(value: string) {
  const mime = value.split(';')[0]!.trim().toLowerCase();
  if (mime === 'audio/x-wav') return 'audio/wav';
  if (mime === 'audio/webm;codecs=opus') return 'audio/webm';
  return mime;
}

function sniffMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE') return 'audio/wav';
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'audio/webm';
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') return 'audio/mp4';
  if (buffer.length >= 3 && buffer.subarray(0, 3).toString('ascii') === 'ID3') return 'audio/mpeg';
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0) return 'audio/mpeg';
  return null;
}

function stripImageMetadata(buffer: Buffer, mime: string): Buffer {
  if (mime === 'image/jpeg') return stripJpegMetadata(buffer);
  if (mime === 'image/png') return stripPngMetadata(buffer);
  if (mime === 'image/webp') return stripWebpMetadata(buffer);
  return Buffer.from(buffer);
}

function stripJpegMetadata(buffer: Buffer) {
  const parts: Buffer[] = [buffer.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1]!;
    if (marker === 0xda || marker === 0xd9) {
      parts.push(buffer.subarray(offset));
      return Buffer.concat(parts);
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) return Buffer.from(buffer);
    const end = offset + 2 + length;
    const isMetadata = marker === 0xe1 || marker === 0xed;
    if (!isMetadata) parts.push(buffer.subarray(offset, end));
    offset = end;
  }
  return Buffer.from(buffer);
}

function stripPngMetadata(buffer: Buffer) {
  const parts: Buffer[] = [buffer.subarray(0, 8)];
  let offset = 8;
  const metadataChunks = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt']);
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) return Buffer.from(buffer);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    if (!metadataChunks.has(type)) parts.push(buffer.subarray(offset, end));
    offset = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(parts);
}

function stripWebpMetadata(buffer: Buffer) {
  const chunks: Buffer[] = [];
  let offset = 12;
  const metadataChunks = new Set(['EXIF', 'XMP ', 'ICCP']);
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset + 4);
    const padded = length + (length % 2);
    const end = offset + 8 + padded;
    if (end > buffer.length) return Buffer.from(buffer);
    const type = buffer.subarray(offset, offset + 4).toString('ascii');
    if (!metadataChunks.has(type)) chunks.push(buffer.subarray(offset, end));
    offset = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.from(buffer.subarray(0, 12));
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
}

function imageDimensions(buffer: Buffer, mime: string): { width: number; height: number } | null {
  if (mime === 'image/png' && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) return null;
      const marker = buffer[offset + 1]!;
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > buffer.length) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += length + 2;
    }
  }
  if (mime === 'image/webp' && buffer.length >= 30 && buffer.subarray(12, 16).toString('ascii') === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  return null;
}
