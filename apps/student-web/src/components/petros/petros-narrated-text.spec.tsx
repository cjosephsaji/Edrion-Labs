import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  PETROS_LESSON_PROGRESS_EVENT,
  PetrosNarratedText,
  type PetrosLessonProgress,
} from './petros-narrated-text';

function progress(detail: PetrosLessonProgress) {
  window.dispatchEvent(new CustomEvent(PETROS_LESSON_PROGRESS_EVENT, { detail }));
}

describe('PetrosNarratedText', () => {
  it('highlights the current page word and sentence from the shared audio position', () => {
    const { container } = render(
      <p>
        <PetrosNarratedText
          text="First sentence. Second sentence here."
          targetKey="lesson:target"
        />
      </p>,
    );

    act(() => progress({ targetKey: 'lesson:target', wordIndex: 3, speaking: true }));
    expect(container.querySelectorAll('[data-active="true"]')).toHaveLength(2);
    expect(container.querySelector('[data-petros-narrated-word][data-active="true"]')).toHaveTextContent('sentence');
    expect(screen.getByLabelText('First sentence. Second sentence here.')).toBeInTheDocument();

    act(() => progress({ targetKey: 'lesson:target', wordIndex: 3, speaking: false }));
    expect(container.querySelector('[data-active="true"]')).toBeNull();
  });

  it('supports a word offset when one narrated target is split across elements', () => {
    const { container } = render(
      <PetrosNarratedText text="Body begins here." targetKey="lesson:step" startWord={2} />,
    );
    act(() => progress({ targetKey: 'lesson:step', wordIndex: 2, speaking: true }));
    expect(container.querySelector('[data-petros-narrated-word][data-active="true"]')).toHaveTextContent('Body');
  });
});
