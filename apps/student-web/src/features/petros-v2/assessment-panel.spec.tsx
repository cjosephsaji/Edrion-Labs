import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { m4SnapshotSchema, type M4Snapshot } from '@edrion/schemas';
import { AssessmentPanel } from './assessment-panel';
const id = '10000000-0000-4000-8000-000000000001';
function snapshot(extra: Partial<M4Snapshot> = {}): M4Snapshot {
  return m4SnapshotSchema.parse({
    engine: 'v2',
    id,
    lesson: null,
    status: 'active',
    stage: 'awaiting_response',
    revision: 1,
    epoch: 0,
    task: {
      taskId: id,
      instanceHash: 'a'.repeat(64),
      prompt: 'Explain which observation supports the claim.',
      passage: 'A short authorized passage.',
      responseKind: 'text',
      choices: [],
      fields: [],
      helpPolicy: 'no_hints',
      citation: 'Synthetic passage',
    },
    draft: '',
    canvas: null,
    checkpointId: null,
    submission: null,
    evaluation: null,
    actions: ['pause'],
    progress: {
      contentViewed: true,
      responsesCommitted: 0,
      responsesEvaluated: 0,
      criteriaObserved: 0,
      mastery: false,
    },
    message: 'Saved session.',
    ...extra,
  });
}
afterEach(cleanup);
describe('M4 student assessment commitment and honest status', () => {
  it.each(['unavailable', 'invalidated', 'review_required'] as const)(
    'never reuses satisfied criterion markers from %s feedback',
    (status) => {
      // Deliberately stale component props: the public schema independently
      // rejects these combinations before they normally reach this view.
      const s = Object.assign(snapshot(), {
        submission: {
          id,
          commandId: id,
          status: 'complete',
          response: { kind: 'text', text: 'Saved work.' },
        },
        evaluation: {
          id,
          responseId: id,
          status,
          evaluatorVersion: 'petros.m4.kernel.v1',
          supersedes: null,
          reason: null,
          criteria: [
            {
              criterionId: id,
              label: 'Reasoning',
              status: 'satisfied',
              origin: 'trusted_kernel',
              feedback: 'An earlier observation.',
            },
          ],
        },
      } as Partial<M4Snapshot>);
      render(
        <AssessmentPanel
          snapshot={s}
          busy={false}
          draft=""
          onDraft={() => {}}
          onSave={vi.fn()}
          onSubmit={vi.fn()}
        />,
      );
      expect(screen.queryByLabelText('Criterion satisfied')).toBeNull();
      expect(screen.queryByText('Deterministically checked')).toBeNull();
      expect(screen.getByLabelText('Your answer')).toHaveValue('Saved work.');
    },
  );
  it('keeps the response accessible name stable when saved prose is restored', () => {
    render(
      <AssessmentPanel
        snapshot={snapshot()}
        busy={false}
        draft={JSON.stringify({ answer: 'Restored student work.' })}
        onDraft={() => {}}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue(
      'Restored student work.',
    );
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveAccessibleName(
      'Your answer',
    );
  });
  it('keeps a restored structured text field independently labelled', () => {
    const base = snapshot();
    render(
      <AssessmentPanel
        snapshot={snapshot({
          task: {
            ...base.task!,
            responseKind: 'structured',
            fields: [
              { id: 'reasoning', label: 'Explain your reasoning', kind: 'text', choices: [] },
            ],
          },
        })}
        busy={false}
        draft={JSON.stringify({ reasoning: 'Restored explanation.' })}
        onDraft={() => {}}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Explain your reasoning' })).toHaveValue(
      'Restored explanation.',
    );
    expect(screen.getByRole('textbox', { name: 'Explain your reasoning' })).toHaveAccessibleName(
      'Explain your reasoning',
    );
  });
  it('labels the input and submits only typed work', () => {
    const onSubmit = vi.fn();
    render(
      <AssessmentPanel
        snapshot={snapshot()}
        busy={false}
        draft=""
        onDraft={() => {}}
        onSave={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText('Your answer'), {
      target: { value: 'The observed preference supports later access.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'text',
      text: 'The observed preference supports later access.',
    });
  });
  it('binds a numeric value and the student-entered unit without a client score', () => {
    const onSubmit = vi.fn(),
      base = snapshot();
    render(
      <AssessmentPanel
        snapshot={snapshot({ task: { ...base.task!, responseKind: 'number', passage: null } })}
        busy={false}
        draft=""
        onDraft={() => {}}
        onSave={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Unit (if required)'), { target: { value: 'm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: 'number', value: 12, unit: 'm' });
  });
  it('does not send an empty answer', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <AssessmentPanel
        snapshot={snapshot()}
        busy={false}
        draft=""
        onDraft={() => {}}
        onSave={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Write your answer');
  });
  it('disables the submit control and input while the answer is saving', () => {
    render(
      <AssessmentPanel
        snapshot={snapshot()}
        busy
        draft="hello"
        onDraft={() => {}}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(
      (screen.getByRole('button', { name: 'Saving your answer…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByLabelText('Your answer').closest('fieldset')!.disabled).toBe(true);
  });
  it('reloads committed work and announces saved pending evaluation without inviting resubmission', () => {
    render(
      <AssessmentPanel
        snapshot={snapshot({
          stage: 'evaluating',
          submission: {
            id,
            commandId: id,
            status: 'pending',
            response: { kind: 'text', text: 'My exact submitted answer' },
          },
          message: 'Your answer was submitted. Checking your response…',
        })}
        busy={false}
        draft=""
        onDraft={() => {}}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect((screen.getByLabelText('Your answer') as HTMLTextAreaElement).value).toBe(
      'My exact submitted answer',
    );
    expect(screen.getByRole('status').textContent).toContain('Checking your response');
    expect(screen.queryByRole('button', { name: 'Submit answer' })).toBeNull();
  });
  it('shows unavailable feedback without claiming correctness', () => {
    const s = snapshot({
      submission: {
        id,
        commandId: id,
        status: 'complete',
        response: { kind: 'text', text: 'Saved' },
      },
      message: "Your answer is saved. Feedback isn't available yet.",
      evaluation: {
        id,
        responseId: id,
        status: 'unavailable',
        criteria: [
          {
            criterionId: id,
            label: 'Explanation',
            status: 'abstained',
            origin: 'review_required',
            feedback: 'Feedback is not available yet.',
          },
        ],
        evaluatorVersion: 'petros.m4.kernel.v1',
        supersedes: null,
        reason: null,
      },
    });
    render(
      <AssessmentPanel
        snapshot={s}
        busy={false}
        draft=""
        onDraft={() => {}}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Feedback unavailable' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('saved');
    expect(screen.queryByText('Correct!')).toBeNull();
  });
});
