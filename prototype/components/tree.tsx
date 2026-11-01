'use client';
import type { CSSProperties } from 'react';
import { activeTree } from '../teaching/tree-variant';
import { alphaBeta, minimax } from '../teaching/algorithms';
import type { ShowcaseState } from '../teaching/types';
import { yieldCue } from '../teaching/controller';
import s from './showcase.module.css';
export function Tree({
  state,
  patch,
  onSelect,
}: {
  state: ShowcaseState;
  patch: (p: Partial<ShowcaseState>) => void;
  onSelect: (v: string) => void;
}) {
  const visual = state.visualState;
  if (visual.kind !== 'tree') return null;
  const v = visual;
  const tree = activeTree(v);
  const mm = minimax(tree),
    ab = alphaBeta(tree);
  const events = ab.events.slice(0, v.pruneStep);
  const committed =
    state.teaching.status === 'READY_TO_CONTINUE' &&
    state.observations[state.questionId ?? '']?.responses.at(-1)?.validation ===
      'correct';
  const visible = v.reveal >= 1 || Number(state.questionId?.slice(-2)) >= 2;
  const branchShown = (b: number) =>
    v.reveal >= 2 ||
    (!v.transfer && state.completion[`AI3-Q0${b + 4}`]?.outcome === 'explored');
  function select(id: string, value: string) {
    if (
      state.paused ||
      ['READY_TO_CONTINUE', 'RETEACHING'].includes(state.teaching.status)
    )
      return;
    patch({
      highlightTargetId: id,
      visualState: { ...v, selected: id },
      cue: yieldCue(state.cue),
    });
    onSelect(value);
  }
  function node(
    id: string,
    x: number,
    y: number,
    label: string,
    value: string,
    small = false,
  ) {
    const event = events.find((e) => id === `leaf-${e.branch}-${e.leaf}`);
    const selected =
      v.selected === id ||
      (v.selected === 'layers' && (id === 'root' || id.startsWith('branch-')));
    return (
      <g
        key={id}
        role="button"
        tabIndex={
          state.paused ||
          ['READY_TO_CONTINUE', 'RETEACHING'].includes(state.teaching.status)
            ? -1
            : 0
        }
        aria-disabled={
          state.paused ||
          ['READY_TO_CONTINUE', 'RETEACHING'].includes(state.teaching.status)
        }
        aria-label={`${id}: ${label}`}
        aria-pressed={selected || (small && state.studentResponse === value)}
        onClick={() => select(id, value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            select(id, value);
          }
        }}
        className={s.svgNode}
        data-selected={selected || (small && state.studentResponse === value)}
        data-skipped={event?.skipped}
      >
        <rect
          x={x - (small ? 26 : 52)}
          y={y - 23}
          width={small ? 52 : 104}
          height={46}
          rx={small ? 23 : 13}
          fill={
            selected
              ? '#2a664c'
              : event?.skipped
                ? '#fff3de'
                : event
                  ? '#dceee0'
                  : '#fffefa'
          }
          stroke={event?.skipped ? '#b48442' : selected ? '#21543e' : '#a8beb0'}
          strokeWidth={selected ? 3 : 1.5}
        />
        <text
          x={x}
          y={y + 5}
          textAnchor="middle"
          fill={selected ? 'white' : '#223a2d'}
          fontSize={small ? 28 : 20}
          fontWeight="600"
        >
          {label}
        </text>
        {event?.skipped && (
          <text
            x={x}
            y={y + 42}
            textAnchor="middle"
            fill="#98621e"
            fontSize="13"
          >
            skipped
          </text>
        )}
      </g>
    );
  }
  if (v.opponents)
    return (
      <div
        className={s.opponentBoard}
        data-testid="tree"
        aria-label="Two players with opposing goals"
      >
        <div className={s.boardLabel}>
          <span>ONE GAME · TWO GOALS</span>
          <span>YOUR MOVE MATTERS</span>
        </div>
        <div className={s.players}>
          <div>
            <span className={s.playerPiece} aria-hidden="true">
              ♙
            </span>
            <strong>You</strong>
            <small>Want a higher score</small>
          </div>
          <span className={s.opposingArrow} aria-hidden="true">
            ⇄
          </span>
          <div>
            <span className={s.playerPiece} aria-hidden="true">
              ♟
            </span>
            <strong>Your opponent</strong>
            <small>Wants to reduce your score</small>
          </div>
        </div>
        <div className={s.moveCards}>
          <div>
            <span>MOVE A</span>
            <p>
              <b>2</b>
              <em>or</em>
              <b>9</b>
            </p>
            <small>Your opponent chooses the outcome</small>
          </div>
          <div>
            <span>MOVE B</span>
            <p>
              <b>4</b>
              <em>or</em>
              <b>5</b>
            </p>
            <small>Your opponent chooses the outcome</small>
          </div>
        </div>
      </div>
    );
  if (v.example) {
    const ex = v.example,
      answer =
        ex.role === 'MIN' ? Math.min(...ex.values) : Math.max(...ex.values);
    return (
      <div
        className={s.diagram}
        data-testid="tree"
        aria-label="Focused game choice"
      >
        <div className={s.boardLabel}>
          <span>{ex.label}</span>
          <span>
            {ex.role} {ex.role === 'MAX' ? '↑' : '↓'}
          </span>
        </div>
        <svg
          viewBox="0 0 700 240"
          className={s.tree}
          aria-label={`${ex.role} comparing ${ex.values.join(' and ')}`}
        >
          {ex.values.map((_, i) => (
            <path
              key={i}
              d={`M350 70 L${150 + i * (400 / Math.max(1, ex.values.length - 1))} 175`}
              stroke="#91ae9a"
              strokeWidth={2}
            />
          ))}
          {node(
            state.questionId === 'AI3-Q04'
              ? 'branch-0'
              : state.questionId === 'AI3-Q05'
                ? 'branch-1'
                : state.questionId === 'AI3-Q06'
                  ? 'branch-2'
                  : 'root',
            350,
            45,
            ex.role + (ex.revealAnswer ? ' = ' + answer : ''),
            '',
          )}
          {ex.values.map((n, i) =>
            node(
              `example-${i}`,
              150 + i * (400 / Math.max(1, ex.values.length - 1)),
              198,
              String(n),
              String(n),
              true,
            ),
          )}
          {committed && (
            <ValueTravel
              value={answer}
              from={[
                150 +
                  ex.values.indexOf(answer) *
                    (400 / Math.max(1, ex.values.length - 1)),
                198,
              ]}
              to={[350, 45]}
            />
          )}
        </svg>
        <p className={s.caption}>
          {ex.revealAnswer
            ? `${ex.role} chooses the ${ex.role === 'MAX' ? 'larger' : 'smaller'} score: ${answer}.`
            : 'Make your prediction. The result appears after you respond.'}
        </p>
      </div>
    );
  }
  return (
    <div className={s.diagram} data-testid="tree">
      <div className={s.boardLabel}>
        <span>THE GAME TREE</span>
        <span>MAX ↑ &nbsp; MIN ↓</span>
      </div>
      <svg
        viewBox="0 0 700 305"
        aria-label={`Game tree: MAX root, three MIN children A B C, leaves ${tree.flat().join(', ')}`}
        className={s.tree}
      >
        <defs>
          <marker
            id="arrow"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6" fill="none" stroke="#8ca497" />
          </marker>
        </defs>
        {[130, 350, 570].map((x, b) => (
          <g key={x}>
            <path
              d={`M350 61 L${x} 115`}
              fill="none"
              stroke={
                (v.reveal >= 3 && b === mm.best) ||
                events.some((e) => e.branch === b)
                  ? '#2a664c'
                  : '#b1c3b6'
              }
              strokeWidth={v.reveal >= 3 && b === mm.best ? 3 : 1.5}
              markerEnd="url(#arrow)"
            />
            {[x - 45, x + 45].map((lx, l) => {
              const event = events.find((e) => e.branch === b && e.leaf === l);
              return (
                visible && (
                  <path
                    key={l}
                    d={`M${x} 161 L${lx} 224`}
                    fill="none"
                    stroke={
                      event?.skipped ? '#b48442' : event ? '#2a664c' : '#b1c3b6'
                    }
                    strokeWidth={event ? 2.5 : 1.5}
                    strokeDasharray={event?.skipped ? '6 5' : undefined}
                  />
                )
              );
            })}
          </g>
        ))}
        {committed &&
          [4, 5, 6].includes(Number(state.questionId?.slice(-2))) &&
          (() => {
            const b = Number(state.questionId?.slice(-2)) - 4;
            const x = [130, 350, 570][b]!;
            return (
              <ValueTravel
                value={mm.children[b]!}
                from={[
                  x + (tree[b]!.indexOf(mm.children[b]!) === 0 ? -45 : 45),
                  246,
                ]}
                to={[x, 138]}
              />
            );
          })()}
        {node(
          'root',
          350,
          38,
          v.reveal >= 3 ||
            (!v.transfer && state.completion['AI3-Q07']?.outcome === 'explored')
            ? `MAX = ${mm.value}`
            : 'MAX',
          'Root MAX + children MIN',
        )}
        {[130, 350, 570].map((x, b) => (
          <g key={b}>
            {node(
              `branch-${b}`,
              x,
              138,
              `MIN ${'ABC'[b]}${branchShown(b) ? ' = ' + mm.children[b] : ''}`,
              Number(state.questionId?.slice(-2)) === 2
                ? 'Root MAX + children MIN'
                : 'ABC'[b]!,
            )}
            {visible && (
              <g
                className={s.leafGroup}
                style={{ animationDelay: `${b * 250}ms` }}
              >
                {tree[b]!.map((leaf, l) =>
                  node(
                    `leaf-${b}-${l}`,
                    x + (l === 0 ? -45 : 45),
                    246,
                    String(leaf),
                    String(leaf),
                    true,
                  ),
                )}
              </g>
            )}
          </g>
        ))}
      </svg>
      {v.pruneStep > 0 && (
        <div className={s.boardControls}>
          <span aria-live="polite">
            {events.filter((e) => !e.skipped).length} evaluated ·{' '}
            {events.filter((e) => e.skipped).length} skipped
          </span>
        </div>
      )}
      {v.pruneStep > 0 && (
        <p className={s.bound}>
          Traversal A → B → C · α{' '}
          {v.pruneStep >= 2 ? '= ' + mm.children[0] : 'starts at −∞'} · prune
          when β ≤ α ·{' '}
          {events.at(-1) ? `current β = ${events.at(-1)!.beta}` : ''}
        </p>
      )}
      <p className={s.caption}>
        Worked teaching example adapted to the module concepts.{' '}
        {v.transfer
          ? 'Transfer tree: predict the new guaranteed result.'
          : 'Leaves represent utility for MAX.'}{' '}
        {v.allLeaves
          ? `Without pruning: ${tree.flat().length} leaf values.`
          : ''}
      </p>
    </div>
  );
}
function ValueTravel({
  value,
  from,
  to,
}: {
  value: number;
  from: [number, number];
  to: [number, number];
}) {
  return (
    <text
      aria-hidden="true"
      className={s.valueTravel}
      x={from[0]}
      y={from[1]}
      textAnchor="middle"
      style={
        {
          '--dx': `${to[0] - from[0]}px`,
          '--dy': `${to[1] - from[1]}px`,
        } as CSSProperties
      }
    >
      {value}
    </text>
  );
}
