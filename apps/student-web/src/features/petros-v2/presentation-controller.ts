import { z } from 'zod';
import {
  applyStudentCanvasCommand,
  applyTeachingAction,
  commitFixtureSubmission,
  initialSharedCanvas,
  restoreStudentPracticeState,
  studentCanvasCommandSchema,
  validatePresentationTimeline,
  type CanvasOperation,
  type PresentationTimeline,
  type SharedCanvasState,
} from '@edrion/schemas';

export type PresentationStatus =
  | 'idle'
  | 'playing'
  | 'paused'
  | 'interrupted'
  | 'awaiting_response'
  | 'complete';
export type SpeechPlayback = {
  phase: 'text' | 'loading' | 'speaking' | 'stalled';
  currentTime: number;
  duration: number | null;
  reason: string | null;
  caption?: string;
  preview?: { caption: string; paused?: boolean };
};
export type VoicePreviewAudio = {
  dataBase64: string;
  mimeType: 'audio/wav' | 'audio/mpeg' | 'audio/ogg';
  caption: string;
};
export type LocalNarrationSegment = {
  beatId: string;
  src: string;
  mimeType: 'audio/wav' | 'audio/mpeg' | 'audio/ogg';
  provenance: 'approved-local-fixture';
  caption?: string;
};
const textPlayback = (reason: string | null = null): SpeechPlayback => ({
  phase: 'text',
  currentTime: 0,
  duration: null,
  reason,
});
export type PresentationState = {
  interactionCue?: {
    id: string;
    targetId: string;
    canvasRevision: number;
    elementVersion: number;
    epoch: number;
  };
  canvas: SharedCanvasState;
  index: number;
  progress: number;
  status: PresentationStatus;
  epoch: number;
  selectedId: string | null;
  explanation: string;
  feedback: string | null;
  speech: SpeechPlayback;
};
const eventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('action'), index: z.number().int().min(0).max(63) }).strict(),
  z.object({ kind: z.literal('student'), command: studentCanvasCommandSchema }).strict(),
  z
    .object({
      kind: z.literal('submission'),
      checkpointId: z.string().max(80),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('history'),
      direction: z.enum(['undo', 'redo']),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict(),
]);
type Event = z.infer<typeof eventSchema>;
const checkpointSchema = z
  .object({
    version: z.literal('fixture-checkpoint.v1'),
    timelineId: z.string().max(80),
    events: z.array(eventSchema).max(256),
    index: z.number().int().min(0).max(63),
    progress: z.number().min(0).max(1),
    explanation: z.string().max(2000),
    feedback: z.string().max(2000).nullable(),
    selectedId: z.string().max(80).nullable().optional(),
    status: z
      .enum(['idle', 'playing', 'paused', 'interrupted', 'awaiting_response', 'complete'])
      .optional(),
  })
  .strict();

export function primaryPlaybackControl(state: PresentationState) {
  if (state.status === 'playing') return { label: 'Pause', blocked: false };
  if (state.canvas.invitation && !state.canvas.invitation.submitted && state.progress === 1)
    return { label: 'Your turn', blocked: true };
  if (state.status === 'complete') return { label: 'Replay', blocked: false };
  if (state.status === 'interrupted') return { label: 'Continue lesson', blocked: false };
  return { label: state.status === 'idle' ? 'Play' : 'Continue', blocked: false };
}

