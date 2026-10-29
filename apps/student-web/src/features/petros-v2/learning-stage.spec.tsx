import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { M4Snapshot } from '@edrion/schemas';
import { LearningStage, TextLearningStage } from './learning-stage';
import { TeachingTargetRegistry } from '@/features/learning-studio/target-registry';
import { PresentationController } from './presentation-controller';
import { studioTimeline } from './studio-presentation';

const lesson: NonNullable<M4Snapshot['lesson']> = {
  title: 'Reviewed source',
  subject: 'A subject',
  objective: { id: '10000000-0000-4000-8000-000000000001', version: 1, label: 'Read the source' },
  explanation: 'Exact source wording.\n\n<script>Untrusted source markup</script>',
  citation: 'An authorized passage',
  references: [],
  limitations: [],
};
afterEach(cleanup);
describe('Focused interactive source stage', () => {
  it('shows one current source and restores earlier wording without losing the revealed checkpoint', () => {
    const controller = new PresentationController(studioTimeline(lesson));
    controller.step();
    controller.step();
    const ui = () => (
      <TeachingTargetRegistry>
        <LearningStage
          lesson={lesson}
          controller={controller}
          state={controller.getSnapshot()}
          busy={false}
          textOnly={false}
          canParticipate
          next={vi.fn()}
          ask={vi.fn()}
        />
      </TeachingTargetRegistry>
    );
    const { container, rerender } = render(ui());
    expect(container.querySelectorAll('[data-element-id]')).toHaveLength(1);
    expect(container.querySelector('[data-element-id]')?.textContent).toContain(
      '<script>Untrusted source markup</script>',
    );
    fireEvent.click(screen.getByRole('button', { name: '01 Excerpt 1' }));
    rerender(ui());
    expect(container.querySelector('[data-element-id]')?.textContent).toContain(
      'Exact source wording.',
    );
    expect(controller.getSnapshot().canvas.elements).toHaveLength(2);
    expect(controller.getSnapshot().canvas.invitation).toBeNull();
    controller.dispose();
  });
  it('retains every revealed excerpt in the text-only alternative', () => {
    const controller = new PresentationController(studioTimeline(lesson));
    controller.step();
    controller.step();
    const { container } = render(
      <TeachingTargetRegistry>
        <LearningStage
          lesson={lesson}
          controller={controller}
          state={controller.getSnapshot()}
          busy={false}
          textOnly
          canParticipate
          next={vi.fn()}
          ask={vi.fn()}
        />
      </TeachingTargetRegistry>,
    );
    expect(container.querySelectorAll('[data-element-id]')).toHaveLength(2);
    controller.dispose();
  });
});
describe('Text fallback for an unsupported presentation', () => {
  it('keeps all exact wording as text and never executes source markup', () => {
    const { container } = render(
      <TextLearningStage lesson={lesson} busy={false} canParticipate next={vi.fn()} />,
    );
    expect(container.querySelector('blockquote')?.textContent).toBe(lesson.explanation);
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByRole('region', { name: 'Source-backed text stage' })).toBeVisible();
  });
  it('cannot issue a next action when the server has not permitted participation', () => {
    const next = vi.fn();
    render(<TextLearningStage lesson={lesson} busy={false} canParticipate={false} next={next} />);
    expect(screen.getByRole('button', { name: 'Try a question →' })).toBeDisabled();
    expect(next).not.toHaveBeenCalled();
  });
  it('does not invent content or offer participation for a blank source', () => {
    render(
      <TextLearningStage
        lesson={{ ...lesson, explanation: ' ' }}
        busy={false}
        canParticipate
        next={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'This source has no displayable passage.' }),
    ).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
