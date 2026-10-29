import type { CompanionCue } from '@edrion/schemas';
import type { PresentationState } from '../presentation-controller';
import {
  resolveSupportedPose,
  type CompanionDirection,
  type CompanionPose,
} from './companion-policy';

/** No independent animation clock. Local input suppresses instruction until explicit resume. */
export function resolveCompanionCue(
  state: PresentationState,
  published: CompanionCue,
  typing = false,
  reply: string | null = null,
  assessmentSafe = false,
): CompanionCue {
  if (assessmentSafe)
    return {
      mode: 'waiting',
      gesture: 'neutral',
      targetId: null,
      caption: 'Your response stays yours. Submit when you’re ready.',
    };
  if (typing)
    return {
      mode: 'listening',
      gesture: 'neutral',
      targetId: null,
      caption: 'Take your time with your question.',
    };
  if (reply && state.status !== 'playing')
    return { mode: 'teaching', gesture: 'neutral', targetId: null, caption: reply };
  if (state.status === 'playing') return published;
  if (state.feedback && state.canvas.invitation?.submitted)
    return { mode: 'acknowledging', gesture: 'neutral', targetId: null, caption: state.feedback };
  if (state.status === 'interrupted')
    return {
      mode: 'listening',
      gesture: 'neutral',
      targetId: state.selectedId,
      caption: 'Paused here. Ask about this part, then resume when you’re ready.',
    };
  if (state.status === 'awaiting_response')
    return {
      mode: 'waiting',
      gesture: 'neutral',
      targetId: null,
      caption: 'The canvas is yours. I’ll wait while you work.',
    };
  return {
    mode: state.status === 'paused' ? 'paused' : 'waiting',
    gesture: 'neutral',
    targetId: state.selectedId,
    caption:
      state.status === 'idle'
        ? 'Pick a passage, equation, or diagram to work through.'
        : state.status === 'complete'
          ? 'The example is complete. Your work stays here if you want to discuss it.'
          : 'Your place is saved. Continue when you’re ready.',
  };
}

/** Pose admission sampled by the shared presentation updates; owns no timer or timeline.
 * Each authored action can gesture once. Pause, typing, missing targets and media stalls
 * revoke it immediately, and resuming the same action does not repeat the reaction. */
export class CompanionPoseController {
  private seen = new Set<string>();
  private active: {
    actionId: string;
    targetId: string;
    pose: CompanionPose;
    until: number;
    epoch: number;
  } | null = null;
  private lastGestureAt = -Infinity;
  resolve(
    state: PresentationState,
    cue: CompanionCue,
    direction: CompanionDirection | null,
    actionId: string,
    now: number,
    options: {
      reducedMotion: boolean;
      disabledCapabilities?: readonly string[];
      assessmentSafe?: boolean;
    },
  ): CompanionPose {
    if (!state.canvas.completedActionIds.length) {
      this.seen.clear();
      this.active = null;
      this.lastGestureAt = -Infinity;
    }
    if (options.assessmentSafe) {
      this.active = null;
      return 'neutral';
    }
    if (state.status !== 'playing' && !state.speech.preview && cue.mode === 'listening') {
      this.active = null;
      // An explicit question admits the authored attentive pose. It does not
      // admit a teaching gesture, speaking image or an independent animation.
      return resolveSupportedPose(cue, state.canvas, null, {
        disabledCapabilities: options.disabledCapabilities,
      });
    }
    const checkpoint = state.interactionCue;
    const acceptedCheckpoint =
      checkpoint &&
      checkpoint.id === actionId &&
      checkpoint.epoch === state.epoch &&
      checkpoint.canvasRevision === state.canvas.revision &&
      checkpoint.targetId === cue.targetId &&
      state.canvas.elements.some(
        (e) => e.id === checkpoint.targetId && e.version === checkpoint.elementVersion,
      );
    const allowed =
      state.status === 'playing' &&
      state.progress < 1 &&
      cue.mode === 'teaching' &&
      Boolean(actionId) &&
      (actionId === state.canvas.completedActionIds.at(-1) || acceptedCheckpoint) &&
      state.speech.phase !== 'loading' &&
      state.speech.phase !== 'stalled';
    const poseOptions = {
      disabledCapabilities: options.disabledCapabilities,
      // The same presentation owner can play an explicit preview while the
      // teaching checkpoint is interrupted. Only its actual playing event admits
      // this static speech image; it grants no teaching gesture authority.
      speaking: state.speech.phase === 'speaking' && (allowed || Boolean(state.speech.preview)),
    };
    const candidate = resolveSupportedPose(cue, state.canvas, direction, poseOptions);
    const settled = resolveSupportedPose(
      { ...cue, gesture: 'neutral', targetId: null },
      state.canvas,
      null,
      poseOptions,
    );
    if (!allowed || options.reducedMotion || !candidate.startsWith('point-')) {
      this.active = null;
      return candidate.startsWith('point-') || candidate === 'neutral' ? settled : candidate;
    }
    if (
      this.active?.actionId === actionId &&
      this.active.epoch === state.epoch &&
      this.active.targetId === cue.targetId
    ) {
      // Placement/scroll can change the cardinal direction within a hold. Keep
      // the admitted authored pose; do not flip between full-body PNGs mid-gesture.
      return now < this.active.until ? this.active.pose : settled;
    }
    this.active = null;
    if (this.seen.has(actionId) || now - this.lastGestureAt < 6000) return settled;
    this.seen.add(actionId);
    this.lastGestureAt = now;
    const variation = [...actionId].reduce((n, c) => n + c.charCodeAt(0), 0) % 3;
    this.active = {
      actionId,
      targetId: cue.targetId!,
      pose: candidate,
      epoch: state.epoch,
      until: now + 700 + variation * 120,
    };
    return candidate;
  }
}

