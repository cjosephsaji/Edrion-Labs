'use client';
import type { Patch, ShowcaseState } from '../teaching/types';
import {
  featureIds,
  parameters,
  runtime,
  transitionVisual,
  validRuntime,
  validVisualSpec,
  valueOf,
  type VisualAction,
} from '../teaching/visual-spec';
import { visualScene } from '../teaching/visual-scene';
import css from './visual-engine.module.css';

export function VisualEngine({
  state,
  patch,
  controlsOnly = false,
}: {
  state: ShowcaseState;
  patch: Patch;
  controlsOnly?: boolean;
}) {
  const v = state.visualState;
  const spec = v.kind === 'topic' ? v.visual : undefined;
  const model = v.kind === 'topic' && spec ? (v.runtime ?? runtime(spec.initial)) : undefined;
  const test = state.learning?.stage === 'test';
  const disabled = state.paused || !!state.pendingRequest || !!state.interruptionCheckpoint;
  function act(action: VisualAction) {
    patch((current) => {
      const t = current.visualState;
      if (
        t.kind !== 'topic' ||
        !t.visual ||
        current.paused ||
        current.pendingRequest ||
        current.interruptionCheckpoint
      )
        return current;
      if (current.learning?.stage === 'test' && !['play', 'pause', 'tick'].includes(action.type))
        return current;
      return {
        ...current,
        visualState: {
          ...t,
          runtime: transitionVisual(t.visual, t.runtime ?? runtime(t.visual.initial), action),
        },
      };
    });
  }
  if (!spec || !model || !validVisualSpec(spec) || !validRuntime(spec, model))
    return (
      <p role="status">
        This saved lesson has no supported visual specification. Use its worked example or generate
        the topic again.
      </p>
    );
  if (spec.type === 'none' || spec.type === 'unsupported')
    return (
      <section className={css.engine} data-visual-type={spec.type} role="status">
        <strong>
          {spec.type === 'none'
            ? 'Work through this concept with reasoning'
            : 'Visual capability unavailable'}
        </strong>
        <p>{spec.reason}</p>
        <p>{spec.objective} Use the worked example and response task below.</p>
      </section>
    );
  const scene = visualScene(spec, model, test);
  const focusableFeatures = new Set<string>();
  // A World Focus Board pauses the room, but permits deliberate model manipulation.
  const blocked = disabled;
  const fixed = test || state.learning?.stage === 'apply';
  const controls = (
    <div className={css.controls} aria-label="Visual model controls">
      {spec.type === 'plate-tectonics' && spec.view === 'boundaries' && !fixed && (
        <div className={css.boundaries}>
          {(['divergent', 'convergent', 'transform'] as const).map((b) => (
            <button
              key={b}
              disabled={blocked}
              aria-pressed={model.boundary === b}
              onClick={() => act({ type: 'boundary', value: b })}
            >
              {b[0]!.toUpperCase() + b.slice(1)}
            </button>
          ))}
        </div>
      )}
      {spec.type === 'plate-tectonics' && spec.view !== 'layers' && (
        <button
          disabled={blocked}
          aria-pressed={model.playing}
          onClick={() => act({ type: model.playing ? 'pause' : 'play' })}
        >
          {model.playing ? 'Pause movement' : 'Play movement'}
        </button>
      )}
      {!test &&
        !(spec.type === 'plate-tectonics' && spec.view === 'layers') &&
        parameters(spec)
          .filter((p) => !fixed || p.id === 'progress')
          .map((p) => (
            <label key={p.id}>
              {p.label}
              <output>{valueOf(model, p.id)}</output>
              <input
                disabled={blocked}
                aria-label={p.label}
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={valueOf(model, p.id)}
                onChange={(e) =>
                  act({ type: 'parameter', id: p.id, value: Number(e.target.value) })
                }
              />
            </label>
          ))}
      {!test &&
        ['relationships', 'force-vectors', 'function-graph'].includes(spec.type) &&
        !model.reveal && (
          <button disabled={blocked} onClick={() => act({ type: 'reveal' })}>
            {spec.type === 'relationships' ? 'Trace supported relationships' : 'Show result'}
          </button>
        )}
      {test && (
        <span className={css.note}>
          Fresh application: observe this fixed example, then submit your prediction below. Help is
          available and recorded.
        </span>
      )}
    </div>
  );
  if (controlsOnly) return controls;
  return (
    <section
      className={css.engine}
      data-visual-type={spec.type}
      data-boundary={test ? 'application' : model.boundary}
      aria-label="Interactive teaching visual"
    >
      <p className={css.scrollHint}>Swipe or scroll sideways to inspect the full diagram.</p>
      <div
        className={css.scroll}
        tabIndex={0}
        role="region"
        aria-label="Scrollable teaching diagram"
      >
        <svg
          className={css.diagram}
          viewBox="0 0 720 380"
          role="group"
          aria-label={
            test ? 'Application diagram: observe the geometry and arrows' : scene.description
          }
        >
          <title>{test ? 'Independent application diagram' : spec.objective}</title>
          {scene.marks.map((mark, i) => {
            const selectable = !test && !blocked && featureIds(spec).includes(mark.id);
            const focusable = selectable && !focusableFeatures.has(mark.id);
            focusableFeatures.add(mark.id);
            const props = {
              'data-feature': mark.id,
              role: focusable ? 'button' : undefined,
              tabIndex: focusable ? 0 : undefined,
              'aria-label': focusable ? `Inspect ${mark.id}` : undefined,
              onClick: selectable ? () => act({ type: 'select', id: mark.id }) : undefined,
              onKeyDown: focusable
                ? (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      act({ type: 'select', id: mark.id });
                    }
                  }
                : undefined,
            };
            if (mark.kind === 'path')
              return (
                <path
                  key={i}
                  {...props}
                  d={mark.d}
                  fill={mark.fill}
                  stroke={mark.stroke}
                  strokeWidth={mark.width}
                  strokeLinejoin="round"
                />
              );
            if (mark.kind === 'ellipse')
              return (
                <ellipse
                  key={i}
                  {...props}
                  cx={mark.x}
                  cy={mark.y}
                  rx={mark.rx}
                  ry={mark.ry}
                  fill={mark.fill}
                  stroke={mark.stroke}
                  strokeWidth={mark.width}
                />
              );
            return (
              <text
                key={i}
                data-feature={mark.id}
                x={mark.x}
                y={mark.y}
                fill={mark.color}
                fontSize={mark.size}
                textAnchor={mark.anchor}
              >
                {mark.text}
              </text>
            );
          })}
        </svg>
      </div>
      <p className={css.note}>{scene.note}</p>
      {controls}
      {!test && model.selected && (
        <p className={css.selection} role="status">
          Selected: {model.selected.replaceAll('-', ' ')}. {spec.objective}
        </p>
      )}
    </section>
  );
}
