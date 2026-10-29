import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { TUTOR_TTS_VOICES } from '../../petros-ai-routing/petros-speech-capabilities';

export const VOICE_PREVIEW_LIMITS = { maxTextCharacters: 500, maxAudioBytes: 330_000, maxRecordingSeconds: 10 } as const;
export const voicePreviewSpeechSchema = z.object({
  routeId: z.string().uuid(), voice: z.enum(TUTOR_TTS_VOICES),
  text: z.string().trim().min(1).max(VOICE_PREVIEW_LIMITS.maxTextCharacters),
  speed: z.number().min(0.85).max(1.15).optional(),
}).strict();
export const voicePreviewTranscriptionSchema = z.object({
  routeId: z.string().uuid(), consent: z.literal(true),
  audio: z.object({ mimeType: z.literal('audio/wav'), dataBase64: z.string().min(60).max(440_000) }).strict(),
}).strict();

/** Canonical browser-exported PCM only. Client duration and MIME alone cannot bound billing. */
export function previewWavDuration(dataBase64: string): number {
  const invalid = () => new BadRequestException({ code: 'PETROS_PREVIEW_AUDIO_INVALID', message: 'Use a nonempty mono 16 kHz PCM WAV recording of at most ten seconds.' });
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataBase64)) throw invalid();
  const bytes = Buffer.from(dataBase64, 'base64');
  if (bytes.length < 46 || bytes.length > VOICE_PREVIEW_LIMITS.maxAudioBytes || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.readUInt32LE(4) !== bytes.length - 8 || bytes.toString('ascii', 8, 12) !== 'WAVE' ||
    bytes.toString('ascii', 12, 16) !== 'fmt ' || bytes.readUInt32LE(16) !== 16 || bytes.readUInt16LE(20) !== 1 ||
    bytes.readUInt16LE(22) !== 1 || bytes.readUInt32LE(24) !== 16_000 || bytes.readUInt32LE(28) !== 32_000 ||
    bytes.readUInt16LE(32) !== 2 || bytes.readUInt16LE(34) !== 16 || bytes.toString('ascii', 36, 40) !== 'data' ||
    bytes.readUInt32LE(40) !== bytes.length - 44 || (bytes.length - 44) % 2 !== 0) throw invalid();
  const seconds = (bytes.length - 44) / 32_000;
  if (seconds < 0.01 || seconds > VOICE_PREVIEW_LIMITS.maxRecordingSeconds) throw invalid();
  return seconds;
}
