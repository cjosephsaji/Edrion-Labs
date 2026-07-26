/** Voice seam for debate — v1 deferred; column `debate_turns.audio_object_id` reserved. */
export interface AudioRef {
  objectId: string;
  mimeType: string;
}

export interface SpeechProvider {
  stt(audioStream: AsyncIterable<Uint8Array>): AsyncIterable<string>;
  tts(text: string): Promise<AudioRef>;
}
