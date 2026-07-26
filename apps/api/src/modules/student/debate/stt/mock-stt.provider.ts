import { Injectable } from '@nestjs/common';
import type { SttProvider, SttTranscriptionResult } from './stt-provider';

/** Deterministic STT for tests and local dev when Deepgram is not configured. */
@Injectable()
export class MockSttProvider implements SttProvider {
  async transcribe(_input?: Parameters<SttProvider['transcribe']>[0]): Promise<SttTranscriptionResult> {
    const text = 'This is a practice speech for debate adjudication testing.';
    const words = text.split(/\s+/).map((w, i) => ({
      w,
      s_ms: i * 400,
      e_ms: (i + 1) * 400,
      conf: 0.92,
    }));
    return {
      text,
      words,
      confidence: 0.92,
      fillers: { um: 0, like: 0 },
      providerModel: 'mock-stt-v1',
    };
  }
}
