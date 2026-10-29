import {
  currentAllocationAttempt,
  allocationAttemptObservation,
  type M4Snapshot,
} from '@edrion/schemas';
import { CompanionController, type CompanionLocalState } from './companion-controller';

export type ClassicCloud = {
  id: string;
  kind: 'speech' | 'thought' | 'notice';
  title: string;
  text: string;
  priority: number;
  delay: number;
  duration: number | null;
};
export const classicScope = (s: M4Snapshot) => {
  const ref = s.teaching?.reference ?? s.lesson?.references[0];
  return `${s.id}:${s.canvas?.activityId}:${s.canvas?.branchId}:${s.teaching?.actionId ?? 'task'}:${s.task?.taskId ?? ''}:${ref?.sourceRevisionId}:${ref?.sourceHash}`;
};
export type RequestedClassicHelp = {
  scope: string;
  epoch: number;
  id: string;
  text: string;
  expiresAt: number;
};

/** Supplemental cloud lifecycle under the existing M6 admission owner. No academic
 * transitions or animation authority. One deadline, no queue, bounded deduplication. */
export class ClassicCloudController {
  private admission = new CompanionController();
  private scope = '';
  private epoch = -1;
  private seen = new Set<string>();
  private active: { cue: ClassicCloud; from: number; until: number } | null = null;
  dismiss() {
    this.active = null;
  }
  /** Optional presentation-only reload recovery. Never restores a caption or answer. */
  settle(scope: string, eventId: string) {
    if (this.scope !== scope) {
      this.scope = scope;
      this.seen.clear();
      this.active = null;
    }
    this.seen.add(eventId);
  }
  update(
    s: M4Snapshot,
    local: CompanionLocalState,
    now: number,
    help?: RequestedClassicHelp | null,
    explanationAttempt?: string | null,
  ) {
    const scope = classicScope(s);
    if (scope !== this.scope) {
      this.scope = scope;
      this.seen.clear();
      this.active = null;
    }
    if (s.epoch !== this.epoch) {
      this.epoch = s.epoch;
      this.active = null;
    }
    const event = s.companion;
    const ref = s.teaching?.reference ?? s.lesson?.references[0];
    const authorizedHelp =
      !!help &&
      help.scope === scope &&
      help.epoch === s.epoch &&
      help.expiresAt > now &&
      help.text === s.lesson?.explanation &&
      (!s.task ||
        !!s.submission ||
        (s.task.helpPolicy === 'assisted_practice' && s.assistance === 'assisted'));
    const admitted =
      event &&
      this.admission.resolve(
        event,
        {
          acceptedCue: event,
          sessionId: s.id,
          revision: s.revision,
          epoch: s.epoch,
          activityId: s.canvas?.activityId ?? null,
          activityRevision: s.canvas?.revision ?? 0,
          sourceRevisionId: ref?.sourceRevisionId ?? null,
          sourceHash: ref?.sourceHash ?? null,
          assessment: !!s.task && !s.submission && !authorizedHelp,
          committed: !!s.submission,
        },
        // Requested reading remains admitted during input; the view hides its
        // cloud and offers a reader link. All scope/revocation checks still run.
        authorizedHelp ? { ...local, interaction: 'idle' } : local,
        now,
        null,
      );
    // Pending saves do not consume a newly arriving confirmed event.
    if (local.pendingOperation) return { cloud: null, nextAt: undefined };
    if (!admitted?.eventId || local.revoked || local.paused || local.visibility === 'hidden') {
      this.active = null;
      return { cloud: null, nextAt: undefined };
    }
    // Preserve explicitly requested reading while input hides its presentation.
    // Automatic cues are consumed on interruption and cannot replay on blur.
    if (local.interaction !== 'idle' && !authorizedHelp) {
      if (this.active) this.seen.add(this.active.cue.id);
      this.active = null;
      return { cloud: null, nextAt: undefined };
    }
    const element = s.canvas?.elements.find((e) => e.kind === 'allocation');
    const r = element?.kind === 'allocation' ? element.resource : null;
    const attempt = r && currentAllocationAttempt(r);
    const current =
      attempt &&
      attempt.sessionId === s.id &&
      attempt.activityId === s.canvas?.activityId &&
      attempt.branchId === s.canvas?.branchId &&
      attempt.sourceRevisionId === ref?.sourceRevisionId &&
      attempt.sourceHash === ref?.sourceHash &&
      attempt.modelRevision === JSON.stringify(r?.model) &&
      attempt.canvasRevision <= (s.canvas?.revision ?? -1);
    const observation = current && r ? allocationAttemptObservation(r, attempt) : null;
    if (attempt) this.seen.add(`intro:${scope}`);
    let cue: ClassicCloud | null = null;
    const speech = (id: string, text: string, duration = 4000): ClassicCloud => ({
      id,
      kind: 'speech',
      title: 'Petros says',
      text,
      priority: 30,
      delay: 0,
      duration,
    });
    if (s.companion?.intent === 'blocked') {
      cue = { ...speech(event!.eventId, admitted.caption), kind: 'notice', priority: 100 };
    } else if (help && authorizedHelp) {
      cue = {
        id: help.id,
        kind: 'thought',
        title: 'Think about this',
        text: help.text,
        priority: 80,
        delay: 0,
        duration: null,
      };
    } else if (s.submission && !s.teaching) {
      cue = speech(event!.eventId, admitted.caption);
    } else if (current && attempt?.status === 'explained') {
      cue = speech(`${attempt.id}:saved`, "Saved. Your explanation hasn't been checked yet.");
    } else if (current && observation && explanationAttempt === attempt?.id) {
      cue = speech(
        `${attempt.id}:explain`,
        observation.admitted
          ? 'Why did this VM fit in the remaining memory?'
          : `What stopped VM ${attempt.requestedCount} from fitting?`,
        3800,
      );
    } else if (current && observation && !observation.admitted && r) {
      const requested = attempt!.requestedCount - attempt!.initial.allocatedCount;
      cue = {
        ...speech(
          `${attempt!.id}:refused`,
          requested === 1
            ? `No room left. This VM needs ${r.model.perVMGB} GB, but only ${observation.remainingGB} GB is available.`
            : `That request needs ${requested * r.model.perVMGB} GB for ${requested} VMs, but ${observation.remainingGB} GB is free.`,
          6000,
        ),
        kind: 'notice',
        title: 'Not enough room',
        priority: 60,
      };
    } else if (current && attempt?.status === 'predicted') {
      cue = speech(`${attempt.id}:prediction`, "Let's test your prediction.", 2700);
    } else if (
      r &&
      !attempt &&
      (!s.task || !!s.submission) &&
      s.teaching?.status === 'participating'
    ) {
      cue = {
        ...speech(`intro:${scope}`, 'How many VMs do you think will fit?'),
        delay: 700,
        priority: 10,
      };
    } else if (!r && admitted.caption && (!s.task || !!s.submission || authorizedHelp)) {
      // Other subjects use the same M6-admitted public caption. No local hint,
      // correctness verdict or synthetic subject workflow is generated here.
      cue = speech(event!.eventId, admitted.caption);
    }
    // A different confirmed attempt must cancel the old cloud even when the new
    // state intentionally has no message (routine accepted allocation).
    if (this.active && cue && this.active.cue.id !== cue.id && this.active.cue.kind !== 'thought')
      this.active = null;
    if (!cue) this.active = null;
    else if (this.active?.cue.id !== cue.id && !this.seen.has(cue.id)) {
      if (!this.active || cue.priority >= this.active.cue.priority || this.active.until <= now) {
        this.seen.add(cue.id);
        if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!);
        const until = Math.min(
          event!.expiresAt,
          help?.id === cue.id ? help.expiresAt : Infinity,
          cue.duration === null ? Infinity : now + cue.delay + cue.duration,
        );
        this.active = { cue, from: now + cue.delay, until };
      }
    } else if (this.active && this.active.cue.id !== cue.id) this.active = null;
    if (this.active && this.active.until <= now) this.active = null;
    const active = this.active;
    return {
      cloud: active && now >= active.from ? active.cue : null,
      nextAt: active ? (now < active.from ? active.from : active.until) : undefined,
    };
  }
}
