'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import { hydrateLocalAnswer, type LocalAnswer } from './answer-model';

export type ExamAttemptState = {
  currentIndex: number;
  answers: Record<string, LocalAnswer>;
  flags: Record<string, boolean>;
};

type ResumeRow = {
  questionId: string;
  flagged?: boolean;
  payload?: Record<string, unknown> | null;
  choiceKey?: string | null;
  answerText?: string | null;
};

/**
 * Local, in-memory state for an in-progress exam attempt: current question,
 * per-question answers, and flags. Server sync is handled by the page via
 * debounced autosave + the offline queue — this store is the source of truth
 * for what the student sees.
 */
export function useExamAttemptStore(total: number) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const hydratedRef = useRef(false);

  const goTo = useCallback(
    (index: number) => {
      setCurrentIndex(() => Math.max(0, Math.min(index, Math.max(0, total - 1))));
    },
    [total],
  );

  const next = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex]);
  const prev = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex]);

  const setAnswer = useCallback((questionId: string, patch: Partial<LocalAnswer>) => {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], ...patch } }));
  }, []);

  const toggleFlag = useCallback((questionId: string) => {
    setFlags((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  }, []);

  const setFlag = useCallback((questionId: string, value: boolean) => {
    setFlags((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  /** One-shot hydration from resumed server answers. Safe to call repeatedly. */
  const hydrate = useCallback((rows: ResumeRow[] | undefined) => {
    if (hydratedRef.current || !rows?.length) return;
    hydratedRef.current = true;
    const nextAnswers: Record<string, LocalAnswer> = {};
    const nextFlags: Record<string, boolean> = {};
    for (const row of rows) {
      nextAnswers[row.questionId] = hydrateLocalAnswer(row);
      if (row.flagged) nextFlags[row.questionId] = true;
    }
    setAnswers(nextAnswers);
    setFlags(nextFlags);
  }, []);

  const state = useMemo<ExamAttemptState>(
    () => ({ currentIndex, answers, flags }),
    [currentIndex, answers, flags],
  );

  return { state, goTo, next, prev, setAnswer, toggleFlag, setFlag, hydrate };
}

export type ExamAttemptStore = ReturnType<typeof useExamAttemptStore>;
