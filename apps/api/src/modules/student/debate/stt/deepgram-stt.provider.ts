import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../../../common/tokens';
import type { SttProvider, SttTranscriptionResult } from './stt-provider';
import { MockSttProvider } from './mock-stt.provider';

@Injectable()
export class DeepgramSttProvider implements SttProvider {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly mock: MockSttProvider,
  ) {}

  async transcribe(input: {
    audioBuffer?: Buffer;
    objectRef: string;
    languageHint: string;
    keyterms: string[];
    diarize: false;
  }): Promise<SttTranscriptionResult> {
    const key = this.env.DEEPGRAM_API_KEY;
    const buffer = input.audioBuffer;
    if (!key || !buffer?.length) return this.mock.transcribe(input);

    const url = `https://api.deepgram.com/v1/listen?model=nova-3&language=${encodeURIComponent(input.languageHint)}&punctuate=false&smart_format=false`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${key}`,
        'Content-Type': 'audio/webm',
      },
      body: buffer,
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Deepgram STT failed: ${res.status} ${detail}`);
    }
    const json = (await res.json()) as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            transcript?: string;
            confidence?: number;
            words?: Array<{ word: string; start: number; end: number; confidence: number }>;
          }>;
        }>;
      };
    };
    const alt = json.results?.channels?.[0]?.alternatives?.[0];
    const transcript = alt?.transcript?.trim() ?? '';
    const words =
      alt?.words?.map((w) => ({
        w: w.word,
        s_ms: Math.round(w.start * 1000),
        e_ms: Math.round(w.end * 1000),
        conf: w.confidence,
      })) ?? [];
    return {
      text: transcript,
      words,
      confidence: alt?.confidence ?? 0.8,
      fillers: {},
      providerModel: 'nova-3',
    };
  }
}
