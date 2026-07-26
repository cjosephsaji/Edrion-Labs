export const TTS_PROVIDER = Symbol('TTS_PROVIDER');

export interface TtsSynthesisResult {
  audioBuffer: Buffer;
  mimeType: string;
  durationMs: number;
  provider: string;
  voiceKey: string;
}

export interface TtsProvider {
  readonly available: boolean;
  synthesize(input: { text: string; voiceKey: string; language?: string }): Promise<TtsSynthesisResult>;
}
