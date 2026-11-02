import { observe, type Simulation, type Topic } from '../simulations/runtime';
import type { TeachingPhase } from '../core/teaching';
import s from './tutor-experience.module.css';

const story: Record<Topic, { title: string; action: string; note: string }> = {
  neural: {
    title: 'A mistake worth learning from.',
    action: 'Try one training step',
    note: 'Watch the prediction and loss change together.',
  },
  rocket: {
    title: 'Falling. Braking. Finding balance.',
    action: 'Advance the flight · ½ second',
    note: 'Watch the velocity change as the forces act.',
  },
  attention: {
    title: 'Follow a word’s connections.',
    action: 'Follow the next word',
    note: 'See how a different query changes the beams.',
  },
  traffic: {
    title: 'One brake. A ripple behind it.',
    action: 'Create a braking wave',
    note: 'Follow the slow patch, rather than a single car.',
  },
  relativity: {
    title: 'One journey. Two points of view.',
    action: 'Compare the clocks at 0.99c',
    note: 'Watch the ship interval shrink as speed rises.',
  },
};
const f = (n: unknown, d = 2) => Number(n).toFixed(d);
export function TutorExplanation({
  sim,
  text,
  followup,
  phase,
  onTarget,
  onExperiment,
  compact = false,
}: {
  sim: Simulation;
  text: string;
  followup: string;
  phase: TeachingPhase;
  onTarget: (id: string) => void;
  onExperiment: () => void;
  compact?: boolean;
}) {
  const o = observe(sim),
    topic = story[sim.id];
  const readings: Record<Topic, [string, string, string][]> = {
    neural: [
      ['prediction', 'Prediction', f(o.prediction)],
      ['target', 'Target', f(o.target)],
      ['loss', 'Loss', f(o.loss, 3)],
    ],
    rocket: [
      ['altitude', 'Altitude', `${f(o.altitude, 1)} m`],
      ['velocity', 'Velocity', `${f(o.velocity, 1)} m/s`],
      ['rocket', 'Acceleration', `${f(o.acceleration, 2)} m/s²`],
    ],
    attention: [
      ['attention-matrix', 'Query word', String(o.query)],
      ['context', 'Strongest key', String(o.strongestToken)],
      ['attention-matrix', 'Weight total', f(o.rowSum)],
    ],
    traffic: [
      ['ring', 'Mean speed', `${f(o.meanSpeed, 1)} m/s`],
      ['ring', 'Slowest', `${f(o.minSpeed, 1)} m/s`],
      ['ring', 'Following time', `${f(o.headway, 1)} s`],
    ],
    relativity: [
      ['earth-clock', 'Earth interval', `${f(o.earthSeconds, 1)} s`],
      ['ship-clock', 'Ship interval', `${f(o.shipSeconds, 2)} s`],
      ['gamma', 'Time factor γ', `${f(o.gamma, 2)}×`],
    ],
  };
  const split = text.match(/^(.+?[.!?])\s+(?=[A-Z“‘])/s);
  const lead = split ? split[1] : text;
  const detail = split ? text.slice(split[0].length) : '';
  const predicting = phase === 'PREDICT' || phase === 'TRANSFER_CHECK';
  return (
    <div
      className={s.explanation}
      data-testid="tutor-explanation"
      data-topic={sim.id}
    >
      <div className={s.storyHeader}>
        <span className={s.storySymbol} aria-hidden="true">
          {
            {
              neural: '✳',
              rocket: '↗',
              attention: '✧',
              traffic: '≈',
              relativity: '◷',
            }[sim.id]
          }
        </span>
        <h3>{predicting ? 'Your prediction comes next.' : topic.title}</h3>
      </div>
      <div className={s.caption} aria-live="polite" aria-atomic="true">
        <p className={s.lead}>{lead}</p>
        {detail &&
          (phase === 'EXPLORE' && !compact ? (
            <details className={s.why} key={text}>
              <summary>
                Unpack the explanation <span aria-hidden="true">＋</span>
              </summary>
              <p className={s.detail}>{detail}</p>
            </details>
          ) : (
            <p className={s.detail}>{detail}</p>
          ))}
        {followup && <p className={s.followup}>{followup}</p>}
      </div>
      {!compact && (
        <>
          <div className={s.readingsLabel}>
            <span className={s.liveDot} /> FROM YOUR LIVE MODEL{' '}
            <span>tap to find it ↗</span>
          </div>
          <div className={s.readings} aria-label="Live model readings">
            {readings[sim.id].map(([target, label, value]) => (
              <button
                key={label}
                onClick={() => onTarget(target)}
                aria-label={`Find ${label.toLowerCase()} in the model`}
              >
                <span>{label}</span>
                <strong>{value}</strong>
              </button>
            ))}
          </div>
          {!predicting && (
            <div className={s.experiment}>
              <button onClick={onExperiment}>
                <span aria-hidden="true">▷</span>
                {topic.action}
                <span aria-hidden="true">→</span>
              </button>
              <small>{topic.note}</small>
            </div>
          )}
        </>
      )}
    </div>
  );
}
