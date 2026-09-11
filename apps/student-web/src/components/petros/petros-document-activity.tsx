'use client';

import { useId } from 'react';
import { ArrowDown, ArrowUp, Eye } from 'lucide-react';
import type { PetrosDocumentActivitySpec, PetrosDocumentTeachingScene } from '@edrion/schemas';
import { MathExpression, MathText } from './petros-math';
import styles from './petros-document-teaching.module.css';

type Exploration = Record<string, string | number | boolean>;

function calculate(output: Extract<PetrosDocumentActivitySpec, { kind: 'numeric_exploration' }>['outputs'][number], input: number) {
  return output.steps.reduce((result, step) => {
    const operand = step.operand.source === 'input' ? input : step.operand.value;
    if (step.operation === 'add') return result + operand;
    if (step.operation === 'subtract') return result - operand;
    if (step.operation === 'multiply') return result * operand;
    return result / operand;
  }, output.initial);
}

function wrapLabel(label: string) {
  const words = label.split(/\s+/);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || `${current} ${word}`.length > 19) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  return lines.slice(0, 3);
}

function ConceptDiagram({ spec }: { spec: Extract<PetrosDocumentActivitySpec, { kind: 'concept_map' }> }) {
  const marker = `arrow-${useId().replace(/:/g, '')}`;
  const width = 760;
  const height = spec.layout === 'timeline' ? 250 : Math.max(300, Math.ceil(spec.nodes.length / 3) * 170);
  const positions = Object.fromEntries(spec.nodes.map((node, index) => {
    if (spec.layout === 'cycle') {
      const angle = (Math.PI * 2 * index) / spec.nodes.length - Math.PI / 2;
      return [node.id, { x: width / 2 + Math.cos(angle) * 245, y: height / 2 + Math.sin(angle) * 105 }];
    }
    if (spec.layout === 'timeline') return [node.id, { x: 100 + index * (560 / Math.max(1, spec.nodes.length - 1)), y: 125 }];
    const columns = Math.min(3, spec.nodes.length);
    return [node.id, { x: 120 + (index % columns) * (520 / Math.max(1, columns - 1)), y: 90 + Math.floor(index / columns) * 160 }];
  })) as Record<string, { x: number; y: number }>;
  const edgePoints = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    // Keep arrows outside the node rectangles so arrowheads and labels remain visible.
    const inset = Math.min(82, length / 3);
    return {
      x1: from.x + (dx / length) * inset,
      y1: from.y + (dy / length) * inset,
      x2: to.x - (dx / length) * inset,
      y2: to.y - (dy / length) * inset,
    };
  };
  return (
    <figure className={styles.diagram}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${marker}-title ${marker}-desc`}>
        <title id={`${marker}-title`}>Concept diagram for this lesson</title>
        <desc id={`${marker}-desc`}>{spec.nodes.map((node) => node.label).join(', ')}</desc>
        <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
        {spec.edges.map((edge, index) => {
          const from = positions[edge.from]; const to = positions[edge.to];
          if (!from || !to) return null;
          const points = edgePoints(from, to);
          return <g key={`${edge.from}-${edge.to}-${index}`}><line {...points} markerEnd={`url(#${marker})`} />{edge.label && <text className={styles.edgeLabel} x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 8}>{edge.label}</text>}</g>;
        })}
        {spec.nodes.map((node) => {
          const point = positions[node.id]!; const lines = wrapLabel(node.label);
          return <g key={node.id} transform={`translate(${point.x - 78} ${point.y - 36})`}><rect width="156" height="72" rx="14" /><text x="78" y={lines.length === 1 ? 40 : 31} textAnchor="middle">{lines.map((line, index) => <tspan key={line} x="78" dy={index ? 17 : 0}>{line}</tspan>)}</text></g>;
        })}
      </svg>
      <figcaption className={styles.srOnly}>{spec.edges.map((edge) => `${positions[edge.from] ? spec.nodes.find((node) => node.id === edge.from)?.label : edge.from} leads to ${spec.nodes.find((node) => node.id === edge.to)?.label ?? edge.to}${edge.label ? `: ${edge.label}` : ''}.`).join(' ')}</figcaption>
    </figure>
  );
}

