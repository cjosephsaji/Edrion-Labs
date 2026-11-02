import { preparedQuestions } from '../core/prepared-answers';
import type { Topic } from '../simulations/runtime';
import s from './tutor-experience.module.css';

const experiments = new Set([
  'negative',
  'train',
  'mass',
  'replace',
  'mask',
  'brake',
  'gap',
  'speed',
]);
export function PreparedQuestions({
  topic,
  selected,
  onAsk,
}: {
  topic: Topic;
  selected: string;
  onAsk: (q: string) => void;
}) {
  return (
    <section
      className={s.questions}
      aria-label="Prepared questions"
      data-topic={topic}
    >
      <div className={s.questionsHeading}>
        <div>
          <span className={s.eyebrow}>A LITTLE CURIOSITY GOES A LONG WAY</span>
          <h3>Ask Petros</h3>
        </div>
        <span className={s.localBadge}>No AI needed</span>
      </div>
      <p className={s.invitation}>Choose a question, or type one below.</p>
      <div className={s.questionGrid}>
        {preparedQuestions[topic].map((q, i) => (
          <button
            key={q.id}
            onClick={() => onAsk(q.question)}
            aria-pressed={selected === q.question}
          >
            <span className={s.questionTop}>
              <span>
                0{i + 1} / {experiments.has(q.id) ? 'TRY IT' : 'WONDER WHY'}
              </span>
              <span aria-hidden="true">↗</span>
            </span>
            <span className={s.questionText}>{q.question}</span>
          </button>
        ))}
      </div>
      <small>Prepared explanations. Real changes in the simulation.</small>
    </section>
  );
}
