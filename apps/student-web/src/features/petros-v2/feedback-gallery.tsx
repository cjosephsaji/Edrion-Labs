'use client';
import { useState } from 'react';
import { TextAlternative } from './text-alternative';
import { AssessmentPanel } from './assessment-panel';
import { feedbackFixture, galleryStates } from './feedback-fixtures';
import { feedbackLabels } from './feedback-state';
import styles from './feedback.module.css';
import studioStyles from './petros-v2.module.css';
export function FeedbackGallery() {
  return (
    <main className={`${studioStyles.page} ${styles.scope}`} style={{ padding: 24 }}>
      <h1>M5 feedback comparison</h1>
      <p>
        Isolated typed synthetic fixtures · actual assessment components · no academic results
        or live session changes.
      </p>
      <div className={styles.gallery}>
        {galleryStates.map((state) => {
          // One mounted panel per frame keeps native response names and IDs unique.
          return (
            <article key={state} data-gallery-state={state}>
              <h2>{feedbackLabels[state]}</h2>
              <iframe
                title={`${feedbackLabels[state]} component fixture`}
                src={`/verification/petros-v2/feedback-gallery?state=${state}`}
                style={{ width: '100%', height: 670, border: 0 }}
              />
            </article>
          );
        })}
      </div>
    </main>
  );
}
export function FeedbackGalleryState({ state }: { state: (typeof galleryStates)[number] }) {
  const s = feedbackFixture(state);
  return (
    <main className={`${studioStyles.page} ${styles.scope}`} style={{ padding: 8 }}>
      <p>ISOLATED SYNTHETIC FIXTURE · {feedbackLabels[state]}</p>
      <AssessmentPanel
        snapshot={s}
        busy={false}
        draft={
          state === 'not-selected'
            ? ''
            : JSON.stringify({
                responsibility: 'provider',
                available: 48,
                capacity: 6,
              })
        }
        onDraft={() => {}}
        onSave={async () => undefined}
        onSubmit={async () => undefined}
      />
    </main>
  );
}

export function LongReaderFixture() {
  const [primary, setPrimary] = useState(false);
  return (
    <main className={`${studioStyles.page} ${styles.scope}`} style={{ padding: 20 }}>
      <h1>Isolated long reader fixture</h1>
      <p>Synthetic educational text · CC0 engineering fixture · no academic result</p>
      <label>
        <input
          type="checkbox"
          checked={primary}
          onChange={(e) => setPrimary(e.target.checked)}
        />
        Use text as the main presentation
      </label>
      <div style={{ marginTop: 16 }}>
        <TextAlternative primary={primary} title="Long educational text alternative">
          <p>Source: Synthetic CC0 reader fixture · all 80 paragraphs retained.</p>
          {Array.from({ length: 80 }, (_, i) => (
            <p key={i}>
              Paragraph {i + 1}. A learner can inspect a relationship, explain a prediction,
              compare an observation and return to the saved work. The source and the response
              remain available while the reader is open.
            </p>
          ))}
          <p>End of the complete educational reader.</p>
        </TextAlternative>
      </div>
    </main>
  );
}
