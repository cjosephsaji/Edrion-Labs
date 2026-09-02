'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildPetrosSpeechTimeline } from './use-petros-voice';
import styles from './petros-session.module.css';

export const PETROS_LESSON_PROGRESS_EVENT = 'petros:lesson-progress';

export type PetrosLessonProgress = {
  targetKey: string;
  wordIndex: number;
  speaking: boolean;
};

/**
 * Mirrors the shared audio clock inside the lesson material. `startWord` lets a visual target
 * split one spoken segment across a heading and body without losing the absolute word position.
 */
export function PetrosNarratedText({
  text,
  targetKey,
  startWord = 0,
}: {
  text: string;
  targetKey: string;
  startWord?: number;
}) {
  const words = useMemo(() => buildPetrosSpeechTimeline(text), [text]);
  const [activeWord, setActiveWord] = useState(-1);

  useEffect(() => {
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<PetrosLessonProgress>).detail;
      if (!detail?.speaking || detail.targetKey !== targetKey) {
        setActiveWord(-1);
        return;
      }
      setActiveWord(detail.wordIndex);
    };
    window.addEventListener(PETROS_LESSON_PROGRESS_EVENT, onProgress);
    return () => window.removeEventListener(PETROS_LESSON_PROGRESS_EVENT, onProgress);
  }, [targetKey]);

  const lines = words.reduce<Array<Array<{ index: number; text: string }>>>((all, word, index) => {
    (all[word.lineIndex] ??= []).push({ index, text: word.text });
    return all;
  }, []);

  return (
    <span className={styles.narratedText} aria-label={text}>
      <span aria-hidden="true">
        {lines.map((line, lineIndex) => {
          const lineStart = startWord + (line[0]?.index ?? 0);
          const lineEnd = startWord + (line.at(-1)?.index ?? 0);
          const activeLine = activeWord >= lineStart && activeWord <= lineEnd;
          return (
            <span
              className={styles.narratedLine}
              data-active={activeLine || undefined}
              key={`${lineIndex}-${line[0]?.text ?? ''}`}
            >
              {line.map((word) => {
                const absoluteIndex = startWord + word.index;
                return (
                  <span
                    className={styles.narratedWord}
                    data-petros-narrated-word="true"
                    data-active={activeWord === absoluteIndex || undefined}
                    key={`${absoluteIndex}-${word.text}`}
                  >
                    {word.text}{' '}
                  </span>
                );
              })}
            </span>
          );
        })}
      </span>
    </span>
  );
}
