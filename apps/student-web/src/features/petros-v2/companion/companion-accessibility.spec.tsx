import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CompanionCloud } from './companion-cloud';
import { PetrosAvatar } from '@/components/petros/petros-avatar';
afterEach(cleanup);
const cue = {
  mode: 'waiting' as const,
  gesture: 'neutral' as const,
  targetId: null,
  caption: 'Your committed work is saved. Review the public feedback.',
};
describe('M6 content remains accessible without motion', () => {
  it('announces public text atomically and retains transcript when caption is dismissed', () => {
    render(<CompanionCloud cue={cue} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss caption' }));
    expect(screen.queryByRole('status')).toBeNull();
    const transcript = screen.getByRole('button', { name: 'Transcript' });
    transcript.focus();
    fireEvent.click(transcript);
    expect(transcript).toHaveFocus();
    expect(screen.getByLabelText('Current companion transcript')).toHaveTextContent(cue.caption);
  });
  it('new public content is readable after a prior caption dismissal without focus theft', () => {
    const { rerender } = render(<CompanionCloud cue={cue} />);
    const dismiss = screen.getByRole('button', { name: 'Dismiss caption' });
    dismiss.focus();
    fireEvent.click(dismiss);
    rerender(
      <CompanionCloud cue={{ ...cue, caption: 'Confirmed public criterion feedback is ready.' }} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Confirmed public');
    expect(dismiss).toHaveFocus();
  });
  it('gives the original artwork one stable image alternative without motion or a live region', () => {
    const { container } = render(
      <PetrosAvatar pose="neutral" animate={false} mouthOverlay={false} />,
    );
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/petros/states/petros-idle.png');
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('[data-shared-petros]')).toHaveAttribute('data-motion', 'false');
    expect(container.querySelector('svg')).toBeNull();
  });
});