function polynomial(coefficients: number[], x: number) {
  return coefficients.reduce((sum, coefficient, power) => sum + coefficient * (x ** power), 0);
}

function ticks(min: number, max: number, count = 5) {
  return Array.from({ length: count }, (_, index) => min + (index / (count - 1)) * (max - min));
}

function CoordinateGraph({ spec, exploration, onExplore, disabled }: {
  spec: Extract<PetrosDocumentActivitySpec, { kind: 'coordinate_graph' }>;
  exploration: Exploration;
  onExplore: (values: Exploration) => void;
  disabled: boolean;
}) {
  const id = `graph-${useId().replace(/:/g, '')}`;
  const width = 760; const height = 420; const pad = { left: 70, right: 30, top: 30, bottom: 62 };
  const sx = (x: number) => pad.left + ((x - spec.xAxis.min) / (spec.xAxis.max - spec.xAxis.min)) * (width - pad.left - pad.right);
  const sy = (y: number) => height - pad.bottom - ((y - spec.yAxis.min) / (spec.yAxis.max - spec.yAxis.min)) * (height - pad.top - pad.bottom);
  const xAxisY = sy(Math.max(spec.yAxis.min, Math.min(spec.yAxis.max, 0)));
  const yAxisX = sx(Math.max(spec.xAxis.min, Math.min(spec.xAxis.max, 0)));
  const shift = spec.verticalShift && typeof exploration.verticalShift === 'number'
    ? exploration.verticalShift
    : spec.verticalShift?.initial ?? 0;
  const points = (coefficients: number[], verticalShift = 0) => Array.from({ length: 101 }, (_, index) => {
    const x = spec.xAxis.min + (index / 100) * (spec.xAxis.max - spec.xAxis.min);
    return `${index ? 'L' : 'M'} ${sx(x).toFixed(2)} ${sy(polynomial(coefficients, x) + verticalShift).toFixed(2)}`;
  }).join(' ');
  const area = spec.area;
  const partitions = area && typeof exploration.partitions === 'number' ? exploration.partitions : area?.partitions.initial ?? 1;
  const rectangles = area ? Array.from({ length: partitions }, (_, index) => {
    const dx = (area.upper - area.lower) / partitions;
    const left = area.lower + index * dx;
    const sample = area.sampling === 'left' ? left : area.sampling === 'right' ? left + dx : left + dx / 2;
    const y = polynomial(spec.functions[area.functionIndex]!.coefficients, sample);
    const zero = sy(0); const value = sy(y);
    return { x: sx(left), y: Math.min(zero, value), width: Math.max(1, sx(left + dx) - sx(left)), height: Math.abs(zero - value), signed: y < 0 };
  }) : [];
  const estimate = area ? rectangles.reduce((sum, rectangle) => {
    const graphHeight = height - pad.top - pad.bottom;
    const yUnits = (rectangle.height / graphHeight) * (spec.yAxis.max - spec.yAxis.min);
    const dx = (area.upper - area.lower) / partitions;
    return sum + yUnits * dx * (rectangle.signed && area.signed ? -1 : 1);
  }, 0) : null;
  return <figure className={styles.graphFigure}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>{spec.functions.map((fn) => fn.label).join(' and ')}</title>
      <desc id={`${id}-desc`}>{spec.accessibleSummary}</desc>
      {ticks(spec.xAxis.min, spec.xAxis.max).map((value) => <g key={`x-${value}`}><line className={styles.gridLine} x1={sx(value)} y1={pad.top} x2={sx(value)} y2={height - pad.bottom}/><text className={styles.tickLabel} x={sx(value)} y={height - pad.bottom + 22} textAnchor="middle">{Number(value.toPrecision(3))}</text></g>)}
      {ticks(spec.yAxis.min, spec.yAxis.max).map((value) => <g key={`y-${value}`}><line className={styles.gridLine} x1={pad.left} y1={sy(value)} x2={width - pad.right} y2={sy(value)}/><text className={styles.tickLabel} x={pad.left - 10} y={sy(value) + 4} textAnchor="end">{Number(value.toPrecision(3))}</text></g>)}
      <line className={styles.axis} x1={pad.left} y1={xAxisY} x2={width - pad.right} y2={xAxisY} />
      <line className={styles.axis} x1={yAxisX} y1={pad.top} x2={yAxisX} y2={height - pad.bottom} />
      {rectangles.map(({ signed, ...rectangle }, index) => <rect key={index} className={signed ? styles.negativeArea : styles.areaRectangle} {...rectangle} />)}
      {spec.functions.map((fn, index) => <path key={fn.label} className={styles[`plot_${fn.color}`]} d={points(fn.coefficients, spec.verticalShift?.functionIndex === index ? shift : 0)} fill="none" />)}
      {spec.annotations.map((annotation) => <g key={annotation.id}><circle className={styles.annotationPoint} cx={sx(annotation.x)} cy={sy(annotation.y)} r="5"/><text x={sx(annotation.x) + 10} y={sy(annotation.y) - 10}>{annotation.label}</text></g>)}
      <text className={styles.axisLabel} x={width - pad.right} y={height - 20} textAnchor="end">{spec.xAxis.label}{spec.xAxis.unit ? ` (${spec.xAxis.unit})` : ''}</text>
      <text className={styles.axisLabel} x={pad.left} y={18}>{spec.yAxis.label}{spec.yAxis.unit ? ` (${spec.yAxis.unit})` : ''}</text>
    </svg>
    <div className={styles.graphLegend} aria-label="Graph legend">{spec.functions.map((fn) => <span key={fn.label}><i className={styles[`legend_${fn.color}`]} /> <MathText>{fn.label}</MathText></span>)}</div>
    {area ? <div className={styles.graphControls}>
      {spec.predictionPrompt ? <p><strong>Predict first:</strong> {spec.predictionPrompt}</p> : null}
      <label><span>Rectangles</span><strong>{partitions}</strong><input type="range" min={area.partitions.min} max={area.partitions.max} step={1} value={partitions} disabled={disabled} onChange={(event) => onExplore({ partitions: Number(event.target.value) })}/></label>
      <output>Estimated {area.signed ? 'signed ' : ''}area <strong>{estimate?.toFixed(3)}</strong></output>
    </div> : spec.verticalShift ? <div className={styles.graphControls}>
      {spec.predictionPrompt ? <p><strong>Notice:</strong> {spec.predictionPrompt}</p> : null}
      <label><span>{spec.verticalShift.label}</span><strong>{shift}</strong><input aria-label={spec.verticalShift.label} type="range" min={spec.verticalShift.min} max={spec.verticalShift.max} step={spec.verticalShift.step} value={shift} disabled={disabled} onChange={(event) => onExplore({ verticalShift: Number(event.target.value) })}/></label>
      <output>{spec.verticalShift.unchangedFunctionIndex === undefined ? 'Linked graph' : `${spec.functions[spec.verticalShift.unchangedFunctionIndex]?.label ?? 'Comparison'} stays unchanged`}<strong>{spec.verticalShift.label} = {shift}</strong></output>
    </div> : null}
  </figure>;
}