/** One presentation owner. Text reveal, semantic changes and rig cues share this state and epoch. */
export class PresentationController {
  readonly timeline: PresentationTimeline;
  private state: PresentationState;
  private events: Event[] = [];
  private undoStates: SharedCanvasState[] = [];
  private redoStates: SharedCanvasState[] = [];
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private reducedMotion = false;
  private save: ((checkpoint: string) => void) | undefined;
  private narrationEnabled = true;
  private narration = new Map<string, LocalNarrationSegment>();
  private audio: HTMLAudioElement | null = null;
  private detachAudio: (() => void) | undefined;
  private audioResume: { beatId: string; time: number } | null = null;
  private failedAudio = new Set<string>();
  private createAudio: (src: string) => HTMLAudioElement = (src) => new Audio(src);
  constructor(input: PresentationTimeline) {
    this.timeline = validatePresentationTimeline(input);
    this.state = {
      canvas: initialSharedCanvas(this.timeline.activityId, this.timeline.branchId),
      index: 0,
      progress: 0,
      status: 'idle',
      epoch: 0,
      selectedId: null,
      explanation: '',
      feedback: null,
      speech: textPlayback(),
    };
  }
  getSnapshot = () => this.state;
  /** Read-only media handle for passive amplitude analysis; this remains the sole player. */
  getActiveAudio = () => this.audio;
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  configure(options: { reducedMotion: boolean; save?: (checkpoint: string) => void }) {
    this.reducedMotion = options.reducedMotion;
    this.save = options.save;
  }
  /** Preparation only: trusted, existing local narration, never a provider request or speechSynthesis.
   * One segment equals one semantic beat. No inferred word/viseme timestamps. */
  configureNarration(
    segments: readonly LocalNarrationSegment[],
    createAudio?: (src: string) => HTMLAudioElement,
  ) {
    const next = new Map<string, LocalNarrationSegment>();
    for (const segment of segments) {
      if (
        segment.provenance !== 'approved-local-fixture' ||
        !/^\/petros\/audio\/[a-zA-Z0-9_-]+\.(wav|mp3|ogg)$/.test(segment.src) ||
        !['audio/wav', 'audio/mpeg', 'audio/ogg'].includes(segment.mimeType) ||
        !this.timeline.beats.some((b) => b.id === segment.beatId) ||
        next.has(segment.beatId)
      )
        throw new Error('Invalid local narration binding');
      next.set(segment.beatId, segment);
    }
    this.pause();
    this.narration = next;
    this.failedAudio.clear();
    this.audioResume = null;
    if (createAudio) this.createAudio = createAudio;
  }
  setNarrationEnabled(enabled: boolean) {
    if (this.narrationEnabled === enabled) return;
    this.pause();
    this.narrationEnabled = enabled;
  }
  playLocalResponse(sample: {
    src: string;
    mimeType: 'audio/mpeg';
    caption: string;
    provenance: 'approved-local-fixture';
  }) {
    if (
      sample.provenance !== 'approved-local-fixture' ||
      !/^\/petros\/audio\/[a-zA-Z0-9_-]+\.mp3$/.test(sample.src) ||
      !sample.caption.trim() ||
      sample.caption.length > 500
    )
      throw new Error('Invalid local response binding');
    const epoch = this.prepareVoicePreview(sample.caption);
    return this.playPreviewSource(sample.src, sample.mimeType, sample.caption, epoch);
  }
  private publish(patch: Partial<PresentationState>, save = false) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
    if (save) this.save?.(this.serialize());
  }
  private fence() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.stopAudio();
    return this.state.epoch + 1;
  }
  private stopAudio() {
    const player = this.audio;
    if (!player) {
      if (this.state.speech.preview) this.state = { ...this.state, speech: textPlayback() };
      return;
    }
    // A diagnostic audition never replaces the saved lesson narration position.
    if (!this.state.speech.preview)
      this.audioResume = {
        beatId: this.timeline.beats[this.state.index]!.id,
        time: Number.isFinite(player.currentTime) ? player.currentTime : 0,
      };
    this.detachAudio?.();
    this.detachAudio = undefined;
    this.audio = null;
    player.pause();
    player.removeAttribute('src');
    player.load();
    this.state = {
      ...this.state,
      speech: this.state.speech.preview ? textPlayback() : { ...this.state.speech, phase: 'text' },
    };
  }
  /** Internal voice auditions share the existing media owner and epoch. They do not
   * advance canvas actions or synthesize word/viseme timestamps. */
  prepareVoicePreview = (caption: string) => {
    const epoch = this.fence();
    this.publish(
      {
        epoch,
        status: this.state.status === 'complete' ? 'complete' : 'interrupted',
        speech: {
          phase: 'loading',
          currentTime: 0,
          duration: null,
          reason: null,
          preview: { caption: caption.trim().slice(0, 500) },
        },
      },
      true,
    );
    return epoch;
  };
  stopVoicePreview = () => {
    if (!this.state.speech.preview) return;
    this.publish({ epoch: this.fence(), speech: textPlayback() }, true);
  };
  pauseVoicePreview = () => {
    if (!this.state.speech.preview || !this.audio) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.audio.pause();
    this.publish({
      speech: {
        ...this.state.speech,
        phase: 'text',
        preview: { ...this.state.speech.preview, paused: true },
      },
    });
  };
  resumeVoicePreview = () => {
    if (!this.state.speech.preview?.paused || !this.audio) return;
    const epoch = this.state.epoch,
      player = this.audio;
    this.publish({
      speech: {
        ...this.state.speech,
        phase: 'loading',
        preview: { ...this.state.speech.preview, paused: false },
      },
    });
    const fail = () => {
      if (this.state.epoch === epoch && this.audio === player) this.stopVoicePreview();
    };
    this.timer = setTimeout(fail, 12_000);
    try {
      void player.play().catch(fail);
    } catch {
      fail();
    }
  };
  playVoicePreview = (sample: VoicePreviewAudio, expectedEpoch: number) => {
    if (this.state.epoch !== expectedEpoch || !this.state.speech.preview || this.audio)
      return false;
    if (
      !sample.caption.trim() ||
      sample.caption.length > 500 ||
      !['audio/wav', 'audio/mpeg', 'audio/ogg'].includes(sample.mimeType) ||
      sample.dataBase64.length > 8_000_000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(sample.dataBase64)
    )
      throw new Error('Invalid voice preview audio');
    return this.playPreviewSource(
      `data:${sample.mimeType};base64,${sample.dataBase64}`,
      sample.mimeType,
      sample.caption,
      expectedEpoch,
    );
  };
  private playPreviewSource(src: string, mimeType: string, caption: string, expectedEpoch: number) {
    const preview = { caption };
    const fail = () => {
      if (this.state.epoch !== expectedEpoch || !this.state.speech.preview) return;
      this.publish(
        {
          epoch: this.fence(),
          speech: textPlayback('Preview audio is unavailable. The test text remains available.'),
        },
        true,
      );
    };
    let player: HTMLAudioElement;
    try {
      player = this.createAudio(src);
      if (!player.canPlayType(mimeType)) {
        player.pause();
        player.removeAttribute('src');
        player.load();
        fail();
        return false;
      }
    } catch {
      fail();
      return false;
    }
    this.audio = player;
    const active = () =>
      this.audio === player &&
      this.state.epoch === expectedEpoch &&
      Boolean(this.state.speech.preview);
    const duration = () =>
      Number.isFinite(player.duration) && player.duration > 0 ? player.duration : null;
    const watchdog = () => {
      if (this.timer !== undefined) clearTimeout(this.timer);
      this.timer = setTimeout(fail, 12000);
    };
    const handlers: Record<string, () => void> = {
      loadedmetadata: () => {
        if (active()) this.publish({ speech: { ...this.state.speech, duration: duration() } });
      },
      durationchange: () => {
        if (active()) this.publish({ speech: { ...this.state.speech, duration: duration() } });
      },
      playing: () => {
        if (!active() || this.state.speech.preview?.paused) return;
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.timer = undefined;
        this.publish({
          speech: {
            phase: 'speaking',
            currentTime: player.currentTime,
            duration: duration(),
            reason: null,
            preview,
          },
        });
      },
      timeupdate: () => {
        if (active() && this.state.speech.phase === 'speaking')
          this.publish({
            speech: {
              ...this.state.speech,
              currentTime: Number.isFinite(player.currentTime)
                ? Math.max(0, player.currentTime)
                : 0,
              duration: duration(),
            },
          });
      },
      waiting: () => {
        if (active() && !this.state.speech.preview?.paused) {
          this.publish({ speech: { ...this.state.speech, phase: 'stalled' } });
          watchdog();
        }
      },
      stalled: () => {
        if (active() && !this.state.speech.preview?.paused) {
          this.publish({ speech: { ...this.state.speech, phase: 'stalled' } });
          watchdog();
        }
      },
      pause: () => {
        if (active() && !player.ended) {
          if (this.timer !== undefined) clearTimeout(this.timer);
          this.timer = undefined;
          this.publish({
            speech: { ...this.state.speech, phase: 'text', preview: { ...preview, paused: true } },
          });
        }
      },
      ended: () => {
        if (active()) this.stopVoicePreview();
      },
      error: () => {
        if (active()) fail();
      },
    };
    Object.entries(handlers).forEach(([event, handler]) => player.addEventListener(event, handler));
    this.detachAudio = () =>
      Object.entries(handlers).forEach(([event, handler]) =>
        player.removeEventListener(event, handler),
      );
    this.publish({
      speech: { phase: 'loading', currentTime: 0, duration: null, reason: null, preview },
    });
    watchdog();
    try {
      void player.play().catch(() => {
        if (active()) fail();
      });
    } catch {
      fail();
    }
    return true;
  }
  private startNarration(epoch: number) {
    const beat = this.timeline.beats[this.state.index]!,
      segment = this.narration.get(beat.id);
    if (!this.narrationEnabled || !segment || this.failedAudio.has(beat.id)) return false;
    let candidate: HTMLAudioElement | null = null;
    try {
      candidate = this.createAudio(segment.src);
      if (!candidate.canPlayType(segment.mimeType)) throw new Error('Unsupported audio');
    } catch {
      candidate?.pause();
      candidate?.removeAttribute('src');
      candidate?.load();
      this.failedAudio.add(beat.id);
      this.publish({ speech: textPlayback('Audio is unavailable. Continue in text mode.') });
      return false;
    }
    const player = candidate;
    this.audio = player;
    const active = () =>
      this.audio === player && this.state.epoch === epoch && this.state.status === 'playing';
    const duration = () =>
      Number.isFinite(player.duration) && player.duration > 0 ? player.duration : null;
    let restoredPosition = false;
    const restorePosition = () => {
      if (restoredPosition || this.audioResume?.beatId !== beat.id || this.audioResume.time === 0)
        return true;
      const total = duration(),
        time = this.audioResume.time;
      // Metadata can arrive before the server exposes a seekable range. An early
      // currentTime assignment may silently clamp to zero in a real browser.
      if (!total || (typeof player.readyState === 'number' && player.readyState < 3)) return false;
      if (
        player.seekable &&
        !Array.from({ length: player.seekable.length }, (_, i) => i).some(
          (i) => time >= player.seekable.start(i) && time <= player.seekable.end(i),
        )
      )
        return false;
      player.currentTime = Math.min(time, total);
      restoredPosition = true;
      return true;
    };
    const fail = () => {
      if (!active()) return;
      this.failedAudio.add(beat.id);
      this.publish(
        {
          status: 'paused',
          epoch: this.fence(),
          speech: textPlayback('Audio is unavailable. Continue in text mode.'),
        },
        true,
      );
    };
    const watchdog = () => {
      if (this.timer !== undefined) clearTimeout(this.timer);
      this.timer = setTimeout(fail, 12000);
    };
    const handlers: Record<string, () => void> = {
      loadedmetadata: () => {
        if (!active()) return;
        restorePosition();
        this.publish({ speech: { ...this.state.speech, duration: duration() } });
      },
      durationchange: () => {
        if (active()) {
          restorePosition();
          this.publish({ speech: { ...this.state.speech, duration: duration() } });
        }
      },
      canplay: () => {
        if (active()) restorePosition();
      },
      playing: () => {
        if (!active()) return;
        if (!restorePosition()) {
          fail();
          return;
        }
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.timer = undefined;
        this.publish({
          speech: {
            phase: 'speaking',
            currentTime: player.currentTime,
            duration: duration(),
            reason: null,
            caption: segment.caption ?? beat.action.cue.caption,
          },
        });
      },
      timeupdate: () => {
        if (!active() || this.state.speech.phase !== 'speaking') return;
        const total = duration(),
          time = Number.isFinite(player.currentTime) ? Math.max(0, player.currentTime) : 0;
        // Bounded canvas reveal inside this semantic segment; caption remains the whole beat.
        this.publish({
          progress: total
            ? Math.max(this.state.progress, Math.min(0.999, time / total))
            : this.state.progress,
          speech: { ...this.state.speech, currentTime: time, duration: total },
        });
      },
      waiting: () => {
        if (active()) {
          this.publish({ speech: { ...this.state.speech, phase: 'stalled' } });
          watchdog();
        }
      },
      stalled: () => {
        if (active()) {
          this.publish({ speech: { ...this.state.speech, phase: 'stalled' } });
          watchdog();
        }
      },
      // Browsers emit pause immediately before ended at the natural end. Keep the
      // ended barrier attached in that case; a user pause still fences everything.
      pause: () => {
        if (active() && !player.ended) this.pause();
      },
      ended: () => {
        if (active()) {
          this.audioResume = null;
          this.finishBeat(true);
        }
      },
      error: fail,
    };
    Object.entries(handlers).forEach(([event, handler]) => player.addEventListener(event, handler));
    this.detachAudio = () =>
      Object.entries(handlers).forEach(([event, handler]) =>
        player.removeEventListener(event, handler),
      );
    this.publish({
      speech: {
        phase: 'loading',
        currentTime: 0,
        duration: null,
        reason: null,
        caption: segment.caption ?? beat.action.cue.caption,
      },
    });
    watchdog();
    try {
      void player.play().catch(fail);
    } catch {
      fail();
    }
    return true;
  }
  private startBeat() {
    const beat = this.timeline.beats[this.state.index]!;
    if (this.state.canvas.completedActionIds.includes(beat.action.actionId)) return;
    if (this.events.length >= 256)
      throw new Error(
        'Local operation limit reached; restart this fixture for a new practice copy',
      );
    const canvas = applyTeachingAction(this.state.canvas, {
      ...beat.action,
      expectedCanvasRevision: this.state.canvas.revision,
    });
    this.events.push({ kind: 'action', index: this.state.index });
    this.undoStates = [];
    this.redoStates = [];
    this.audioResume = null;
    this.publish(
      {
        canvas,
        progress: 0,
        selectedId: beat.action.cue.targetId,
        speech: textPlayback(),
        feedback: this.state.canvas.invitation?.submitted ? this.state.feedback : null,
      },
      true,
    );
  }
  play = () => {
    if (
      this.state.canvas.invitation &&
      !this.state.canvas.invitation.submitted &&
      this.state.progress === 1
    )
      throw new Error('Your turn: submit your response before continuing the lesson.');
    if (this.state.status === 'complete') {
      this.restart();
    }
    const epoch = this.fence();
    // Resume an unfinished reveal, or advance the acknowledged beat exactly once.
    if (this.state.progress === 1) this.publish({ index: this.state.index + 1, progress: 0 });
    this.startBeat();
    this.publish({ status: 'playing', epoch });
    if (this.startNarration(epoch)) return;
    if (this.reducedMotion || this.timeline.beats[this.state.index]!.reveal === 'instant') {
      this.finishBeat(true);
      return;
    }
    this.schedule(epoch);
  };
  resume = () => {
    this.play();
  };
  private schedule(epoch: number) {
    this.timer = setTimeout(() => {
      if (epoch !== this.state.epoch || this.state.status !== 'playing') return;
      const beat = this.timeline.beats[this.state.index]!;
      const length = Math.max(35, beat.action.cue.caption.length);
      const progress = Math.min(1, this.state.progress + 2 / length);
      this.publish({ progress });
      if (progress === 1) this.finishBeat(true);
      else this.schedule(epoch);
    }, 35);
  }
  private finishBeat(automatic = false) {
    const epoch = this.fence();
    const pending = this.state.canvas.invitation && !this.state.canvas.invitation.submitted;
    const status = pending
      ? 'awaiting_response'
      : this.state.index === this.timeline.beats.length - 1
        ? 'complete'
        : automatic
          ? 'playing'
          : 'paused';
    this.audioResume = null;
    this.publish({ progress: 1, epoch, status, speech: textPlayback() }, true);
    // Give a complete beat reading time; the epoch fences both reveal and progression.
    if (status === 'playing')
      this.timer = setTimeout(
        () => {
          if (this.state.epoch === epoch && this.state.status === 'playing') this.play();
        },
        this.reducedMotion ? 1800 : 650,
      );
  }
  step = () => {
    if (
      this.state.canvas.invitation &&
      !this.state.canvas.invitation.submitted &&
      this.state.progress === 1
    )
      return;
    if (this.state.status === 'complete') return;
    if (
      this.state.progress < 1 ||
      !this.state.canvas.completedActionIds.includes(
        this.timeline.beats[this.state.index]!.action.actionId,
      )
    ) {
      this.startBeat();
      this.finishBeat();
      return;
    }
    const index = this.state.index + 1;
    if (index >= this.timeline.beats.length) return;
    this.publish({ index, progress: 0, status: 'paused', epoch: this.fence() });
    this.startBeat();
    // Manual stepping shows one complete semantic beat without enabling autoplay.
    this.finishBeat();
  };
  pause = () => {
    if (this.state.speech.preview) this.stopVoicePreview();
    else if (this.state.status === 'playing')
      this.publish({ status: 'paused', epoch: this.fence() }, true);
  };
  interrupt = () => {
    if (this.state.status !== 'complete' || this.state.speech.preview)
      this.publish(
        {
          status: this.state.status === 'complete' ? 'complete' : 'interrupted',
          epoch: this.fence(),
        },
        true,
      );
  };
  select = (selectedId: string | null) => {
    if (selectedId && !this.state.canvas.elements.some((e) => e.id === selectedId)) return;
    this.publish({ selectedId }, true);
  };
  setExplanation = (explanation: string) => {
    this.publish({ explanation: explanation.slice(0, 2000) }, true);
  };
  edit = (operations: CanvasOperation[]) => {
    const state = this.state,
      invitation = state.canvas.invitation;
    if (!invitation || invitation.submitted) throw new Error('No open student checkpoint');
    if (state.progress < 1)
      throw new Error('Finish the teaching step before editing at Your turn.');
    if (this.events.length >= 254)
      throw new Error('Local edit limit reached; submit this work or restart the fixture');
    this.fence();
    const command = studentCanvasCommandSchema.parse({
      mode: 'public_fixture',
      activityId: state.canvas.activityId,
      branchId: state.canvas.branchId,
      checkpointId: invitation.id,
      expectedRevision: state.canvas.revision,
      expectedDraftRevision: state.canvas.draftRevision,
      operations,
    });
    const canvas = applyStudentCanvasCommand(state.canvas, command);
    this.undoStates = [...this.undoStates, state.canvas].slice(-32);
    this.redoStates = [];
    this.events.push({ kind: 'student', command });
    this.publish(
      {
        canvas,
        status: 'awaiting_response',
        epoch: state.epoch + 1,
        selectedId: canvas.elements.some((e) => e.id === state.selectedId)
          ? state.selectedId
          : null,
      },
      true,
    );
  };
  canUndo = () =>
    Boolean(
      this.state.canvas.invitation &&
      !this.state.canvas.invitation.submitted &&
      this.undoStates.length &&
      this.events.length < 254,
    );
  canRedo = () =>
    Boolean(
      this.state.canvas.invitation &&
      !this.state.canvas.invitation.submitted &&
      this.redoStates.length &&
      this.events.length < 254,
    );
  private changeHistory(direction: 'undo' | 'redo') {
    if (!(direction === 'undo' ? this.canUndo() : this.canRedo())) return;
    const source = direction === 'undo' ? this.undoStates : this.redoStates;
    const destination = direction === 'undo' ? this.redoStates : this.undoStates;
    const prior = this.state.canvas,
      canvas = restoreStudentPracticeState(prior, source.at(-1)!);
    source.pop();
    destination.push(prior);
    this.events.push({ kind: 'history', direction, expectedRevision: prior.revision });
    this.publish(
      {
        canvas,
        epoch: this.fence(),
        status: 'awaiting_response',
        selectedId: canvas.elements.some((e) => e.id === this.state.selectedId)
          ? this.state.selectedId
          : null,
      },
      true,
    );
  }
  undo = () => this.changeHistory('undo');
  redo = () => this.changeHistory('redo');
  submit = (feedbackFor: (canvas: SharedCanvasState, explanation: string) => string) => {
    const prior = this.state.canvas,
      invitation = prior.invitation;
    if (!invitation || invitation.submitted) return;
    if (this.state.progress < 1)
      throw new Error('Finish the teaching step before submitting your response.');
    if (this.events.length >= 256) throw new Error('Local operation limit reached');
    const canvas = commitFixtureSubmission(prior, invitation.id, prior.revision);
    const feedback = feedbackFor(canvas, this.state.explanation);
    this.events.push({
      kind: 'submission',
      checkpointId: invitation.id,
      expectedRevision: prior.revision,
    });
    this.undoStates = [];
    this.redoStates = [];
    this.publish(
      {
        canvas,
        progress: 1,
        status: this.state.index === this.timeline.beats.length - 1 ? 'complete' : 'paused',
        epoch: this.fence(),
        feedback,
      },
      true,
    );
  };
  serialize() {
    return JSON.stringify({
      version: 'fixture-checkpoint.v1',
      timelineId: this.timeline.id,
      events: this.events,
      index: this.state.index,
      progress: this.state.progress,
      explanation: this.state.explanation,
      feedback: this.state.feedback,
      selectedId: this.state.selectedId,
      status: this.state.status,
    });
  }
  restore(raw: string) {
    if (raw.length > 128000) throw new Error('Checkpoint budget exceeded');
    const checkpoint = checkpointSchema.parse(JSON.parse(raw));
    if (
      checkpoint.timelineId !== this.timeline.id ||
      checkpoint.index >= this.timeline.beats.length
    )
      throw new Error('Incompatible fixture checkpoint');
    let canvas = initialSharedCanvas(this.timeline.activityId, this.timeline.branchId),
      lastIndex = -1;
    let undo: SharedCanvasState[] = [],
      redo: SharedCanvasState[] = [];
    for (const event of checkpoint.events) {
      if (event.kind === 'action') {
        if (event.index !== lastIndex + 1) throw new Error('Invalid acknowledged prefix');
        const beat = this.timeline.beats[event.index];
        if (!beat) throw new Error('Unknown beat');
        canvas = applyTeachingAction(canvas, {
          ...beat.action,
          expectedCanvasRevision: canvas.revision,
        });
        lastIndex = event.index;
        undo = [];
        redo = [];
      } else if (event.kind === 'student') {
        const prior = canvas;
        canvas = applyStudentCanvasCommand(canvas, event.command);
        undo = [...undo, prior].slice(-32);
        redo = [];
      } else if (event.kind === 'history') {
        const source = event.direction === 'undo' ? undo : redo,
          destination = event.direction === 'undo' ? redo : undo;
        if (!source.length || event.expectedRevision !== canvas.revision)
          throw new Error('Stale practice history');
        const prior = canvas;
        canvas = restoreStudentPracticeState(canvas, source.at(-1)!);
        source.pop();
        destination.push(prior);
      } else {
        canvas = commitFixtureSubmission(canvas, event.checkpointId, event.expectedRevision);
        undo = [];
        redo = [];
      }
    }
    if (
      lastIndex !== checkpoint.index &&
      !(lastIndex === -1 && checkpoint.index === 0 && checkpoint.progress === 0)
    )
      throw new Error('Checkpoint boundary mismatch');
    this.events = checkpoint.events;
    this.undoStates = undo;
    this.redoStates = redo;
    const status =
      canvas.invitation && !canvas.invitation.submitted && checkpoint.progress === 1
        ? 'awaiting_response'
        : lastIndex < 0
          ? 'idle'
          : checkpoint.progress === 1 && checkpoint.index === this.timeline.beats.length - 1
            ? 'complete'
            : checkpoint.status === 'interrupted'
              ? 'interrupted'
              : 'paused';
    const selectedId =
      checkpoint.selectedId === undefined
        ? this.timeline.beats[checkpoint.index]!.action.cue.targetId
        : checkpoint.selectedId;
    this.publish({
      canvas,
      index: checkpoint.index,
      progress: checkpoint.progress,
      explanation: checkpoint.explanation,
      feedback: checkpoint.feedback,
      status,
      epoch: this.fence(),
      speech: textPlayback(),
      selectedId: canvas.elements.some((e) => e.id === selectedId) ? selectedId : null,
    });
  }
  restart = () => {
    const epoch = this.fence();
    this.events = [];
    this.undoStates = [];
    this.redoStates = [];
    this.audioResume = null;
    this.failedAudio.clear();
    this.publish(
      {
        canvas: initialSharedCanvas(this.timeline.activityId, this.timeline.branchId),
        index: 0,
        progress: 0,
        status: 'idle',
        epoch,
        selectedId: null,
        explanation: '',
        feedback: null,
        speech: textPlayback(),
      },
      true,
    );
  };
  dispose() {
    const epoch = this.fence();
    this.state = {
      ...this.state,
      epoch,
      status: this.state.status === 'playing' ? 'paused' : this.state.status,
    };
    this.save?.(this.serialize());
  }
}
