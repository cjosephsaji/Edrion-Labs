import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ClassicLessonLayout,
  LessonHeading,
  LearningStageIndicator,
  LearningSurface,
  PrimaryLearningAction,
  LearningFeedback,
} from './classic-learning';

afterEach(cleanup);
describe('shared Classic presentation', () => {
  it('keeps the source heading, objective, companion and workspace in one accessible layout', () => {
    render(
      <ClassicLessonLayout stage="active" companion={<aside aria-label="Petros" />}>
        <LessonHeading
          context="Mathematics"
          title="Reviewed equation"
          objective="Balance both sides"
        />
        <LearningSurface label="Equation editor">
          <input aria-label="Equation answer" />
        </LearningSurface>
      </ClassicLessonLayout>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Reviewed equation' })).toBeVisible();
    expect(screen.getByText('Balance both sides')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Learning studio' })).toContainElement(
      screen.getByRole('textbox'),
    );
  });
  it.each([
    ['Predict', 'Try it', 'Explain'],
    ['Explore', 'Your turn', 'Reflect'],
    ['Read', 'Choose evidence', 'Explain'],
  ])('renders supplied stage labels without adding navigation: %s', (...labels) => {
    const { container } = render(<LearningStageIndicator labels={labels} current={1} />);
    expect(container.querySelector('[aria-current="step"]')).toHaveTextContent(labels[1]!);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('keeps a disabled principal action inert and uses neutral styling for saved work', () => {
    const submit = vi.fn();
    const { rerender } = render(
      <PrimaryLearningAction onClick={submit} disabled>
        Submit answer
      </PrimaryLearningAction>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(submit).not.toHaveBeenCalled();
    rerender(<LearningFeedback kind="saved">Saved · Not checked yet</LearningFeedback>);
    expect(screen.getByRole('status')).toHaveAttribute('data-learning-feedback', 'saved');
    rerender(<LearningFeedback kind="refused">Request refused</LearningFeedback>);
    expect(screen.getByRole('status')).toHaveAttribute('data-learning-feedback', 'refused');
    rerender(<LearningFeedback kind="network">Could not save</LearningFeedback>);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
  });
  it('defines the approved palette and a compact companion breakpoint centrally', () => {
    const css = readFileSync('src/features/petros-v2/classic-studio.module.css', 'utf8');
    for (const value of [
      '#f7f8f3',
      '#fffefa',
      '#223a2d',
      '#5f7266',
      '#21543e',
      '#2a664c',
      '#6f9f84',
      '#dce5d9',
      '#edf5ed',
      '#d7c7a4',
      '#98621e',
      '#fff3de',
    ])
      expect(css).toContain(value);
    expect(css).toContain('minmax(0, 1fr) 270px');
    expect(css).toContain('@media (max-width: 760px)');
  });
});
