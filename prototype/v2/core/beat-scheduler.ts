import type { TeachingCommand } from './scene-ir';
export interface Beat {
  say: string;
  do: TeachingCommand[];
}
/** Each beat commits a visual, then waits for confirmed audio completion or explicit text continuation. */
export class BeatScheduler {
  private epoch = 0;
  private controller: AbortController | null = null;
  cancel() {
    this.epoch++;
    this.controller?.abort();
    this.controller = null;
  }
  async play(
    beats: Beat[],
    commit: (b: Beat) => void,
    say: (text: string, signal: AbortSignal) => Promise<void>,
  ) {
    this.cancel();
    const epoch = this.epoch,
      controller = new AbortController();
    this.controller = controller;
    for (const beat of beats) {
      if (epoch !== this.epoch) return;
      commit(beat);
      try {
        await say(beat.say, controller.signal);
      } catch {
        return;
      }
    }
  }
}
