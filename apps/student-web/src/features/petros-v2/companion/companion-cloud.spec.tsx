import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CompanionCloud, cloudContent } from './companion-cloud';

afterEach(cleanup);
const cue = { mode: 'paused' as const, gesture: 'neutral' as const, targetId: null, caption: '' };
describe('truthful companion cloud content', () => {
  it('keeps long authorized explanations in the accessible transcript and supports dismissal/reopening', () => {
    const caption = 'The reviewed public explanation. '.repeat(20);
    const { container } = render(<CompanionCloud cue={{ ...cue, caption }} />);
    expect(container.querySelector('[data-caption-format]')).toHaveAttribute(
      'data-caption-format',
      'transcript',
    );
    expect(screen.getByRole('status').textContent!.length).toBeLessThan(241);
    fireEvent.click(screen.getByRole('button', { name: 'Full transcript' }));
    expect(screen.getByLabelText('Current companion transcript')).toHaveTextContent(caption.trim());
    fireEvent.click(screen.getByRole('button', { name: 'Full transcript' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss caption' }));
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show caption' }));
    expect(screen.getByRole('status')).toBeVisible();
  });
  it('hides whitespace-only speech instead of retaining an empty panel', () => {
    const { container } = render(<CompanionCloud cue={{ ...cue, caption: '  \n ' }} />);
    expect(container.querySelector('[data-cloud]')).toBeNull();
  });
  it('shows an active operation status, then removes it when the operation ends', () => {
    const { container, rerender } = render(<CompanionCloud cue={{ ...cue, mode: 'thinking' }} />);
    expect(container.querySelector('[data-cloud]')).toHaveAttribute('data-cloud', 'status');
    expect(container).toHaveTextContent('Checking the source…');
    rerender(<CompanionCloud cue={cue} />);
    expect(container.querySelector('[data-cloud]')).toBeNull();
  });
  it('describes typed input as ready and preserves the supplied public caption', () => {
    const { container } = render(
      <CompanionCloud cue={{ ...cue, mode: 'listening', caption: 'Take your time.' }} />,
    );
    expect(container).toHaveTextContent('Ready for your question');
    expect(container).not.toHaveTextContent('Listening');
    expect(cloudContent({ ...cue, caption: ' Your place is saved. ' })).toEqual({
      text: 'Your place is saved.',
      kind: 'speech',
    });
  });
  it('uses Listening only when the caller reports actual microphone capture', () => {
    const { container } = render(
      <CompanionCloud
        cue={{ ...cue, mode: 'listening', caption: 'Microphone recording is active.' }}
        microphoneActive
      />,
    );
    expect(container).toHaveTextContent('Listening');
    expect(container).not.toHaveTextContent('Ready for your question');
  });
});
