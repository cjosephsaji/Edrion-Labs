'use client';
import { HAZARDS } from '../teaching/algorithms';
import type { ShowcaseState } from '../teaching/types';
import type { Patch } from './workspace';
import s from './showcase.module.css';
export function Hazards({
  state,
  patch,
  onSelect,
}: {
  state: ShowcaseState;
  patch: Patch;
  onSelect: (s: string) => void;
}) {
  const visual = state.visualState;
  if (visual.kind !== 'hazards') return null;
  const v = visual;
  function inspect(id: string) {
    const hazard = HAZARDS.find((h) => h.id === id);
    if (!hazard) return;
    const expected =
      state.questionId === 'EHS3-Q02'
        ? 'edge'
        : state.questionId === 'EHS3-Q04'
          ? 'power'
          : null;
    const match = !expected || expected === id;
    patch({
      visualState: {
        ...v,
        selected: id,
        inspected: match ? [...new Set([...v.inspected, id])] : v.inspected,
      },
      highlightTargetId: id,
      ...(!match
        ? {
            lastFeedback:
              expected === 'edge'
                ? 'Not that one—look near the platform edge.'
                : 'Look at the overhead line near the scaffold.',
          }
        : {}),
    });
    onSelect(hazard.label);
  }
  const points = [
    { id: 'edge', x: 325, y: 135, w: 230, h: 45 },
    {
      id: 'tools',
      x: v.safer ? 423 : 482,
      y: v.safer ? 164 : 180,
      w: 90,
      h: 50,
    },
    {
      id: 'ladder',
      x: v.safer ? 235 : 335,
      y: v.safer ? 250 : 195,
      w: 60,
      h: 100,
    },
    { id: 'wheel', x: 245, y: 318, w: 95, h: 45 },
    { id: 'power', x: v.safer ? 665 : 580, y: 45, w: 60, h: 100 },
  ];
  const selected = HAZARDS.find((h) => h.id === v.selected);
  return (
    <div className={s.safetyBoard}>
      <div className={s.boardLabel}>
        <span>FIND THE CONSTRUCTION HAZARDS</span>
        <span>EDUCATIONAL ILLUSTRATION</span>
      </div>
      <div className={s.compareToggle}>
        <button
          aria-pressed={!v.safer}
          onClick={() => patch({ visualState: { ...v, safer: false } })}
        >
          Before
        </button>
        <button
          aria-pressed={v.safer}
          onClick={() => patch({ visualState: { ...v, safer: true } })}
        >
          Show safer setup
        </button>
      </div>
      <svg
        className={s.siteSvg}
        viewBox="0 0 760 390"
        role="img"
        aria-label={
          v.safer
            ? 'Safer illustration: guardrail added, tools secured, ladder removed from tower, wheels locked and power line separated.'
            : 'Construction illustration: missing guardrail, loose tools near edge, ladder on tower, unsecured wheel on uneven ground and nearby overhead power line.'
        }
      >
        <defs>
          <pattern
            id="soil"
            width="25"
            height="25"
            patternUnits="userSpaceOnUse"
          >
            <path d="M4 6h6m7 10h4" stroke="#c5bb9c" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="760" height="390" rx="12" fill="#eff3e9" />
        <path d="M0 280 L760 260 V390 H0Z" fill="#e9dfc5" />
        <path d="M0 280 L760 260 V390 H0Z" fill="url(#soil)" />
        <path d="M40 230 V120 L150 50 L235 120 V230Z" fill="#e1e8db" />
        <path d="M50 230V155H215V230" fill="#d3decf" />
        <path d="M62 174H115V220H62M143 174H196V220H143" fill="#f8f8ed" />
        <text x="55" y="250" fill="#69765f" fontSize="13">
          CONSTRUCTION SITE
        </text>
        {[280, 540].map((x) => (
          <g key={x} stroke="#6f8e7b" strokeWidth="8">
            <path d={`M${x} 150 V323`} />
            <path d={`M${x + 24} 146 V319`} />
          </g>
        ))}
        <path
          d="M280 318L540 187M280 187L540 318M304 314L564 183M304 183L564 314"
          stroke="#a1b5a2"
          strokeWidth="3"
        />
        <path d="M267 180H576V195H267Z" fill="#ae8960" />
        <path d="M277 176H575V185H277Z" fill="#c3a37d" />
        {v.safer ? (
          <g stroke="#66846f" strokeWidth="5" fill="none">
            <path d="M280 180V123H540V180M280 150H540" />
            <path d="M304 147V117H564V179M304 143H564" />
            <path d="M280 171H540" strokeWidth="9" />
          </g>
        ) : (
          <g>
            <path
              d="M280 180V147M540 180V147"
              stroke="#66846f"
              strokeWidth="5"
            />
            <path
              d="M285 126H535"
              stroke="#bb9257"
              strokeDasharray="8 7"
              strokeWidth="2"
            />
            <text x="335" y="119" fontSize="13" fill="#8c692c">
              missing top guardrail
            </text>
          </g>
        )}
        {v.safer ? (
          <g>
            <rect
              x="400"
              y="153"
              width="46"
              height="24"
              rx="4"
              fill="#6f8e7b"
            />
            <path
              d="M414 153V147H431V153"
              stroke="#47644f"
              strokeWidth="3"
              fill="none"
            />
            <text x="387" y="141" fontSize="12" fill="#426b4b">
              secured tools
            </text>
          </g>
        ) : (
          <g transform="translate(516 175) rotate(18)">
            <path d="M-16 0H18M8-12V11" stroke="#6e7470" strokeWidth="7" />
            <rect x="-26" y="-4" width="20" height="8" rx="3" fill="#b6874f" />
          </g>
        )}
        {v.safer ? (
          <g stroke="#708b77" strokeWidth="4">
            <path d="M205 321L250 193M227 323L271 196" />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <path
                key={i}
                d={`M${212 + i * 6} ${302 - i * 19}L${234 + i * 6} ${303 - i * 19}`}
              />
            ))}
          </g>
        ) : (
          <g stroke="#b99557" strokeWidth="5">
            <path d="M342 180L382 291M363 180L404 291" />
            {[0, 1, 2, 3, 4].map((i) => (
              <path
                key={i}
                d={`M${346 + i * 8} ${192 + i * 21}L${368 + i * 8} ${192 + i * 21}`}
              />
            ))}
          </g>
        )}
        {[280, 540].map((x) => (
          <g key={x}>
            <circle
              cx={x + 9}
              cy="333"
              r="12"
              fill="#546759"
              stroke="#384f40"
              strokeWidth="3"
            />
            {v.safer && (
              <path
                d={`M${x - 5} 321H${x + 22}L${x + 25} 332`}
                fill="none"
                stroke="#2a664c"
                strokeWidth="5"
              />
            )}
          </g>
        ))}
        {!v.safer && (
          <path d="M263 349L298 346L309 356L274 359Z" fill="#b69b76" />
        )}
        <g transform={`translate(${v.safer ? 95 : 0} 0)`}>
          <path d="M610 270V55M590 72H635" stroke="#95805f" strokeWidth="7" />
          <path
            d="M550 65Q600 95 655 65M550 55Q600 85 655 55"
            fill="none"
            stroke="#5e6b5f"
            strokeWidth="2"
          />
          <path
            d="M603 100L593 119H603L597 137L616 112H606L613 100Z"
            fill="#bf9b46"
          />
        </g>
        {points.map((p, i) => (
          <g
            key={p.id}
            role="button"
            tabIndex={0}
            aria-label={`Inspect hazard ${i + 1}: ${HAZARDS[i]!.label}`}
            className={s.hotspot}
            onClick={() => inspect(p.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inspect(p.id);
              }
            }}
          >
            <rect
              x={p.x - 15}
              y={p.y - 15}
              width={p.w}
              height={p.h}
              rx="10"
              fill={v.selected === p.id ? '#6f9f841b' : 'transparent'}
              stroke={v.selected === p.id ? '#2a664c' : 'transparent'}
              strokeWidth="3"
            />
            <circle
              cx={p.x}
              cy={p.y}
              r="15"
              fill={v.inspected.includes(p.id) ? '#2a664c' : '#fffefa'}
              stroke="#6b8c72"
              strokeWidth="1.5"
            />
            <text
              x={p.x}
              y={p.y + 5}
              textAnchor="middle"
              fontSize="14"
              fill={v.inspected.includes(p.id) ? 'white' : '#38513e'}
            >
              {v.inspected.includes(p.id) ? '✓' : i + 1}
            </text>
          </g>
        ))}
      </svg>
      <div className={s.hazardList} aria-label="Keyboard hazard alternatives">
        {HAZARDS.map((h, i) => (
          <button
            aria-pressed={v.selected === h.id}
            key={h.id}
            onClick={() => inspect(h.id)}
          >
            <span>{i + 1}</span>
            {h.label}
          </button>
        ))}
      </div>
      {selected && (
        <div className={s.sceneExplanation} role="status">
          <strong>{selected.label}</strong>
          <p>{selected.reason}</p>
          <small>EHS Module 3 · page {selected.page}</small>
        </div>
      )}
      <details
        className={s.excavation}
        open={state.questionId === 'EHS3-Q11' ? true : undefined}
      >
        <summary>Second scene · excavation</summary>
        <svg
          viewBox="0 0 600 170"
          role="img"
          aria-label="Excavation cross section with an unsupported near-vertical sidewall"
        >
          <path d="M0 40H190V145H410V40H600V170H0Z" fill="#ceb18a" />
          <path d="M0 41H190M410 41H600" stroke="#7e9d6e" strokeWidth="8" />
          <path
            d="M190 43L202 67L188 85L204 108L190 145"
            stroke="#a17b52"
            strokeWidth="4"
            fill="none"
          />
          <path d="M196 59L217 91L206 112" fill="#baa07b" />
          <text x="230" y="83" fill="#805a29" fontSize="17">
            Unsupported sidewall
          </text>
          <text x="230" y="110" fill="#805a29" fontSize="14">
            Conceptual collapse hazard
          </text>
        </svg>
        <button
          onClick={() => onSelect('Unsupported sidewall / collapse risk')}
        >
          Identify unsupported sidewall
        </button>
      </details>
      <p className={s.caption}>
        Educational illustration, not live workplace advice or site engineering
        sign-off. “Safer” shows conceptual changes, not regulatory
        certification.
      </p>
    </div>
  );
}
