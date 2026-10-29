import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { feedbackFixture, galleryStates } from './feedback-fixtures';
import { AssessmentPanel } from './assessment-panel';
import { criteriaFor, criterionState, feedbackSummary } from './feedback-state';
afterEach(cleanup);
function show(state: (typeof galleryStates)[number]) {
  const s = feedbackFixture(state);
  return {
    s,
    ...render(
      <AssessmentPanel
        snapshot={s}
        busy={false}
        draft={
          state === 'not-selected'
            ? ''
            : JSON.stringify({
                responsibility: 'provider',
                available: 48,
                capacity: 6,
              })
        }
        onDraft={vi.fn()}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
      />,
    ),
  };
}
describe('M5 semantic feedback safety', () => {
  it.each(galleryStates)('renders accessible, distinct %s state', (state) => {
    const { container } = show(state);
    expect(container.querySelector('[data-feedback]')).toBeTruthy();
    if (['not-selected', 'selected', 'saved', 'pending', 'review'].includes(state))
      expect(
        container.querySelector('[aria-label="Response feedback"]')?.getAttribute('data-feedback'),
      ).not.toBe('correct');
    if (state === 'incorrect')
      expect(container.querySelector('[data-feedback="correct"]')).toBeNull();
    if (state === 'partial')
      expect(
        screen.getByRole('heading', {
          name: 'Partially correct — 2 of 3 checked parts passed',
        }),
      ).toBeTruthy();
  });
  it('preserves individual public outcomes beside each field in a mixed response', () => {
    const { container } = show('partial');
    const criteria = Array.from(container.querySelectorAll('[data-criterion]'));
    expect(criteria.map((el) => el.getAttribute('data-feedback'))).toEqual([
      'incorrect',
      'correct',
      'correct',
    ]);
    expect(
      container.querySelector('fieldset[data-feedback="incorrect"] input:checked'),
    ).toHaveAttribute('value', 'provider');
    expect(screen.getByText('Incorrect · needs another look')).toBeTruthy();
  });
  it('preserves bounded factual results alongside qualitative review uncertainty', () => {
    const { s } = show('review');
    expect(feedbackSummary(s).state).toBe('review');
    expect(s.evaluation!.criteria.map((c) => criterionState(s, c))).toEqual([
      'review',
      'correct',
      'correct',
    ]);
  });
  it.each(['unavailable', 'invalidated'] as const)(
    'invalidates all correctness on %s',
    (status) => {
      const s = feedbackFixture('correct');
      s.evaluation!.status = status;
      expect(feedbackSummary(s).state).toBe(status === 'unavailable' ? 'saved' : 'pending');
      if (status === 'unavailable') expect(feedbackSummary(s).label).toBe('Feedback unavailable');
      expect(
        s.evaluation!.criteria.every(
          (c) => criterionState(s, c) === (status === 'unavailable' ? 'saved' : 'pending'),
        ),
      ).toBe(true);
    },
  );
  it('rejects stale response feedback, including its field bindings', () => {
    const s = feedbackFixture('correct');
    s.evaluation!.responseId = 'stale';
    expect(feedbackSummary(s).state).toBe('pending');
    expect(criteriaFor(s, { fieldId: 'capacity' })).toEqual([]);
  });
  it('does not infer bindings from labels or criterion order', () => {
    const s = feedbackFixture('partial');
    delete s.evaluation!.criteria[0]!.target;
    expect(criteriaFor(s, { fieldId: 'responsibility' })).toEqual([]);
  });
  it('marks assisted results separately from independent verification', () => {
    show('assisted');
    expect(
      screen.getByText('Assisted practice · separate from independent verification'),
    ).toBeTruthy();
  });
  it('never applies an earlier evaluated submission to newly editable teaching work', () => {
    const s = feedbackFixture('partial');
    s.teaching = { status: 'participating' } as NonNullable<typeof s.teaching>;
    expect(criteriaFor(s, { fieldId: 'responsibility' })).toEqual([]);
    expect(feedbackSummary(s).state).toBe('pending');
  });
});
