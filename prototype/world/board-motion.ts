import type { ShowcaseState, VisualState } from '../teaching/types';
export interface BoardOperation {
  key: string;
  kind:
    | 'settle'
    | 'highlight'
    | 'network-build'
    | 'network-update'
    | 'rule-link'
    | 'value-pass';
  duration: number;
  concept: string;
  before: VisualState | null;
  after: VisualState;
  source: { id: string | null; pages: number[] };
  inputGate: 'student-controlled';
  interruption: 'freeze-and-resume';
}
export function presentationStatus(s: ShowcaseState) {
  return s.interruptionCheckpoint?.teaching.status ?? s.teaching.status;
}
export function boardKey(s: ShowcaseState, reveal: number, visible: boolean) {
  return JSON.stringify([
    s.questionId,
    s.learning?.taskId,
    s.studentResponse,
    presentationStatus(s),
    s.visualState,
    s.highlightTargetId,
    s.completion[s.questionId ?? ''],
    reveal,
    visible,
  ]);
}
/** Authored visual operations over the validated state. Never dispatches educational commands. */
export function boardOperation(
  s: ShowcaseState,
  previous: ShowcaseState | null,
): BoardOperation {
  const status = presentationStatus(s),
    v = s.visualState;
  const spec: BoardOperation = {
    key: s.questionId ?? 'welcome',
    kind: 'settle',
    duration: 0,
    concept: s.questionId ?? 'orientation',
    before: previous?.visualState ?? null,
    after: v,
    source: { id: s.sourceId, pages: s.sourcePages },
    inputGate: 'student-controlled',
    interruption: 'freeze-and-resume',
  };
  // Mount/reload and a new response gate show a stable, fully readable state.
  if (
    !previous ||
    ['AWAITING_RESPONSE', 'CHECKING_UNDERSTANDING'].includes(status)
  )
    return spec;
  const old = previous.visualState;
  if (
    v.kind === 'network' &&
    old.kind === 'network' &&
    (v.weight !== old.weight || v.input !== old.input)
  )
    return { ...spec, kind: 'network-update', duration: 420 };
  if (
    status === 'DEMONSTRATING' &&
    presentationStatus(previous) !== 'DEMONSTRATING'
  )
    return {
      ...spec,
      kind:
        v.kind === 'network'
          ? 'network-build'
          : v.kind === 'kb'
            ? 'rule-link'
            : v.kind === 'tree'
              ? 'value-pass'
              : 'highlight',
      duration:
        v.kind === 'network'
          ? 1450
          : v.kind === 'kb'
            ? 650
            : v.kind === 'tree'
              ? 650
              : 180,
    };
  if (
    v.kind === 'kb' &&
    old.kind === 'kb' &&
    (v.derived.join() !== old.derived.join() ||
      v.facts.join() !== old.facts.join())
  )
    return { ...spec, kind: 'rule-link', duration: 650 };
  if (
    v.kind === 'tree' &&
    status === 'READY_TO_CONTINUE' &&
    presentationStatus(previous) !== status
  )
    return { ...spec, kind: 'value-pass', duration: 650 };
  if (s.highlightTargetId !== previous.highlightTargetId)
    return { ...spec, kind: 'highlight', duration: 180 };
  return spec;
}
