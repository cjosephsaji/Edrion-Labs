import { Injectable } from '@nestjs/common';
import type { TtsProvider, TtsSynthesisResult } from './tts-provider';
import { MockTtsProvider } from './mock-tts.provider';
import { OpenAiTtsProvider } from './openai-tts.provider';

/**
 * Selects TTS implementation from `TTS_PROVIDER` (mock | openai). OpenAI is used when configured
 * and the key is present; otherwise falls back to mock so debate practice still works offline.
 */
@Injectable()
export class ConfigTtsProvider implements TtsProvider {
  constructor(
    private readonly mock: MockTtsProvider,
    private readonly openai: OpenAiTtsProvider,
  ) {}

  get available(): boolean {
    return this.pick().available;
  }

  async synthesize(input: { text: string; voiceKey: string; language?: string }): Promise<TtsSynthesisResult> {
    return this.pick().synthesize(input);
  }

  private pick(): TtsProvider {
    const provider = (process.env.TTS_PROVIDER ?? 'openai').toLowerCase();
    if (provider === 'mock') return this.mock;
    if (provider === 'openai' && this.openai.available) return this.openai;
    return this.mock;
  }
}
