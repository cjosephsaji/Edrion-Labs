'use client';
import { elapsedTime, tinyModel } from '../teaching/algorithms';
import type { ShowcaseState } from '../teaching/types';
import type { Patch } from './workspace';
import { yieldCue } from '../teaching/controller';
import s from './showcase.module.css';
export function TopicModel({
  state,
  patch,
  onSelect,
}: {
  state: ShowcaseState;
  patch: Patch;
  onSelect: (s: string) => void;
}) {
  const v = state.visualState;
  const predicting = ['CHECKING_UNDERSTANDING', 'AWAITING_RESPONSE'].includes(
    state.teaching.status,
  );
  const hideOutput =
    predicting && ['AI-Q04', 'AI-Q07'].includes(state.questionId ?? '');
  const hideError =
    predicting &&
    ['AI-Q04', 'AI-Q05', 'AI-Q07'].includes(state.questionId ?? '');
  if (v.kind === 'network') {
    const prediction = tinyModel(v.input, v.weight);
    return (
      <div className={s.topicModel}>
        <div className={s.boardLabel}>
          <span>A TINY ILLUSTRATIVE MODEL</span>
          <span>ONE CONNECTION</span>
        </div>
        <svg
          viewBox="0 0 720 215"
          className={s.networkSvg}
          aria-label={`Input ${v.input} times weight ${v.weight} equals prediction ${prediction}`}
          role="img"
        >
          <path
            d="M160 106H544"
            stroke="#b2c9b7"
            strokeWidth={4 + v.weight * 2}
          />
          <circle cx="130" cy="106" r="49" fill="#edf5ed" stroke="#92b39b" />
          <circle cx="580" cy="106" r="49" fill="#d6e8d7" stroke="#60836b" />
          <text
            x="130"
            y="114"
            textAnchor="middle"
            fontSize="30"
            fill="#223a2d"
          >
            {v.input}
          </text>
          <text
            x="580"
            y="114"
            textAnchor="middle"
            fontSize="30"
            fill="#223a2d"
          >
            {hideOutput ? '?' : prediction.toFixed(1)}
          </text>
          <text
            x="130"
            y="183"
            textAnchor="middle"
            fontSize="15"
            fill="#5f7266"
          >
            input
          </text>
          <text
            x="580"
            y="183"
            textAnchor="middle"
            fontSize="15"
            fill="#5f7266"
          >
            prediction
          </text>
          <rect
            x="283"
            y="80"
            width="150"
            height="50"
            rx="12"
            fill="#fffefa"
            stroke="#c7d6c6"
          />
          <text
            x="358"
            y="111"
            textAnchor="middle"
            fontSize="20"
            fill="#223a2d"
          >
            × {v.weight.toFixed(1)}
          </text>
          <text x="358" y="58" textAnchor="middle" fontSize="14" fill="#5f7266">
            connection weight
          </text>
        </svg>
        <div className={s.modelSliders}>
          <label>
            Input <output>{v.input}</output>
            <input
              aria-label="Model input"
              type="range"
              min="1"
              max="5"
              step="1"
              value={v.input}
              onChange={(e) =>
                patch({
                  visualState: { ...v, input: Number(e.target.value) },
                  cue: yieldCue(state.cue),
                })
              }
            />
          </label>
          <label>
            Connection weight <output>{v.weight.toFixed(1)}</output>
            <input
              aria-label="Connection weight"
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={v.weight}
              onChange={(e) => {
                const weight = Number(e.target.value);
                patch({
                  visualState: { ...v, weight },
                  cue: yieldCue(state.cue),
                });
                if (weight === 1.5 && v.input === 2)
                  onSelect('Weight set to 1.5');
              }}
            />
          </label>
        </div>
        <div className={s.modelResult} aria-live="polite">
          <span>
            Prediction{' '}
            <strong>{hideOutput ? '?' : prediction.toFixed(1)}</strong>
          </span>
          <span>
            Target <strong>{v.target.toFixed(1)}</strong>
          </span>
          <span>
            Absolute error{' '}
            <strong>
              {hideError ? '?' : Math.abs(prediction - v.target).toFixed(1)}
            </strong>
          </span>
        </div>
        <p className={s.caption}>
          Prediction = input × weight. Adjusting one connection by hand
          illustrates a relationship; this is not an LLM or a complete training
          algorithm.
        </p>
        <button
          onClick={() =>
            patch({
              visualState: {
                kind: 'network',
                input: 2,
                weight: 0.5,
                target: 3,
              },
            })
          }
        >
          Reset experiment
        </button>
      </div>
    );
  }
  if (v.kind === 'clocks') {
    const traveler = elapsedTime(v.earthYears, v.speed);
    return (
      <div className={s.topicModel}>
        <div className={s.boardLabel}>
          <span>SIMPLIFIED RELATIVITY MODEL</span>
          <span>Δτ = Δt √(1 − v²/c²)</span>
        </div>
        <div className={s.clockPair}>
          <Clock years={v.earthYears} label="Earth-frame interval" />
          <div className={s.clockBetween}>
            →<span>{v.speed.toFixed(1)}c</span>
          </div>
          <Clock
            years={traveler}
            label="Traveler proper time"
            hidden={predicting && state.questionId === 'TIME-Q05'}
          />
        </div>
        <div className={s.modelSliders}>
          <label>
            Hypothetical speed <output>{v.speed.toFixed(1)}c</output>
            <input
              aria-label="Traveler speed"
              type="range"
              min="0"
              max="0.9"
              step="0.1"
              value={v.speed}
              onChange={(e) =>
                patch({
                  visualState: { ...v, speed: Number(e.target.value) },
                  cue: yieldCue(state.cue),
                })
              }
            />
          </label>
          <label>
            Earth-frame years <output>{v.earthYears}</output>
            <input
              aria-label="Earth-frame years"
              type="range"
              min="1"
              max="20"
              step="1"
              value={v.earthYears}
              onChange={(e) =>
                patch({
                  visualState: { ...v, earthYears: Number(e.target.value) },
                  cue: yieldCue(state.cue),
                })
              }
            />
          </label>
        </div>
        <div className={s.speedButtons}>
          <button
            onClick={() =>
              patch({ visualState: { ...v, speed: 0.6, earthYears: 10 } })
            }
          >
            Try 0.6c
          </button>
          <button
            onClick={() =>
              patch({ visualState: { ...v, speed: 0.8, earthYears: 10 } })
            }
          >
            Try 0.8c
          </button>
        </div>
        <p className={s.formula} aria-live="polite">
          {v.earthYears} × √(1 − {v.speed.toFixed(1)}²) ={' '}
          <strong>
            {predicting && state.questionId === 'TIME-Q05'
              ? '?'
              : traveler.toFixed(2)}{' '}
            traveler years
          </strong>
        </p>
        <p className={s.caption}>
          An idealized constant-speed segment in the specified Earth frame.
          Acceleration, turnaround and gravity are omitted. This illustrates
          forward time dilation; backward travel is not established.
        </p>
      </div>
    );
  }
  return null;
}
function Clock({
  years,
  label,
  hidden = false,
}: {
  years: number;
  label: string;
  hidden?: boolean;
}) {
  const angle = hidden ? 0 : ((years % 12) * Math.PI) / 6;
  return (
    <div className={s.clock}>
      <svg
        viewBox="0 0 150 150"
        role="img"
        aria-label={`${label}: ${hidden ? '?' : years.toFixed(2)} years`}
      >
        <circle
          cx="75"
          cy="75"
          r="64"
          fill="#fffefa"
          stroke="#a7c2aa"
          strokeWidth="2"
        />
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1={75 + 53 * Math.sin((i * Math.PI) / 6)}
            y1={75 - 53 * Math.cos((i * Math.PI) / 6)}
            x2={75 + 58 * Math.sin((i * Math.PI) / 6)}
            y2={75 - 58 * Math.cos((i * Math.PI) / 6)}
            stroke="#94ae98"
            strokeWidth="2"
          />
        ))}
        <path
          d={`M75 75L${75 + 37 * Math.sin(angle)} ${75 - 37 * Math.cos(angle)}`}
          stroke="#426e4f"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="75" cy="75" r="4" fill="#426e4f" />
      </svg>
      <strong>
        {hidden ? '?' : years.toFixed(2)} <small>years</small>
      </strong>
      <span>{label}</span>
    </div>
  );
}
