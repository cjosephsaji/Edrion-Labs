import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../../../common/tokens';
import type { TtsProvider, TtsSynthesisResult } from './tts-provider';

/** OpenAI speech synthesis (`/v1/audio/speech`). Requires `OPENAI_API_KEY`. */
@Injectable()
export class OpenAiTtsProvider implements TtsProvider {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  get available(): boolean {
    return Boolean(this.env.OPENAI_API_KEY);
  }

  async synthesize(input: { text: string; voiceKey: string; language?: string }): Promise<TtsSynthesisResult> {
    if (!this.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    const voice = input.voiceKey || this.env.TTS_OPENAI_VOICE;
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.env.TTS_OPENAI_MODEL,
        input: input.text.slice(0, 4096),
        voice,
        response_format: 'mp3',
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`OpenAI TTS failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    const audioBuffer = Buffer.from(await res.arrayBuffer());
    const words = input.text.split(/\s+/).filter(Boolean).length;
    const durationMs = Math.max(2000, Math.round((words / 140) * 60_000));
    return {
      audioBuffer,
      mimeType: 'audio/mpeg',
      durationMs,
      provider: 'openai',
      voiceKey: voice,
    };
  }
}
