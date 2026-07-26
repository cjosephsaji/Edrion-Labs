export interface SttWord {
  w: string;
  s_ms: number;
  e_ms: number;
  conf: number;
}

export interface SttTranscriptionResult {
  text: string;
  words: SttWord[];
  confidence: number;
  fillers: Record<string, number>;
  providerModel: string;
}

export interface SttProvider {
  transcribe(input: {
    audioBuffer?: Buffer;
    objectRef: string;
    languageHint: string;
    keyterms: string[];
    diarize: false;
  }): Promise<SttTranscriptionResult>;
}

export const STT_PROVIDER = Symbol('STT_PROVIDER');
