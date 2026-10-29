'use client';
import { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FlaskConical,
  Lightbulb,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { canonicalContent, type M4Snapshot } from '@edrion/schemas';
import { currentEvaluation } from './feedback-state';
import { teachingPresentation } from './teaching-presentation';
import { StudioDialog } from './studio-dialog';
import styles from './teaching-support.module.css';

export function TeachingSources({
  snapshot: s,
  preview = process.env.NEXT_PUBLIC_PETROS_M4_DEMO === '1',
}: {
  snapshot: M4Snapshot;
  preview?: boolean;
}) {
  const independentTask = s.task && !s.submission && s.assistance !== 'assisted';
  const limitations = [
    ...new Set([...(s.lesson?.limitations ?? []), ...(s.teaching?.limitations ?? [])]),
  ];
  return (
    <div className={styles.sources}>
      <div className={styles.provenance}>
        <BookOpen size={22} aria-hidden="true" />
        <div>
          <strong>
            {preview ? 'Sample teaching material' : (s.task?.citation ?? s.lesson?.citation)}
          </strong>
          <p>
            {preview
              ? 'Created for this demo. The review records are simulated.'
              : 'The source material available for this lesson.'}
          </p>
        </div>
      </div>
      {independentTask ? (
        <p>
          Use the passage supplied with your question while you work independently. The teaching
          excerpts will be available after you submit.
        </p>
      ) : (
        <>
          {s.lesson?.excerpts?.map((excerpt, index) => {
            const current =
              s.teaching &&
              canonicalContent(excerpt.reference) === canonicalContent(s.teaching.reference);
            return (
              <section className={styles.excerpt} key={`${excerpt.reference.unitId}:${index}`}>
                <h3>{current ? 'Source for this teaching step' : `Lesson excerpt ${index + 1}`}</h3>
                <blockquote>{excerpt.text}</blockquote>
              </section>
            );
          })}
          {!s.lesson?.excerpts?.length && (
            <p>No additional source excerpt is available in this session.</p>
          )}
          {!preview && limitations.length > 0 && (
            <section className={styles.excerpt}>
              <h3>Scope of this explanation</h3>
              <ul>
                {limitations.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export function DemoInformation({ snapshot: s }: { snapshot: M4Snapshot }) {
  const notes = [
    ...new Set([...(s.lesson?.limitations ?? []), ...(s.teaching?.limitations ?? [])]),
  ];
  return (
    <div className={styles.sources}>
      <section className={styles.provenance}>
        <Lightbulb size={24} aria-hidden="true" />
        <div>
          <h3>Edrion Labs Intelligent UI</h3>
          <p>
            This view is assembled automatically from the lesson’s structured content and activity.
            The system chooses a suitable layout for reading, calculations, connections,
            comparisons, graphs, processes, or experiments while keeping source material and saved
            answers intact.
          </p>
        </div>
      </section>
      <section className={styles.provenance}>
        <FlaskConical size={24} aria-hidden="true" />
        <div>
          <h3>Sample material, simulated reviews</h3>
          <p>
            The students, teaching material, and review records in this preview are synthetic. This
            is a demonstration, not independently validated course content.
          </p>
        </div>
      </section>
      <section className={styles.provenance}>
        <ShieldCheck size={24} aria-hidden="true" />
        <div>
          <h3>What the feedback can check</h3>
          <p>
            Calculations and defined relationships use fixed checks. Petros presents authored
            teaching steps. It does not use a live AI model to interpret your answer. Qualitative
            explanations may still need human review.
          </p>
        </div>
      </section>
      {notes.length > 0 && (
        <details className={styles.notes}>
          <summary>Full preview notes</summary>
          <ul>
            {notes.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function TeachingContext({
  snapshot: s,
  onSources,
  compact = false,
  classic = false,
}: {
  snapshot: M4Snapshot;
  onSources?: () => void;
  compact?: boolean;
  classic?: boolean;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const copy = teachingPresentation(s);
  const exploring =
    copy.family === 'experiment' || s.teaching?.decision.strategy === 'participation';
  // Deliberately describe the previous immutable submission, never the editable
  // example now on screen. The same response/status checks still apply.
  const evaluation = currentEvaluation({ ...s, teaching: null });
  const kept =
    evaluation?.criteria.filter((c) => c.origin === 'trusted_kernel' && c.status === 'satisfied') ??
    [];
  const revisit =
    evaluation?.criteria.filter(
      (c) => c.origin === 'trusted_kernel' && c.status === 'not_satisfied',
    ) ?? [];
  const previousFeedback = (kept.length > 0 || revisit.length > 0) && (
    <section className={styles.lastAnswer} aria-label="Feedback on your last submitted answer">
      <p className={styles.smallLabel}>From your last submitted answer</p>
      <div className={styles.feedbackGroups}>
        {kept.length > 0 && (
          <div className={styles.keep}>
            <CheckCircle2 size={19} aria-hidden="true" />
            <div>
              <strong>Already correct</strong>
              <ul>
                {kept.map((c) => (
                  <li key={c.criterionId}>{c.label}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {revisit.length > 0 && (
          <div className={styles.revisit}>
            <RotateCcw size={19} aria-hidden="true" />
            <div>
              <strong>Let’s revisit</strong>
              <ul>
                {revisit.map((c) => (
                  <li key={c.criterionId}>{c.label}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
  return (
    <div className={`${styles.context} ${classic ? styles.classic : ''}`}>
      {compact ? (
        <div className={styles.compact}>
          <p>
            <strong>Current challenge</strong> · {copy.instruction}
          </p>
          <details>
            <summary>Question, previous feedback and teaching rationale</summary>
            {s.task && (
              <>
                <p>{s.task.prompt}</p>
                {s.task.passage && <p>{s.task.passage}</p>}
              </>
            )}
            {previousFeedback}
            <p>{copy.reason}</p>
          </details>
          <button
            onClick={() => (onSources ? onSources() : setSourcesOpen(true))}
            aria-haspopup="dialog"
          >
            Inspect teaching source
          </button>
        </div>
      ) : (
        <>
          {exploring && (
            <section className={styles.question} aria-label="Exploration focus">
              <FlaskConical size={24} aria-hidden="true" />
              <div>
                <h3>What you’re exploring</h3>
                <p>{copy.instruction}</p>
                {s.task && (
                  <details className={styles.questionDetails}>
                    <summary>View the question you answered</summary>
                    <p>{s.task.prompt}</p>
                    {s.task.passage && <p>{s.task.passage}</p>}
                  </details>
                )}
              </div>
            </section>
          )}
          {s.task && !exploring && (
            <section className={styles.question} aria-label="Question you’re working on">
              <CircleHelp size={24} aria-hidden="true" />
              <div>
                <h3>Question you’re working on</h3>
                <p>{s.task.prompt}</p>
                {s.task.passage && s.task.passage.length <= 500 ? (
                  <div className={styles.questionPassage}>
                    <strong>Question details</strong>
                    <p>{s.task.passage}</p>
                  </div>
                ) : s.task.passage ? (
                  <details className={styles.questionDetails}>
                    <summary>View question details</summary>
                    <p>{s.task.passage}</p>
                  </details>
                ) : null}
              </div>
            </section>
          )}
          {exploring && previousFeedback ? (
            <details className={styles.questionDetails}>
              <summary>Feedback from your previous question</summary>
              {previousFeedback}
            </details>
          ) : (
            previousFeedback
          )}
          <div className={styles.supportGrid}>
            {classic ? (
              <details className={styles.rationale}>
                <summary>Why this step?</summary>
                <p>{copy.reason}</p>
              </details>
            ) : (
              <section className={styles.rationale} aria-label="Why this step?">
                <span className={styles.icon}>
                  <Lightbulb size={21} aria-hidden="true" />
                </span>
                <div>
                  <h3>Why this step?</h3>
                  <p>{copy.reason}</p>
                </div>
              </section>
            )}
            <button
              className={styles.sourceButton}
              onClick={() => (onSources ? onSources() : setSourcesOpen(true))}
              aria-haspopup="dialog"
            >
              <span className={styles.icon}>
                <BookOpen size={21} aria-hidden="true" />
              </span>
              <span>
                <strong>Teaching source</strong>
                <span>Read the material behind this step</span>
              </span>
              <ChevronRight size={19} aria-hidden="true" />
            </button>
          </div>
          {!exploring && (
            <div className={styles.instruction} role="status">
              <strong>Your next move</strong>
              <p>{copy.instruction}</p>
            </div>
          )}
        </>
      )}
      {sourcesOpen && (
        <StudioDialog title="Your sources" close={() => setSourcesOpen(false)}>
          <TeachingSources snapshot={s} />
        </StudioDialog>
      )}
    </div>
  );
}
