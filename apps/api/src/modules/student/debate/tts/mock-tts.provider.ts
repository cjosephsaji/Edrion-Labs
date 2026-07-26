import { Injectable } from '@nestjs/common';
import type { TtsProvider, TtsSynthesisResult } from './tts-provider';

/** Minimal valid silent WebM header stub — clients poll script text if playback fails. */
const SILENT_WEBM = Buffer.from(
  'GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCgQJHgQFC8oEEQvOBCEqCgQKHgQJHgQFC8oEEQvOBCEqCgQKHgQJ',
  'base64',
);

@Injectable()
export class MockTtsProvider implements TtsProvider {
  readonly available = true;

  async synthesize(input: { text: string; voiceKey: string }): Promise<TtsSynthesisResult> {
    const wpm = 140;
    const words = input.text.split(/\s+/).filter(Boolean).length;
    const durationMs = Math.max(3000, Math.round((words / wpm) * 60_000));
    return {
      audioBuffer: SILENT_WEBM,
      mimeType: 'audio/webm',
      durationMs,
      provider: 'mock',
      voiceKey: input.voiceKey,
    };
  }
}
