export type VoicePreviewRoute = {
  routeId: string;
  providerKey: string;
  modelKey: string;
  voices: string[];
  format: 'audio/wav' | null;
  estimatedCostMicros: number;
  priceUnit: 'character' | 'audio_hour';
  priceMicrosPerUnit: number;
  minimumBillableSeconds: number;
  timing: 'none' | 'input_segments';
};

export type VoicePreviewStatus = {
  state: 'authorization_required' | 'unavailable' | 'ready';
  reason: string;
  reasonCode?: string;
  ttsUnavailableReason?: string;
  tts: VoicePreviewRoute[];
  stt: VoicePreviewRoute[];
  limits: {
    maxTextCharacters: number;
    maxAudioBytes: number;
    maxRecordingSeconds: number;
  };
  maximumTotalCostMicros: number;
  reservedCostPerCallMicros: number;
  privacy: { transient: boolean; providerRetention: string };
};

export type VoicePreviewReceipt = {
  requestedVoice: string | null;
  fallback: { voice: boolean; route: boolean };
  effective: {
    routeId: string;
    providerKey: string;
    modelKey: string;
    voice: string | null;
  };
  estimatedCostMicros: number;
  actualCostMicros: number | null;
  metering: string;
  responseTimeMs: number;
};

export type VoicePreviewSample = VoicePreviewReceipt & {
  audio: {
    dataBase64: string;
    mimeType: 'audio/wav' | 'audio/mpeg' | 'audio/ogg';
  };
  transcript: string;
};

export type VoicePreviewTranscription = VoicePreviewReceipt & {
  transcript: string;
};
