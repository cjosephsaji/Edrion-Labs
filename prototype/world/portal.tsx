'use client';
import s from './portal.module.css';
export type TravelPhase =
  | 'idle'
  | 'loading'
  | 'entering'
  | 'active'
  | 'leaving';
export function Portal({
  phase,
  status,
  reduced,
  onSkip,
  onCancel,
}: {
  phase: TravelPhase;
  status: string;
  reduced: boolean;
  onSkip: () => void;
  onCancel: () => void;
}) {
  if (phase === 'idle' || phase === 'active') return null;
  return (
    <div
      className={s.portal}
      data-phase={phase}
      data-reduced={reduced}
      role="dialog"
      aria-modal="true"
      aria-label={
        phase === 'leaving' ? 'Leaving Petros World' : 'Entering Petros World'
      }
    >
      <div className={s.dimmer} />
      {!reduced && phase !== 'loading' && (
        <svg className={s.streaks} viewBox="0 0 1000 1000" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => (
            <g key={i} transform={`rotate(${i * 22.5} 500 500)`}>
              <path d="M500 55 Q790 100 740 350" />
              <circle cx="500" cy={80 + i * 8} r={i % 3 === 0 ? 3 : 1.8} />
            </g>
          ))}
        </svg>
      )}
      <div className={s.composition}>
        <div className={s.halo} aria-hidden="true" />
        <div className={s.ring} data-portal-ring aria-hidden="true" />
        <div className={s.copy} data-portal-copy>
          <span>PETROS WORLD</span>
          <h2>
            {phase === 'leaving' ? (
              'Taking your ideas back.'
            ) : phase === 'loading' ? (
              'Preparing your study…'
            ) : (
              <>
                A little curiosity.
                <br />A whole new space.
              </>
            )}
          </h2>
          <p>
            {phase === 'loading'
              ? status
              : 'Your lesson and your place are coming with you.'}
          </p>
          {phase === 'loading' && (
            <progress aria-label="Loading the 3D study" />
          )}
        </div>
      </div>
      <div className={s.actions}>
        <button onClick={onCancel}>
          {phase === 'leaving' ? 'Return now' : 'Back to Classic'}
        </button>
        {phase !== 'loading' && (
          <button onClick={onSkip}>Skip transition</button>
        )}
      </div>
    </div>
  );
}
