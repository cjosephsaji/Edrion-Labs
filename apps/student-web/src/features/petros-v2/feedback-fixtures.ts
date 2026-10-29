/** Isolated visual regression fixtures. No fixture outcome enters a live session. */
import { m4SnapshotSchema, type M4Snapshot } from '@edrion/schemas';
import type { FeedbackState } from './feedback-state';
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function feedbackFixture(state: FeedbackState): M4Snapshot {
  const evaluated = ['correct', 'incorrect', 'partial', 'review', 'assisted'].includes(state);
  const submitted = evaluated || state === 'pending';
  const values = { responsibility: 'provider', available: 48, capacity: 6 };
  const criteria = [
    'Responsibility classification',
    'Available memory calculation',
    'VM capacity',
  ].map((label, i) => ({
    criterionId: id(i + 10),
    label,
    status:
      state === 'review' && i === 0
        ? 'abstained'
        : state === 'incorrect' || (state === 'partial' && i === 0)
          ? 'not_satisfied'
          : 'satisfied',
    origin: state === 'review' && i === 0 ? 'review_required' : 'trusted_kernel',
    feedback:
      state === 'review' && i === 0
        ? 'A teacher needs to review this interpretation.'
        : state === 'incorrect' || (state === 'partial' && i === 0)
          ? 'This criterion needs another look. Revisit the relationship in the source.'
          : 'Your response meets this criterion.',
    target: { fieldId: ['responsibility', 'available', 'capacity'][i] },
  }));
  return m4SnapshotSchema.parse({
    engine: 'v2',
    id: id(1),
    lesson: null,
    status: 'active',
    stage: state === 'pending' ? 'evaluating' : 'awaiting_response',
    revision: 1,
    epoch: 0,
    task: {
      taskId: id(2),
      instanceHash: 'a'.repeat(64),
      prompt: 'Isolated feedback component fixture',
      passage: null,
      responseKind: 'structured',
      choices: [],
      fields: [
        {
          id: 'responsibility',
          label: 'Responsibility',
          kind: 'choice',
          choices: [
            { id: 'provider', label: 'Provider' },
            { id: 'consumer', label: 'Consumer' },
          ],
        },
        {
          id: 'available',
          label: 'Available memory',
          kind: 'number',
          choices: [],
        },
        { id: 'capacity', label: 'VM capacity', kind: 'number', choices: [] },
      ],
      helpPolicy: 'assisted_practice',
      citation: 'Isolated synthetic fixture · no academic result',
    },
    draft: state === 'saved' ? JSON.stringify(values) : '',
    canvas: null,
    checkpointId: null,
    submission: submitted
      ? {
          id: id(3),
          commandId: id(4),
          status: state === 'pending' ? 'pending' : 'complete',
          response: { kind: 'structured', values },
        }
      : null,
    evaluation: evaluated
      ? {
          id: id(5),
          responseId: id(3),
          status: state === 'review' ? 'review_required' : 'evaluated',
          criteria,
          evaluatorVersion: 'petros.m4.kernel.v1',
          supersedes: null,
          reason: null,
        }
      : null,
    actions: [],
    assistance: state === 'assisted' ? 'assisted' : 'independent',
    progress: {
      contentViewed: true,
      responsesCommitted: submitted ? 1 : 0,
      responsesEvaluated: evaluated ? 1 : 0,
      criteriaObserved: 0,
      mastery: false,
    },
    message: state === 'pending' ? 'Checking the committed response…' : '',
  });
}
export const galleryStates: FeedbackState[] = [
  'not-selected',
  'selected',
  'saved',
  'pending',
  'correct',
  'incorrect',
  'partial',
  'review',
  'assisted',
];