// M6 admission uses the same active surface owner as the existing fixture adapter.
// It cannot choose a teaching action, write to the canvas, or create evidence.
import { companionEventSchema, type CompanionEvent } from '@edrion/schemas';
export type CompanionLocalState = {
  interaction: 'idle' | 'typing' | 'dragging' | 'listening';
  visibility: 'visible' | 'hidden';
  paused: boolean;
  revoked: boolean;
  reducedMotion: boolean;
  pendingOperation?: boolean;
};
export type CompanionAuthority = {
  acceptedCue?: CompanionEvent;
  sessionId: string;
  revision: number;
  epoch: number;
  activityRevision: number;
  activityId?: string | null;
  sourceRevisionId: string | null;
  sourceHash: string | null;
  assessment: boolean;
  committed: boolean;
};
export type CompanionVisual = {
  intent: CompanionEvent['intent'];
  expression: CompanionEvent['expression'];
  gesture: CompanionEvent['gesture'];
  targetId: string | null;
  caption: string;
  eventId: string | null;
  attentionPhase?: 'look' | 'gesture' | 'highlight' | 'settled';
  nextAt?: number;
};
const resting = (caption = ''): CompanionVisual => ({
  intent: 'waiting',
  expression: 'neutral',
  gesture: 'settled',
  targetId: null,
  caption,
  eventId: null,
});
export class CompanionController {
  private seen = new Set<string>();
  private lastPoint = -Infinity;
  private lastAcknowledgment = -Infinity;
  private active: {
    id: string;
    start: number;
    until: number;
    gesture: CompanionEvent['gesture'];
  } | null = null;
  private recent: string[] = [];
  private scope = '';
  resolve(
    raw: unknown,
    authority: CompanionAuthority,
    local: CompanionLocalState,
    now: number,
    visibleTarget: string | null,
  ): CompanionVisual {
    if (local.revoked || local.paused || local.visibility === 'hidden') {
      this.active = null;
      return {
        ...resting(
          local.revoked
            ? 'This lesson is unavailable.'
            : local.paused
              ? 'Your place is saved.'
              : '',
        ),
        intent: local.revoked ? 'blocked' : 'paused',
      };
    }
    const parsed = companionEventSchema.safeParse(raw);
    if (!parsed.success) {
      this.active = null;
      return resting();
    }
    const c = parsed.data;
    const scope = `${authority.sessionId}:${authority.sourceRevisionId}:${authority.sourceHash}`;
    if (this.scope !== scope) {
      this.scope = scope;
      this.active = null;
      this.recent = [];
      this.lastPoint = -Infinity;
      this.lastAcknowledgment = -Infinity;
    }
    if (
      (authority.acceptedCue && JSON.stringify(c) !== JSON.stringify(authority.acceptedCue)) ||
      c.sessionId !== authority.sessionId ||
      c.revision !== authority.revision ||
      c.epoch !== authority.epoch ||
      c.activityRevision !== authority.activityRevision ||
      (authority.activityId !== undefined && c.activityId !== authority.activityId) ||
      c.sourceRevisionId !== authority.sourceRevisionId ||
      c.sourceHash !== authority.sourceHash ||
      c.expiresAt <= now ||
      c.issuedAt > now + 5000
    ) {
      this.active = null;
      return resting();
    }
    if (local.interaction !== 'idle') {
      this.seen.add(c.eventId);
      this.active = null;
      return {
        ...resting(
          local.interaction === 'listening'
            ? 'Listening to your question…'
            : 'Take your time. I’ll stay quiet while you work.',
        ),
        intent: local.interaction === 'listening' ? 'listening' : 'waiting',
        expression: authority.assessment ? 'neutral' : 'attentive',
      };
    }
    if (authority.assessment) {
      this.active = null;
      return resting('Your response stays yours. Submit when you’re ready.');
    }
    // A request is genuinely in flight, but it is not a saved pause or an
    // evaluation result. Do not consume the arriving public cue before the
    // mutation owner has finished applying its acknowledged snapshot.
    if (local.pendingOperation) {
      this.active = null;
      return resting('Saving your change…');
    }
    if (c.assistancePolicy === 'committed_feedback' && !authority.committed) {
      this.active = null;
      return resting();
    }
    const visual: CompanionVisual = {
      intent: c.intent,
      expression: c.expression,
      gesture: 'settled',
      targetId: null,
      caption: c.caption,
      eventId: c.eventId,
    };
    // Invalid geometry revokes gaze as well as gesture. Captions survive settling.
    if (c.targetId && c.targetId === visibleTarget) visual.targetId = c.targetId;
    if (local.reducedMotion) {
      this.seen.add(c.eventId);
      this.active = null;
      return visual;
    }
    if (this.active?.id === c.eventId) {
      if (now < this.active.until && (this.active.gesture !== 'point' || visual.targetId)) {
        const elapsed = now - this.active.start;
        visual.gesture =
          this.active.gesture === 'point' && elapsed < 160 ? 'settled' : this.active.gesture;
        visual.attentionPhase = elapsed < 160 ? 'look' : elapsed < 420 ? 'gesture' : 'highlight';
        visual.nextAt =
          this.active.gesture === 'point'
            ? elapsed < 160
              ? this.active.start + 160
              : elapsed < 420
                ? this.active.start + 420
                : this.active.until
            : this.active.until;
      } else {
        this.active = null;
        visual.targetId = null;
        visual.attentionPhase = 'settled';
      }
      return visual;
    }
    this.active = null;
    if (this.seen.has(c.eventId)) return { ...visual, targetId: null };
    // A freshly committed canvas target registers after the first render. Wait
    // for its current geometry; never spend the one gesture on an absent target.
    if (c.gesture === 'point' && !visual.targetId) return visual;
    this.seen.add(c.eventId);
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!);
    const gesture = c.gesture;
    const meaningful = gesture === 'point' && !!visual.targetId && now - this.lastPoint >= 30000;
    const earned =
      (gesture === 'nod' || gesture === 'acknowledge') &&
      c.result === 'correct' &&
      authority.committed &&
      now - this.lastAcknowledgment >= 30000;
    const explanation =
      gesture === 'open-hand' &&
      c.assistancePolicy === 'public_teaching' &&
      now - this.lastPoint >= 30000;
    if (meaningful || earned || explanation) {
      // Equivalent acknowledgment variants are seeded by public identity; no frame/model randomness.
      const variant = earned
        ? (['nod', 'acknowledge'] as const).find((v) => !this.recent.includes(v))
        : gesture;
      if (!variant) return visual;
      this.recent.push(variant);
      this.recent = this.recent.slice(-3);
      this.active = { id: c.eventId, start: now, until: now + 1120, gesture: variant };
      visual.gesture = meaningful ? 'settled' : variant;
      visual.attentionPhase = meaningful ? 'look' : 'gesture';
      visual.nextAt = meaningful ? now + 160 : now + 1120;
      if (earned) this.lastAcknowledgment = now;
      else this.lastPoint = now;
    }
    return visual;
  }
  /** Reload recovery may mark the last displayed event settled without replaying it. */
  settle(eventId: string) {
    this.seen.add(eventId);
    this.active = null;
  }
}
