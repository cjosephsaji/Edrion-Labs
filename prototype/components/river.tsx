'use client';
import { POLLUTION } from '../teaching/algorithms';
import type { ShowcaseState } from '../teaching/types';
import type { Patch } from './workspace';
import s from './showcase.module.css';
export function River({
  state,
  patch,
  onSelect,
}: {
  state: ShowcaseState;
  patch: Patch;
  onSelect: (s: string) => void;
}) {
  const visual = state.visualState;
  if (visual.kind !== 'river') return null;
  const v = visual;
  function select(id: string) {
    const source = POLLUTION.find((p) => p.id === id)!;
    patch({ visualState: { ...v, selected: id }, highlightTargetId: id });
    onSelect(source.label);
  }
  function control(id: string) {
    patch({
      visualState: {
        ...v,
        selected: id,
        controls: v.controls.includes(id)
          ? v.controls.filter((x) => x !== id)
          : [...v.controls, id],
      },
      highlightTargetId: id,
    });
  }
  const source = POLLUTION.find((p) => p.id === v.selected);
  return (
    <div className={s.riverBoard}>
      <div className={s.boardLabel}>
        <span>UPSTREAM → TOWN → FARM → RIVER</span>
        <span>CONCEPTUAL PATHWAYS</span>
      </div>
      <svg
        className={s.riverSvg}
        viewBox="0 0 760 340"
        role="img"
        aria-label="River passing a town, farm, solid-waste area and drain. Four controls independently change the illustrated pollution pathways."
      >
        <rect width="760" height="340" rx="12" fill="#edf2e5" />
        <path d="M0 60Q180 10 300 83T760 60V0H0Z" fill="#e0e9d4" />
        <path
          d="M0 255Q150 175 300 255T570 245T760 235"
          stroke="#90bcb0"
          strokeWidth="65"
          fill="none"
        />
        <path
          d="M0 246Q150 166 300 246T570 236T760 226"
          stroke="#bbd7cb"
          strokeWidth="30"
          fill="none"
        />
        {[60, 95, 130].map((x, i) => (
          <g key={x}>
            <rect
              x={x}
              y={103 - i * 14}
              width="38"
              height="58"
              rx="2"
              fill={i === 1 ? '#d3b994' : '#f8f3e6'}
            />
            <path
              d={`M${x - 6} ${104 - i * 14}L${x + 19} ${82 - i * 14}L${x + 44} ${104 - i * 14}Z`}
              fill="#8b9c7e"
            />
            <rect
              x={x + 12}
              y={121 - i * 14}
              width="10"
              height="16"
              fill="#b1c2b0"
            />
          </g>
        ))}
        <text x="62" y="55" fill="#4b6752" fontSize="14">
          TOWN
        </text>
        <path
          d="M155 161V217H183"
          stroke="#b0b8a7"
          strokeWidth="12"
          fill="none"
        />
        {v.controls.includes('sewage') ? (
          <g>
            <rect
              x="148"
              y="183"
              width="66"
              height="32"
              rx="7"
              fill="#658f79"
            />
            <text
              x="181"
              y="203"
              textAnchor="middle"
              fontSize="11"
              fill="white"
            >
              TREATMENT
            </text>
            <path d="M184 217V239" stroke="#73aaa0" strokeWidth="5" />
          </g>
        ) : (
          <path
            d="M183 217Q183 242 225 252"
            stroke="#a39564"
            strokeWidth="12"
            fill="none"
            strokeDasharray="3 4"
          />
        )}
        <path
          d="M320 85L510 105L480 191L295 169Z"
          fill="#b4c78d"
          stroke="#9faf78"
        />
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M${324 + i * 33} ${87 + i * 3.5}L${302 + i * 33} ${171 + i * 3.5}`}
            stroke="#e2e7bb"
            strokeWidth="9"
          />
        ))}
        <text x="355" y="67" fill="#4b6752" fontSize="14">
          FARM
        </text>
        {v.controls.includes('runoff') ? (
          <g>
            <path d="M297 183L479 203" stroke="#77985e" strokeWidth="14" />
            <text x="335" y="216" fill="#4b6752" fontSize="11">
              reduced excess chemicals
            </text>
          </g>
        ) : (
          <g stroke="#aab35a" strokeWidth="6" strokeDasharray="5 4">
            <path d="M340 186L365 242M385 192L407 250M434 197L448 261" />
          </g>
        )}
        <g transform="translate(570 130)">
          <path d="M-20 34H40V3H-20Z" fill="#c4d2ba" />
          <path d="M-25 3H45" stroke="#829978" strokeWidth="6" />
          <text x="10" y="60" textAnchor="middle" fontSize="13" fill="#4b6752">
            WASTE
          </text>
          {v.controls.includes('waste') ? (
            <path
              d="M0 20L8 28L26 10"
              stroke="#447354"
              strokeWidth="4"
              fill="none"
            />
          ) : (
            <g>
              <rect
                x="22"
                y="92"
                width="17"
                height="10"
                fill="#a49a7d"
                transform="rotate(13 22 92)"
              />
              <path d="M9 93L19 85L25 99Z" fill="#b2a46c" />
              <rect x="34" y="109" width="10" height="15" fill="#c2af83" />
            </g>
          )}
        </g>
        <g transform="translate(675 145)">
          <path d="M-25 10H25V40H-25Z" fill="#a4b3a3" />
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              d={`M${-17 + i * 10} 14V36`}
              stroke="#6a7e6d"
              strokeWidth="3"
            />
          ))}
          {v.controls.includes('oil') ? (
            <g>
              <rect
                x="-20"
                y="-20"
                width="40"
                height="22"
                rx="4"
                fill="#6c947a"
              />
              <text y="-4" textAnchor="middle" fill="white" fontSize="10">
                COLLECT
              </text>
            </g>
          ) : (
            <path
              d="M0 43Q-22 65 0 79T0 111"
              stroke="#716a54"
              strokeWidth="9"
              fill="none"
            />
          )}
          <text x="0" y="135" fill="#4b6752" fontSize="12" textAnchor="middle">
            DRAIN
          </text>
        </g>
        <path
          d="M95 233H122L113 226M300 260H327L318 253M500 264H527L518 257"
          fill="none"
          stroke="#659c8c"
          strokeWidth="2"
        />
        {POLLUTION.map((p, i) => {
          const xy = [
            [183, 212],
            [410, 179],
            [580, 167],
            [675, 168],
          ][i]!;
          return (
            <g
              key={p.id}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${p.label}`}
              className={s.hotspot}
              onClick={() => select(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  select(p.id);
                }
              }}
            >
              <rect
                x={xy[0]! - 27}
                y={xy[1]! - 27}
                width="54"
                height="54"
                rx="12"
                fill="transparent"
                stroke={v.selected === p.id ? '#2a664c' : 'transparent'}
                strokeWidth="3"
              />
              <circle
                cx={xy[0]}
                cy={xy[1]}
                r="14"
                fill={v.controls.includes(p.id) ? '#2a664c' : '#fffefa'}
                stroke="#779579"
              />
              <text
                x={xy[0]}
                y={xy[1]! + 5}
                textAnchor="middle"
                fontSize="13"
                fill={v.controls.includes(p.id) ? 'white' : '#42604b'}
              >
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <div className={s.interventionGrid}>
        {POLLUTION.map((p, i) => (
          <section key={p.id}>
            <button
              className={s.sourcePick}
              aria-pressed={v.selected === p.id}
              onClick={() => select(p.id)}
            >
              <span>{i + 1}</span>
              {p.label}
            </button>
            <button
              className={s.controlToggle}
              aria-pressed={v.controls.includes(p.id)}
              onClick={() => control(p.id)}
            >
              <span>{v.controls.includes(p.id) ? '✓' : '+'}</span>
              {p.control}
            </button>
            <small>
              {v.controls.includes(p.id)
                ? 'Source controlled in illustration'
                : 'Uncontrolled source'}
            </small>
          </section>
        ))}
      </div>
      {source && (
        <div className={s.sceneExplanation} role="status">
          <strong>{source.label}</strong>
          <p>{source.reason}</p>
          <small>EHS Module 5 · page {source.page}</small>
        </div>
      )}
      <p className={s.caption}>
        Qualitative teaching illustration. Controls do not measure water quality
        or establish drinking-water safety.
      </p>
    </div>
  );
}
