import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PresentationController } from '../presentation-controller';
import { TEACHING_FIXTURES } from '../playground/teaching-fixtures';
import { TeachingVoiceControls } from './teaching-voice-controls';

afterEach(cleanup);
it('speaks a repeated fixture answer once per submitted question and replays locally without synthesis', () => {
  const fixture = TEACHING_FIXTURES[1]!, controller = new PresentationController(fixture.timeline);
  const createAudio = vi.fn(() => Object.assign(new EventTarget(), {
    canPlayType: () => 'probably', play: () => Promise.resolve(), pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn(),
  }) as unknown as HTMLAudioElement);
  controller.configureNarration([], createAudio);
  const session = { status: null, loadingStatus: false, phase: 'idle', samples: [], transcription: null, transcript: '', error: '', generate: vi.fn(), cancel: vi.fn() };
  const props = { controller, state: controller.getSnapshot(), session: session as never, reply: fixture.dialogue[0]!.answer, replyKey: 1, narrationEnabled: true, disabled: false, onTranscript: vi.fn() };
  const view = render(<TeachingVoiceControls {...props} />);
  expect(createAudio).toHaveBeenCalledTimes(1);
  view.rerender(<TeachingVoiceControls {...props} replyKey={2} />);
  expect(createAudio).toHaveBeenCalledTimes(2);
  // An unrelated rerender must not restart the same answer.
  view.rerender(<TeachingVoiceControls {...props} replyKey={2} state={controller.getSnapshot()} />);
  expect(createAudio).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Replay response' }));
  expect(createAudio).toHaveBeenCalledTimes(3);
  expect(session.generate).not.toHaveBeenCalled();
  controller.dispose();
});
