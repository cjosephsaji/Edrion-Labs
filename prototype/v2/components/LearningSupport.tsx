'use client';
import { useId, useRef, useState } from 'react';
import type { Investigation } from '../core/investigation';
import {
  causalStops,
  doubtsFor,
  focusText,
  matchDoubts,
  primers,
  type ModelFocus,
} from '../core/learning-guide';
import s from './learning-support.module.css';

export function ModelReading({
  task,
  focus,
  onFocus,
}: {
  task: Investigation;
  focus: ModelFocus | null;
  onFocus: (focus: ModelFocus) => void;
}) {
  const labels: [ModelFocus, string][] = [
    ['change', 'What changes?'],
    ['measure', 'What do I watch?'],
    ['compare', 'How do I compare?'],
  ];
  return (
    <section className={s.reading} aria-label="Read the model">
      <div className={s.readingTop}>
        <span>READ THE MODEL</span>
        <small>Choose a question to find your bearings.</small>
      </div>
      <div className={s.readingButtons}>
        {labels.map(([key, label]) => (
          <button
            key={key}
            aria-pressed={focus === key}
            onClick={() => onFocus(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {focus && (
        <p className={s.readingAnswer} role="status">
          <span aria-hidden="true">↳</span>
          {focusText(task, focus)}
        </p>
      )}
    </section>
  );
}

export function LearningSupport({
  task,
  frameIndex,
  revealed,
  onHelp,
  onInspect,
  onClose,
}: {
  task: Investigation;
  frameIndex: number;
  revealed: boolean;
  onHelp: () => void;
  onInspect: (index: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('start');
  const [cause, setCause] = useState<number | null>(null);
  const id = useId();
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const doubts = doubtsFor(task, frameIndex, revealed);
  const filtered = matchDoubts(doubts, query);
  const answer = doubts.find((doubt) => doubt.id === selected);
  const stops = causalStops(task);
  const activeCause =
    cause !== null && stops[cause]?.frame === frameIndex ? cause : null;
  const choose = (value: string) => {
    onHelp();
    setSelected(value);
    setCause(null);
    requestAnimationFrame(() =>
      answerHeading.current?.focus({ preventScroll: true }),
    );
  };
  const inspectCause = (index: number) => {
    onHelp();
    setCause(index);
    onInspect(stops[index].frame);
  };
  return (
    <section className={s.support} aria-label="Help from Petros">
      <header>
        <div>
          <span>LET’S FIND THE TRICKY BIT</span>
          <h3>What’s not clicking yet?</h3>
        </div>
        <button onClick={onClose} aria-label="Close learning help">
          ×
        </button>
      </header>
      <p className={s.welcome}>
        You can slow down here. Pick a question, or use your own words to find a
        prepared explanation.
      </p>
      <label className={s.searchLabel} htmlFor={`${id}-search`}>
        Find help for this experiment
      </label>
      <input
        id={`${id}-search`}
        type="search"
        maxLength={180}
        placeholder="Try ‘velocity’, ‘why’, or ‘numbers’…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-controls={`${id}-matches`}
      />
      <div className={s.doubts} id={`${id}-matches`}>
        {filtered.length ? (
          filtered.map((doubt) => (
            <button
              key={doubt.id}
              aria-pressed={selected === doubt.id}
              onClick={() => choose(doubt.id)}
            >
              {doubt.question}
              <span aria-hidden="true">↗</span>
            </button>
          ))
        ) : (
          <div className={s.noMatch} role="status">
            <strong>I don’t have a prepared answer matching that yet.</strong>
            <p>
              Try the idea or term you’re stuck on, or work through the cause
              below.
            </p>
            <button onClick={() => setQuery('')}>
              Show the available explanations
            </button>
          </div>
        )}
      </div>
      {answer && (
        <div className={s.answer}>
          <span>PREPARED EXPLANATION · THIS EXPERIMENT</span>
          <h4 ref={answerHeading} tabIndex={-1}>
            {answer.question}
          </h4>
          <p>{answer.answer}</p>
          {selected === 'numbers' && (
            <small>The values follow the snapshot you are viewing.</small>
          )}
        </div>
      )}
      {revealed && (
        <div className={s.cause}>
          <h4>Follow the cause, one step at a time.</h4>
          <div className={s.causeButtons}>
            {stops.map((stop, index) => (
              <button
                key={index}
                aria-pressed={activeCause === index}
                onClick={() => inspectCause(index)}
              >
                {index + 1}
                <span>{stop.label}</span>
              </button>
            ))}
          </div>
          {activeCause !== null && (
            <p role="status">{stops[activeCause].text}</p>
          )}
        </div>
      )}
      <footer>
        <span>
          {revealed
            ? 'Help stays alongside your experiment.'
            : 'Using an explanation marks this attempt as assisted.'}
        </span>
        <button onClick={onClose}>Back to my thinking →</button>
      </footer>
    </section>
  );
}

export function ConceptPrimer({ task }: { task: Investigation }) {
  const primer = primers[task.topic];
  return (
    <div className={s.primer}>
      <span>THE IDEA, IN PLAIN WORDS</span>
      <p>{primer.idea}</p>
    </div>
  );
}
