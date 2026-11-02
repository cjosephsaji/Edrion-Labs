import { tapSpeech } from '../world-v3/audio';
import { prototypeFeatures } from './prototype-features';
/** Exact-caption speech. Cancels fetch, playback, object URLs, and stale completion together. */
export class Narrator {
  private controller: AbortController | null = null;
  private audio: HTMLAudioElement | null = null;
  private reject: ((e: Error) => void) | null = null;
  private url = '';
  cancel() {
    this.controller?.abort();
    this.controller = null;
    this.audio?.pause();
    if (this.audio) this.audio.src = '';
    this.audio = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = '';
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.reject?.(Error('Interrupted'));
    this.reject = null;
  }
  async speak(
    api: string,
    text: string,
    status: (s: 'loading' | 'speaking' | 'ready') => void,
  ) {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    status('loading');
    try {
      // Device narration is local; never contact a provider while AI is paused.
      if (!prototypeFeatures.liveAI) throw Error('Use device narration');
      const r = await fetch(`${api}/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!r.ok) throw Error('Provider voice unavailable');
      const blob = await r.blob();
      if (controller.signal.aborted) return;
      this.url = URL.createObjectURL(blob);
      const audio = new Audio(this.url);
      this.audio = audio;
      tapSpeech(audio);
      audio.dataset.petrosNarration = 'true';
      await new Promise<void>((resolve, reject) => {
        this.reject = reject;
        audio.onplaying = () => status('speaking');
        audio.onended = () => resolve();
        audio.onerror = () => reject(Error('Audio playback failed'));
        void audio.play().catch(reject);
      });
    } catch (e) {
      if (controller.signal.aborted) throw e;
      if (
        typeof speechSynthesis === 'undefined' ||
        !speechSynthesis.getVoices().length
      )
        throw Error(
          'Voice is unavailable. Continue with the matching captions.',
        );
      await new Promise<void>((resolve, reject) => {
        this.reject = reject;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.95;
        utterance.onstart = () => status('speaking');
        utterance.onend = () => resolve();
        utterance.onerror = () => reject(Error('Device voice interrupted'));
        speechSynthesis.speak(utterance);
      });
    } finally {
      if (this.controller === controller) {
        status('ready');
        this.reject = null;
      }
    }
  }
}
