'use client';

import { MessageCircleQuestion } from 'lucide-react';
import { usePetrosCompanionOptional } from './petros-companion-context';
import styles from './petros-ask-button.module.css';

/**
 * The explicit way a student points Petros at something.
 *
 * This replaces `data-petros-target`, where the first matching node in the document won
 * and the student had no say. Every card that Petros can talk about renders one of these,
 * so selection is always a deliberate act.
 */
export function PetrosAskButton({
  candidateRef,
  label,
  question,
  variant = 'inline',
}: {
  candidateRef: string;
  /** Item name, used only for the accessible label. */
  label: string;
  question?: string;
  variant?: 'inline' | 'icon';
}) {
  const companion = usePetrosCompanionOptional();
  if (!companion || companion.support !== 'supported') return null;
  const active = companion.focusRef === candidateRef;

  return (
    <button
      type="button"
      className={styles.button}
      data-variant={variant}
      data-active={active || undefined}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        companion.askAbout(candidateRef, question);
      }}
      aria-label={`Ask Petros about ${label}`}
    >
      <MessageCircleQuestion aria-hidden="true" />
      {variant === 'inline' ? <span>Ask Petros</span> : null}
    </button>
  );
}
