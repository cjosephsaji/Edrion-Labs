import type { CompanionCue, M4Snapshot, PresentationTimeline } from '@edrion/schemas';
import { feedbackSummary } from './feedback-state';
import type { PresentationState } from './presentation-controller';

type Lesson = NonNullable<M4Snapshot['lesson']>;
type SourceExcerpt = NonNullable<Lesson['excerpts']>[number];

/** Keep structured excerpts whole and retain their exact source binding. Text
 * matching cannot distinguish identical wording from two different references. */
export function studioPassages(lesson: Lesson): { text: string; source?: SourceExcerpt }[] {
  const paragraphs = lesson.explanation.split(/\n\s*\n/).filter((text) => text.trim());
  // A bounded timeline must not silently discard long or highly fragmented text.
  const explanation =
    paragraphs.length > 6 || paragraphs.some((text) => text.length > 2000)
      ? [lesson.explanation]
      : paragraphs;
  return [
    ...explanation.flatMap((text) =>
      (text.match(/[\s\S]{1,2000}/g) ?? []).map((part) => ({ text: part })),
    ),
    ...(lesson.excerpts ?? [])
      .filter((excerpt) => excerpt.text.trim())
      .map((source) => ({
        text: source.text,
        source,
      })),
  ];
}

export function studioExcerpt(lesson: Lesson, elementId: string | null | undefined) {
  const index = /^excerpt-(\d+)$/.exec(elementId ?? '');
  return index ? studioPassages(lesson)[Number(index[1])]?.source : undefined;
}

/** Read-only view adapter. The existing fixture-subset renderer is used only to
 * reveal exact public text. Its canvas is never submitted or persisted as M4 work.
 * M4 remains the sole task/command/evaluation authority. No subject inference. */
export function studioTimeline(lesson: NonNullable<M4Snapshot['lesson']>): PresentationTimeline {
  const passages = studioPassages(lesson);
  return {
    schemaVersion: 'petros.v2.timeline.v1',
    mode: 'public_fixture',
    id: `studio-${lesson.objective.id}`,
    activityId: 'studio-reading',
    branchId: 'public-reading',
    beats: passages.map(({ text, source }, i) => ({
      id: `reading-${i}`,
      reveal: 'progressive',
      completion: 'text-step',
      accessibleAlternative: `Read source excerpt ${i + 1}.`,
      action: {
        schemaVersion: 'petros.v2.teaching-action.v1',
        mode: 'public_fixture',
        compilerVersion: 'fixture-subset.v1',
        capabilityVersion: 'canvas-subset.v1',
        type: 'read_source',
        actionId: `reading-action-${i}`,
        activityId: 'studio-reading',
        branchId: 'public-reading',
        sequence: i + 1,
        expectedCanvasRevision: i,
        sourceId: 'authorized-lesson',
        purpose: 'Read the authorized source.',
        operations: [
          {
            type: 'add',
            element: {
              id: `excerpt-${i}`,
              version: 1,
              label: `Excerpt ${i + 1}`,
              kind: 'text',
              text,
              sourceId: 'authorized-lesson',
              editable: false,
            },
          },
          { type: 'highlight', ids: [`excerpt-${i}`] },
        ],
        cue: {
          mode: 'teaching',
          gesture: 'point-right',
          targetId: `excerpt-${i}`,
          caption:
            i === 0
              ? 'Let’s look at the source together. Follow the highlight.'
              : source?.table
                ? 'Compare the source rows. Choose one to see its responsibilities.'
                : 'Let’s compare this wording with the previous source.',
        },
        cancellation: 'preserve-semantic-prefix',
      },
    })),
  };
}

/** Only public server status may produce a feedback cue. Draft contents never enter here. */
export function studioCue(
  snapshot: M4Snapshot,
  state: PresentationState,
  published: CompanionCue,
  asking: boolean,
): CompanionCue {
  const neutral = (mode: CompanionCue['mode'], caption: string): CompanionCue => ({
    mode,
    caption,
    gesture: 'neutral',
    targetId: null,
  });
  if (snapshot.status !== 'active')
    return neutral(
      'paused',
      snapshot.status === 'paused'
        ? 'Your place is saved. Come back when you’re ready.'
        : 'Your saved work stays with this session.',
    );
  if (snapshot.submission) {
    const evaluation = snapshot.evaluation;
    if (evaluation?.status === 'unavailable')
      return neutral(
        'waiting',
        'Your answer is saved. Feedback is unavailable; correctness has not been established.',
      );
    if (
      !evaluation ||
      evaluation.responseId !== snapshot.submission.id ||
      snapshot.submission.status !== 'complete'
    )
      return neutral(
        'waiting',
        'Your answer is saved. We’ll keep it here while feedback is pending.',
      );
    if (evaluation.status === 'review_required')
      return neutral(
        'waiting',
        'Your explanation is saved for review. I can’t confirm its correctness yet.',
      );
    if (evaluation.status !== 'evaluated')
      return neutral('waiting', 'Your answer is saved. The earlier feedback is no longer current.');
    const summary = feedbackSummary(snapshot);
    if (summary.state === 'pending')
      return neutral('waiting', 'Your answer is saved. Correctness is not established yet.');
    return neutral(
      summary.state === 'correct' ? 'acknowledging' : 'thinking',
      summary.state === 'correct'
        ? 'The checked parts passed. Review the feedback before trying the next step.'
        : summary.state === 'partial'
          ? `${summary.label}. Keep those parts; let’s revisit the marked criterion.`
          : 'This work needs another look. We can revisit the marked criterion together.',
    );
  }
  if (snapshot.task)
    return neutral('waiting', 'Over to you. Take your time — I’ll stay quiet while you work.');
  if (asking)
    return neutral(
      'listening',
      'We can pause here. In this version I can bring back the reviewed source wording.',
    );
  if (state.status === 'playing') {
    if (
      published.targetId &&
      (!state.canvas.elements.some((element) => element.id === published.targetId) ||
        !state.canvas.highlightedIds.includes(published.targetId))
    )
      return neutral('waiting', 'We can continue from the current source excerpt.');
    return published;
  }
  if (snapshot.lesson && studioExcerpt(snapshot.lesson, state.selectedId)?.table)
    return neutral(
      'waiting',
      'The table’s yours to explore. Compare a row, then try the question when you’re ready.',
    );
  return neutral(
    'waiting',
    state.canvas.elements.length > 1
      ? 'Compare these excerpts at your own pace. Ready to try one?'
      : 'Start with this idea. We can take the source one excerpt at a time.',
  );
}

export function studioSourceKey(s: M4Snapshot) {
  const raw = JSON.stringify([
    s.id,
    s.lesson?.objective,
    s.lesson?.references,
    s.lesson?.explanation,
    s.lesson?.excerpts,
  ]);
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  return `${s.id}:${(hash >>> 0).toString(16)}`;
}
