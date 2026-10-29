'use client';
import { useEffect, useRef, useState } from 'react';
import type { M4Response, M4Snapshot } from '@edrion/schemas';
import { criteriaFor, criterionState } from './feedback-state';
import { CriterionFeedback, FeedbackBadge, ResponseFeedback } from './feedback';
import feedbackStyles from './feedback.module.css';
import styles from './petros-v2.module.css';
import { CircleHelp } from 'lucide-react';
import formatStyles from './learning-format.module.css';
export function AssessmentPanel({
  snapshot,
  busy,
  draft,
  onDraft,
  onSave,
  onSubmit,
  unconfirmed = false,
}: {
  snapshot: M4Snapshot;
  busy: boolean;
  draft: string;
  unconfirmed?: boolean;
  onDraft: (value: string) => void;
  onSave: () => Promise<unknown>;
  onSubmit: (response: M4Response) => Promise<unknown>;
}) {
  const task = snapshot.task!,
    [values, setValues] = useState<Record<string, string>>({}),
    [error, setError] = useState(''),
    [focusedPassage, setFocusedPassage] = useState<number | null>(null);
  const status = useRef<HTMLParagraphElement>(null),
    submitted = !!snapshot.submission,
    disabled = busy || submitted || snapshot.status !== 'active';
  useEffect(() => {
    try {
      const parsed = JSON.parse(draft);
      if (parsed && typeof parsed === 'object') setValues(parsed);
    } catch {
      setValues({ answer: draft });
    }
  }, [draft, task.taskId]);
  useEffect(() => {
    if (submitted) status.current?.focus();
  }, [submitted]);
  function change(id: string, value: string) {
    const next = { ...values, [id]: value };
    setValues(next);
    onDraft(JSON.stringify(next));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    let response: M4Response;
    if (task.responseKind === 'structured') {
      if (
        task.fields.some(
          (f) =>
            !values[f.id]?.trim() ||
            (f.kind === 'number' && !Number.isFinite(Number(values[f.id]))),
        )
      ) {
        setError('Complete each part of your answer before submitting.');
        return;
      }
      response = {
        kind: 'structured',
        values: Object.fromEntries(
          task.fields.map((f) => [
            f.id,
            f.kind === 'number' ? Number(values[f.id]) : values[f.id]!,
          ]),
        ),
      };
    } else if (task.responseKind === 'choice') {
      if (!values.answer) {
        setError('Choose an answer.');
        return;
      }
      response = { kind: 'choice', choiceId: values.answer };
    } else if (task.responseKind === 'number') {
      if (!values.answer?.trim() || !Number.isFinite(Number(values.answer))) {
        setError('Enter a number.');
        return;
      }
      response = {
        kind: 'number',
        value: Number(values.answer),
        unit: values.unit ?? '',
      };
    } else if (task.responseKind === 'canvas_snapshot') {
      if (!snapshot.checkpointId) return;
      response = {
        kind: 'canvas_snapshot',
        checkpointId: snapshot.checkpointId,
        text: values.answer ?? '',
      };
    } else {
      if (!values.answer?.trim()) {
        setError('Write your answer before submitting.');
        return;
      }
      response = { kind: 'text', text: values.answer };
    }
    await onSubmit(response);
  }
  const committed = snapshot.submission?.response;
  const displayValues =
    submitted && committed
      ? committed.kind === 'structured'
        ? committed.values
        : committed.kind === 'text'
          ? { answer: committed.text }
          : committed.kind === 'choice'
            ? { answer: committed.choiceId }
            : committed.kind === 'number'
              ? { answer: committed.value, unit: committed.unit }
              : { answer: committed.text }
      : values;
  const inline = (fieldId: string) => (
    <div className={feedbackStyles.inline}>
      {criteriaFor(snapshot, { fieldId }).map((c) => (
        <CriterionFeedback snapshot={snapshot} criterion={c} key={c.criterionId} />
      ))}
    </div>
  );
  const fieldState = (fieldId: string) => {
    const results = criteriaFor(snapshot, { fieldId });
    return results.length === 1 ? criterionState(snapshot, results[0]!) : undefined;
  };
  const inlineIds =
    snapshot.evaluation?.criteria
      .filter(
        (c) =>
          c.target?.elementIds?.length ||
          (c.target?.fieldId &&
            (task.responseKind === 'structured'
              ? task.fields.some((f) => f.id === c.target?.fieldId)
              : c.target.fieldId === 'answer')),
      )
      .map((c) => c.criterionId) ?? [];
  return (
    <section
      aria-labelledby="question-heading"
      className={`${styles.assessment} ${feedbackStyles.scope}`}
    >
      <p className={styles.eyebrow}>{submitted ? 'Your saved response' : 'Your turn'}</p>
      <div className={formatStyles.practiceQuestion}>
        <CircleHelp size={24} aria-hidden="true" />
        <div>
          <strong>Question you’re working on</strong>
          <h2 id="question-heading">{task.prompt}</h2>
        </div>
      </div>
      <p className={styles.hint}>
        {snapshot.assistance === 'assisted'
          ? 'Assisted practice · your use of the reviewed explanation is recorded.'
          : task.helpPolicy === 'no_hints'
            ? 'Try this independently. Hints are unavailable for this question.'
            : 'You can ask for help. Assisted practice is recorded separately.'}
      </p>
      <div className={styles.activityLayout} data-has-passage={!!task.passage}>
        {task.passage && (
          <div className={styles.passage}>
            <p className={styles.eyebrow}>The source passage</p>
            <blockquote>
              {task.passage.split(/\n\s*\n/).map((paragraph, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={focusedPassage === i}
                  aria-label={`Focus passage paragraph ${i + 1}`}
                  onClick={() => setFocusedPassage(i)}
                >
                  {paragraph}
                </button>
              ))}
            </blockquote>
            <p className={styles.hint}>Select wording to keep it in focus while you write.</p>
          </div>
        )}
        <form onSubmit={submit}>
          <fieldset
            disabled={disabled || unconfirmed}
            data-structured={task.responseKind === 'structured'}
          >
            <legend className={styles.srOnly}>Your response</legend>
            {task.responseKind === 'structured' ? (
              task.fields.map((f) =>
                f.kind === 'choice' ? (
                  <fieldset
                    className={styles.selectionGroup}
                    key={f.id}
                    data-feedback={fieldState(f.id)}
                    aria-describedby={
                      criteriaFor(snapshot, { fieldId: f.id })
                        .map((c) => `feedback-${c.criterionId}`)
                        .join(' ') || undefined
                    }
                  >
                    <legend>{f.label}</legend>
                    <div className={styles.choices}>
                      {f.choices.map((choice) => (
                        <label key={choice.id}>
                          <input
                            type="radio"
                            name={`answer-${f.id}`}
                            value={choice.id}
                            checked={String(displayValues[f.id] ?? '') === choice.id}
                            onChange={() => change(f.id, choice.id)}
                            required
                          />
                          <span>{choice.label}</span>
                        </label>
                      ))}
                    </div>
                    {inline(f.id)}
                  </fieldset>
                ) : (
                  <div className={styles.field} key={f.id} data-feedback={fieldState(f.id)}>
                    <label htmlFor={`answer-${f.id}`} className={styles.field}>
                      <span id={`answer-label-${f.id}`}>{f.label}</span>
                      {f.kind === 'number' ? (
                        <input
                          id={`answer-${f.id}`}
                          aria-labelledby={`answer-label-${f.id}`}
                          aria-describedby={
                            criteriaFor(snapshot, { fieldId: f.id })
                              .map((c) => `feedback-${c.criterionId}`)
                              .join(' ') || undefined
                          }
                          type="number"
                          step="any"
                          value={String(displayValues[f.id] ?? '')}
                          onChange={(event) => change(f.id, event.target.value)}
                          required
                        />
                      ) : (
                        <textarea
                          id={`answer-${f.id}`}
                          aria-labelledby={`answer-label-${f.id}`}
                          aria-describedby={
                            criteriaFor(snapshot, { fieldId: f.id })
                              .map((c) => `feedback-${c.criterionId}`)
                              .join(' ') || undefined
                          }
                          rows={4}
                          maxLength={2000}
                          value={String(displayValues[f.id] ?? '')}
                          onChange={(event) => change(f.id, event.target.value)}
                          required
                        />
                      )}
                    </label>
                    {inline(f.id)}
                  </div>
                ),
              )
            ) : task.responseKind === 'choice' ? (
              <div className={styles.choices} data-feedback={fieldState('answer')}>
                {task.choices.map((c) => (
                  <label key={c.id}>
                    <input
                      type="radio"
                      name="answer"
                      value={c.id}
                      checked={displayValues.answer === c.id}
                      onChange={() => change('answer', c.id)}
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            ) : (
              <label className={styles.field} htmlFor="student-answer">
                <span id="student-answer-label">Your answer</span>
                {task.responseKind === 'number' ? (
                  <input
                    id="student-answer"
                    aria-labelledby="student-answer-label"
                    type="number"
                    step="any"
                    value={displayValues.answer ?? ''}
                    onChange={(e) => change('answer', e.target.value)}
                  />
                ) : (
                  <textarea
                    id="student-answer"
                    aria-labelledby="student-answer-label"
                    rows={6}
                    maxLength={16000}
                    value={displayValues.answer ?? ''}
                    onChange={(e) => change('answer', e.target.value)}
                  />
                )}
              </label>
            )}
            {task.responseKind !== 'structured' && inline('answer')}
            {task.responseKind === 'number' ? (
              <label className={styles.field} htmlFor="student-unit">
                Unit (if required)
                <input
                  id="student-unit"
                  value={String(displayValues.unit ?? '')}
                  onChange={(e) => change('unit', e.target.value)}
                  maxLength={80}
                />
              </label>
            ) : null}
          </fieldset>
          {error ? <p role="alert">{error}</p> : null}
          {!submitted ? (
            <div className={styles.actions}>
              <button type="submit" className={styles.primary} disabled={disabled}>
                {busy
                  ? 'Saving your answer…'
                  : unconfirmed
                    ? 'Retry saving original answer'
                    : snapshot.assistance === 'assisted' &&
                        snapshot.canvas?.elements.some((element) => element.kind === 'allocation')
                      ? 'Submit my correction'
                      : 'Submit answer'}
              </button>
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={disabled || unconfirmed}
              >
                Save draft
              </button>
            </div>
          ) : null}
        </form>
      </div>
      <p ref={status} tabIndex={-1} role="status" className={styles.status}>
        {submitted ? 'Answer submitted. ' : ''}
        {snapshot.message}
      </p>
      {!submitted && (
        <FeedbackBadge
          state={
            Object.values(values).some((v) => String(v).trim())
              ? draft === snapshot.draft && !!snapshot.draft
                ? 'saved'
                : 'selected'
              : 'not-selected'
          }
        />
      )}
      {snapshot.submission ? <ResponseFeedback snapshot={snapshot} inlineIds={inlineIds} /> : null}
    </section>
  );
}