function ProcessDiagram({ spec, exploration, onExplore, disabled }: {
  spec: Extract<PetrosDocumentActivitySpec, { kind: 'process_diagram' }>;
  exploration: Exploration;
  onExplore: (values: Exploration) => void;
  disabled: boolean;
}) {
  const reveal = typeof exploration.reveal === 'number' ? exploration.reveal : 1;
  const visible = new Set(spec.revealOrder.slice(0, reveal));
  const converted = { kind: 'concept_map' as const, layout: spec.orientation === 'cycle' ? 'cycle' as const : 'flow' as const, nodes: spec.nodes.filter((node) => visible.has(node.id)), edges: spec.edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to)), annotations: [`${spec.relationship} relationship`] };
  return <div className={styles.process}><ConceptDiagram spec={converted}/><p>{spec.accessibleSummary}</p><button type="button" disabled={disabled || reveal >= spec.revealOrder.length} onClick={() => onExplore({ reveal: reveal + 1 })}>{reveal >= spec.revealOrder.length ? 'Full relationship revealed' : 'Reveal the next relationship'}</button></div>;
}

export function DocumentActivity({ scene, exploration, onExplore, onResponse, response = '', disabled }: {
  scene: PetrosDocumentTeachingScene;
  exploration: Exploration;
  onExplore: (values: Exploration) => void;
  onResponse?: (value: string) => void;
  response?: string;
  disabled: boolean;
}) {
  const spec = scene.activitySpec;
  if (!spec) return <div className={styles.legacyVisual}>This saved lesson uses the earlier visual format. Its explanation and assessment remain available.</div>;
  if (spec.kind === 'annotated_text') return <div className={styles.annotated}><blockquote><MathText>{spec.passage}</MathText></blockquote><div className={styles.annotationList}>{spec.annotations.map((item) => <div key={item.phrase}><strong><MathText>{item.phrase}</MathText></strong><span><MathText>{item.note}</MathText></span></div>)}</div></div>;
  if (spec.kind === 'comparison') return <div className={styles.tableWrap}><table className={styles.comparison}><thead><tr><th>Lens</th>{spec.columns.map((column) => <th key={column}><MathText>{column}</MathText></th>)}</tr></thead><tbody>{spec.rows.map((row) => <tr key={row.label}><th><MathText>{row.label}</MathText></th>{row.values.map((value, index) => <td key={`${row.label}-${index}`}><MathText>{value}</MathText></td>)}</tr>)}</tbody></table></div>;
  if (spec.kind === 'worked_steps') return <ol className={styles.authoredSteps}>{spec.steps.map((step) => <li key={step.label}><strong><MathText>{step.label}</MathText></strong><span><MathText>{step.detail}</MathText></span></li>)}</ol>;
  if (spec.kind === 'sequence') {
    const stored = typeof exploration.sequenceOrder === 'string' ? exploration.sequenceOrder.split(',') : [];
    const initial = scene.response?.kind === 'ordering' && spec.steps.length > 2
      ? [...spec.steps.slice(1), spec.steps[0]!].map((step) => step.id)
      : spec.steps.map((step) => step.id);
    const order = stored.length === spec.steps.length ? stored : initial;
    const ordered = order.map((id) => spec.steps.find((step) => step.id === id)).filter(Boolean) as typeof spec.steps;
    const move = (index: number, offset: number) => {
      const next = [...order];
      const target = index + offset;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target]!, next[index]!];
      const sequenceOrder = next.join(',');
      onExplore({ sequenceOrder });
      onResponse?.(sequenceOrder);
    };
    return <ol className={styles.reorderList}>{ordered.map((step, index) => <li key={step.id}><b>{index + 1}</b><span><strong>{step.label}</strong>{step.detail && <small>{step.detail}</small>}</span><div><button type="button" aria-label={`Move ${step.label} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp /></button><button type="button" aria-label={`Move ${step.label} down`} disabled={disabled || index === ordered.length - 1} onClick={() => move(index, 1)}><ArrowDown /></button></div></li>)}</ol>;
  }
  if (spec.kind === 'classification') return <div className={styles.classification}>{spec.items.map((item) => <fieldset key={item.id}><legend><MathText>{item.label}</MathText></legend>{spec.categories.map((category) => <button type="button" key={category.id} disabled={disabled} data-active={exploration[`item:${item.id}`] === category.id} onClick={() => { const values = { ...exploration, [`item:${item.id}`]: category.id }; onExplore({ [`item:${item.id}`]: category.id }); onResponse?.(JSON.stringify(Object.fromEntries(spec.items.map((candidate) => [candidate.id, values[`item:${candidate.id}`] ?? ''])))); }}><MathText>{category.label}</MathText></button>)}</fieldset>)}</div>;
  if (spec.kind === 'numeric_exploration') {
    const value = typeof exploration.value === 'number' ? exploration.value : spec.variable.initial;
    return <div className={styles.numeric}><label><span>{spec.variable.label}</span><strong>{value} {spec.variable.unit}</strong><input type="range" min={spec.variable.min} max={spec.variable.max} step={spec.variable.step} value={value} disabled={disabled} onChange={(event) => onExplore({ value: Number(event.target.value) })} /></label><div className={styles.outputGrid}>{spec.outputs.map((output) => <div key={output.label}><span>{output.label}</span><strong>{Number(calculate(output, value).toFixed(2))} {output.unit}</strong></div>)}</div></div>;
  }
  if (spec.kind === 'concept_map') return <ConceptDiagram spec={spec} />;
  if (spec.kind === 'coordinate_graph') return <CoordinateGraph spec={spec} exploration={exploration} onExplore={onExplore} disabled={disabled}/>;
  if (spec.kind === 'equation_steps') return <div className={styles.equationSteps} aria-label={spec.accessibleSummary}>{spec.lines.map((line, index) => line.support === 'student' ? <label className={styles.equationInput} key={line.id}><b>{index + 1}</b><span><span className={styles.inputLabel}>Complete this step</span><input value={response} onChange={(event) => onResponse?.(event.target.value)} disabled={disabled} placeholder="Type the missing expression" /><small><MathText>{line.explanation}</MathText></small></span></label> : <div className={styles.equationLine} key={line.id} data-support={line.support}><b>{index + 1}</b><span><MathExpression value={line.expression} display/><small><MathText>{line.explanation}</MathText></small></span></div>)}</div>;
  if (spec.kind === 'process_diagram') return <ProcessDiagram spec={spec} exploration={exploration} onExplore={onExplore} disabled={disabled}/>;
  if (spec.kind === 'timeline_evidence') return <div className={styles.timeline} aria-label={spec.accessibleSummary}>{spec.events.map((event) => <button type="button" key={event.id} disabled={disabled} data-active={exploration.timelineEvent === event.id} onClick={() => onExplore({ timelineEvent: event.id })}><time>{event.dateLabel}</time><strong>{event.label}</strong><span>{event.evidence}</span></button>)}<p>{spec.question}</p></div>;
  if (spec.kind === 'code_trace') { const revealed = exploration.codeRevealed === true; const frameIndex = typeof exploration.frame === 'number' ? exploration.frame : 0; const frame = spec.frames[Math.min(frameIndex, spec.frames.length - 1)]!; return <div className={styles.codeTrace}><pre><code>{spec.code.map((line, index) => <span key={index} data-active={revealed && index + 1 === frame.line}>{String(index + 1).padStart(2, ' ')}  {line}{'\n'}</span>)}</code></pre><div><p>{spec.predictionPrompt}</p><input className={styles.tracePrediction} value={typeof exploration.codePrediction === 'string' ? exploration.codePrediction : ''} onChange={(event) => onExplore({ codePrediction: event.target.value })} placeholder="Write your prediction first" disabled={disabled || revealed}/>{!revealed ? <button type="button" className={styles.revealButton} disabled={disabled || !String(exploration.codePrediction ?? '').trim()} onClick={() => onExplore({ codeRevealed: true })}><Eye/> Reveal trace</button> : <><dl>{Object.entries(frame.variables).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl><label>Trace step {frameIndex + 1} of {spec.frames.length}<input type="range" min={0} max={spec.frames.length - 1} value={frameIndex} disabled={disabled} onChange={(event) => onExplore({ frame: Number(event.target.value) })}/></label></>}</div></div>; }
  return <div className={styles.scenario}><p>{spec.setting}</p><ul>{spec.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul><strong>{spec.focus}</strong></div>;
}
