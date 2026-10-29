/** Conservative installed-adapter contract, verified against the official TTS guide.
 * Model catalog availability does not imply a configured/account-qualified route. */
export const LEGACY_TTS_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'] as const;
export const TUTOR_TTS_VOICES = [...LEGACY_TTS_VOICES, 'ballad', 'verse', 'cedar', 'marin'] as const;
export type PetrosSpeechVoice = typeof TUTOR_TTS_VOICES[number];
export interface PetrosSpeechOptions { voice?: PetrosSpeechVoice; speed?: number; strictVoice?: boolean }

export function supportedSpeechVoices(modelKey: string): readonly PetrosSpeechVoice[] {
  if (modelKey === 'tts-1' || modelKey === 'tts-1-hd') return LEGACY_TTS_VOICES;
  if (modelKey === 'gpt-4o-mini-tts' || /^gpt-4o-mini-tts-\d{4}-\d{2}-\d{2}$/.test(modelKey)) return TUTOR_TTS_VOICES;
  return [];
}

export function supportsTutorInstructions(modelKey: string) {
  return supportedSpeechVoices(modelKey).includes('cedar');
}
