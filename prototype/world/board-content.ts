import { worldTypeface } from './typography';
import { alphaBeta, elapsedTime, entail, minimax, tinyModel } from '../teaching/algorithms';
import { activeTree } from '../teaching/tree-variant';
import { integralArea } from '../teaching/topic-content';
import type { ShowcaseState, VisualState } from '../teaching/types';
import { between, ease } from './motion';
import type { BoardOperation } from './board-motion';
import { resolveLesson } from '../teaching/lesson-registry';
import { currentQuestion } from '../teaching/checkpoint';
import { visualScene } from '../teaching/visual-scene';
import { runtime } from '../teaching/visual-spec';
import { paintVisual } from './visual-painter';
export const BOARD = {
  width: 1600,
  height: 900,
  header: { x: 70, y: 20, w: 1460, h: 88 },
  explanation: { x: 80, y: 118, w: 1440, h: 102 },
  demo: { x: 70, y: 230, w: 1460, h: 570 },
  foot: { x: 80, y: 814, w: 1440, h: 68 },
};
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface BoardHit extends Box {
  id: string;
  value: string;
  label: string;
}
export interface BoardFrame {
  reveal: number;
  caption: string;
  title?: string;
  progress?: number;
  visible: boolean;
  animation?: {
    kind: BoardOperation['kind'];
    elapsed: number;
    duration: number;
    before: VisualState | null;
    newIds: string[];
    oldTarget: string | null;
  };
}
export interface BoardResult {
  fontFamily: string;
  hits: BoardHit[];
  text: string[];
  bounds: Box[];
  errors: string[];
}
export function fitLines(
  text: string,
  width: number,
  measure: (s: string) => number,
  maxLines: number,
) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? line + ' ' + word : word;
    if (measure(next) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return { lines: lines.slice(0, maxLines), overflow: lines.length > maxLines };
}
/** The sole educational-board owner. All drawing is clipped to named, bounded zones. */
export function paintBoard(
  ctx: CanvasRenderingContext2D,
  state: ShowcaseState,
  frame: BoardFrame,
): BoardResult {
  const result: BoardResult = {
    fontFamily: worldTypeface(),
    hits: [],
    text: [],
    bounds: [],
    errors: [],
  };
  const anim = frame.animation;
  const fraction = anim?.duration ? Math.min(1, anim.elapsed / anim.duration) : 1;
  const part = (start: number, duration: number) =>
    anim ? between(anim.elapsed, start, duration) : 1;
  ctx.clearRect(0, 0, 1600, 900);
  ctx.fillStyle = '#f8f9f2';
  ctx.fillRect(0, 0, 1600, 900);
  // The inactive wall board stays quiet while Petros teaches at the experiment table.
  if (state.sceneStation === 'experiment') return result;
  function text(
    value: string,
    box: Box,
    size = 42,
    color = '#254e40',
    align: CanvasTextAlign = 'center',
    maxLines = 2,
  ) {
    ctx.font = `${box === BOARD.header ? 600 : box === BOARD.explanation || box === BOARD.foot ? 400 : 500} ${size}px ${result.fontFamily}`;
    const layout = fitLines(value, box.w - 12, (s) => ctx.measureText(s).width, maxLines);
    if (layout.overflow) result.errors.push('Text needs another beat: ' + value);
    const h = layout.lines.length * size * 1.16;
    if (h > box.h + 1) result.errors.push('Text height exceeds zone: ' + value);
    result.text.push(value);
    result.bounds.push(box);
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    layout.lines.forEach((line, i) =>
      ctx.fillText(
        line,
        align === 'center' ? box.x + box.w / 2 : box.x + 8,
        box.y + box.h / 2 + (i - (layout.lines.length - 1) / 2) * size * 1.16,
      ),
    );
    ctx.restore();
  }
  function line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color = '#a6bcb2',
    dashed = false,
    progress = 1,
    width = 5,
  ) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dashed ? [13, 10] : []);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + (x2 - x1) * progress, y1 + (y2 - y1) * progress);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function node(
    id: string,
    label: string,
    value: string,
    x: number,
    y: number,
    w = 270,
    h = 92,
    color = '#e9f0e8',
  ) {
    const selected = state.highlightTargetId === id;
    ctx.save();
    if (anim?.kind === 'network-build')
      ctx.globalAlpha =
        id === 'input'
          ? part(0, 250)
          : id === 'weight'
            ? part(750, 200)
            : id === 'output'
              ? part(1000, 250)
              : 1;
    else if (anim?.kind === 'rule-link' && anim.newIds.includes(id))
      ctx.globalAlpha = part(id.startsWith('HasWings') ? 300 : 0, 300);
    ctx.fillStyle = selected ? '#d2e4c2' : color;
    ctx.strokeStyle = selected ? '#40764c' : '#9fb5a8';
    ctx.lineWidth = selected ? 5 : 2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 18);
    ctx.fill();
    ctx.stroke();
    const box = { x: x - w / 2 + 9, y: y - h / 2 + 3, w: w - 18, h: h - 6 };
    text(label, box, label.length > 12 ? 43 : label.length > 7 ? 51 : 68);
    result.hits.push({ id, label, value, x: x - w / 2, y: y - h / 2, w, h });
    if (selected && anim?.kind === 'highlight') {
      ctx.strokeStyle = '#b68c40';
      ctx.globalAlpha = 1 - ease(fraction);
      ctx.lineWidth = 5;
      ctx.strokeRect(x - w / 2 - 5, y - h / 2 - 5, w + 10, h + 10);
    }
    ctx.restore();
  }
  const v = state.visualState;
  const lesson = resolveLesson(state);
  const activeQuestion = lesson ? currentQuestion(state, lesson) : undefined;
  const predicting = ['CHECKING_UNDERSTANDING', 'AWAITING_RESPONSE'].includes(
    state.teaching.status,
  );
  let title =
    frame.title ??
    (v.kind === 'topic'
      ? state.learning?.stage === 'test'
        ? 'Observe this new application'
        : v.heading
      : v.kind === 'tree'
        ? 'How does AI choose the best move?'
        : v.kind === 'kb'
          ? 'Facts + rules → supported conclusions'
          : v.kind === 'network'
            ? 'How does one connection learn?'
            : v.kind === 'clocks'
              ? 'Two clocks. Different elapsed time.'
              : v.kind === 'hazards'
                ? 'Inspect the scaffold. Explain the risk.'
                : 'Follow the river. Control the source.');
  if (!frame.visible) {
    title = 'A space for your curiosity.';
    text(title, BOARD.header, 56);
    text('Choose a module from the library.', BOARD.explanation, 40);
    return result;
  }
  text(title, BOARD.header, 56);
  text(
    v.kind === 'topic' && v.visual
      ? state.learning?.stage === 'test'
        ? 'Read the geometry and arrows. Submit your prediction below.'
        : v.visual.objective
      : activeQuestion?.board
        ? activeQuestion.task
        : frame.caption || (v.kind === 'topic' ? v.caption : ''),
    BOARD.explanation,
    38,
    '#557568',
  );
  ctx.strokeStyle = '#d5dfd6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 225);
  ctx.lineTo(1520, 225);
  ctx.stroke();
  if (v.kind === 'kb' && activeQuestion?.board) {
    const board = activeQuestion.board;
    text('SUPPLIED FACTS', { x: 100, y: 245, w: 600, h: 55 }, 31);
    text('ONE-WAY RULES', { x: 810, y: 245, w: 690, h: 55 }, 31);
    text(
      board.facts.join(' · ') || 'No named fact stored yet',
      { x: 100, y: 315, w: 600, h: 145 },
      37,
      '#254e40',
      'center',
      3,
    );
    text(
      board.rules.map((r) => r.premise + ' → ' + r.conclusion).join(' · '),
      { x: 810, y: 315, w: 690, h: 145 },
      36,
      '#254e40',
      'center',
      3,
    );
    const selected = state.studentResponse;
    activeQuestion.options.forEach((option, index) => {
      const box = { x: 110, y: 490 + index * 98, w: 1380, h: 86 };
      ctx.fillStyle = selected === option ? '#d7e6cc' : '#eef3e8';
      ctx.fillRect(box.x, box.y, box.w, box.h);
      text(option, box, 32, '#254e40', 'center', 2);
      result.hits.push({
        ...box,
        id: 'response-' + index,
        label: option,
        value: option,
      });
    });
    text(
      'Choose a response on the board or use the keyboard controls. Then check your answer.',
      BOARD.foot,
      29,
    );
    return result;
  }
  if (v.kind === 'topic') {
    if (v.visual) {
      const scene = visualScene(
        v.visual,
        v.runtime ?? runtime(v.visual.initial),
        state.learning?.stage === 'test',
      );
      paintVisual(ctx, scene, result.fontFamily);
      result.text.push(
        state.learning?.stage === 'test'
          ? 'Application diagram: use the geometry and arrows to infer the process.'
          : scene.description,
        scene.note,
        ...scene.marks.filter((x) => x.kind === 'text').map((x) => x.text),
      );
      if (v.visual.type === 'relationships') {
        const labels = v.visual.nodes
          .filter((n) => !(state.learning?.stage === 'test' && n.role === 'conclusion'))
          .map((n) => n.label);
        result.text.push(...labels.filter((label) => !result.text.includes(label)));
      }
      text('Schematic model · not to scale · use Focus Board for controls', BOARD.foot, 30);
    } else if (v.area) {
      const { slope, upper, slices } = v.area,
        totals = integralArea(v.area),
        yMax = Math.max(4, slope * upper);
      const left = 220,
        base = 650,
        width = 1100,
        height = 300;
      ctx.strokeStyle = '#7e9a87';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(left, 280);
      ctx.lineTo(left, base);
      ctx.lineTo(1440, base);
      ctx.stroke();
      for (let i = 0; i < slices; i++) {
        const w = (width * upper) / 4 / slices,
          h = (height * slope * upper * i) / slices / yMax;
        ctx.fillStyle = '#b9d2ae';
        ctx.fillRect(left + i * w, base - h, w, h);
        ctx.strokeStyle = '#6e9878';
        ctx.lineWidth = 1;
        ctx.strokeRect(left + i * w, base - h, w, h);
      }
      ctx.strokeStyle = '#285f48';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(left, base);
      ctx.lineTo(left + (width * upper) / 4, base - (height * slope * upper) / yMax);
      ctx.stroke();
      text(`f(x) = ${slope === 1 ? 'x' : slope + 'x'}`, { x: 900, y: 270, w: 480, h: 70 }, 44);
      text('0', { x: 170, y: 660, w: 100, h: 60 }, 32);
      text(String(upper), { x: left + (width * upper) / 4 - 50, y: 660, w: 100, h: 60 }, 32);
      text(String(yMax), { x: 90, y: 320, w: 100, h: 65 }, 32);
      text(
        `Left sum ${Number(totals.left.toFixed(6))}   |   Exact integral ${Number(totals.exact.toFixed(6))}   |   ${slices} rectangles`,
        { x: 120, y: 740, w: 1360, h: 65 },
        36,
      );
    } else {
      text(
        'Visual specification unavailable. Use the worked example, or regenerate this saved topic.',
        { x: 160, y: 340, w: 1280, h: 220 },
        42,
        '#557568',
        'center',
        3,
      );
    }
    if (!v.visual)
      text(
        state.topicLesson?.origin === 'generated'
          ? 'AI-generated general knowledge · check important facts'
          : 'Prepared mathematics lesson · interactive example',
        BOARD.foot,
        32,
        '#667f70',
      );
    return result;
  } else if (v.kind === 'tree' && v.opponents) {
    text('YOU  ⇄  OPPONENT', { x: 100, y: 270, w: 1400, h: 100 }, 66);
    text('Higher score  ⇄  Lower score for you', { x: 100, y: 390, w: 1400, h: 80 }, 44);
    node('move-a', 'Move A: 2 or 9', 'A', 430, 580, 590, 130);
    node('move-b', 'Move B: 4 or 5', 'B', 1170, 580, 590, 130);
    text('You pick the move. Your opponent picks the outcome.', BOARD.foot, 40);
    return result;
  }
  if (v.kind === 'tree' && v.example) {
    const ex = v.example,
      answer = ex.role === 'MIN' ? Math.min(...ex.values) : Math.max(...ex.values);
    text(ex.label, { x: 100, y: 270, w: 1400, h: 65 }, 48);
    node(
      state.questionId === 'AI3-Q04'
        ? 'branch-0'
        : state.questionId === 'AI3-Q05'
          ? 'branch-1'
          : state.questionId === 'AI3-Q06'
            ? 'branch-2'
            : 'root',
      ex.role + (ex.revealAnswer ? ` = ${answer}` : ''),
      '',
      800,
      440,
      360,
      100,
    );
    ex.values.forEach((n, i) => {
      const x = 350 + i * (900 / Math.max(1, ex.values.length - 1));
      line(800, 490, x, 650);
      node(`example-${i}`, String(n), String(n), x, 700, 180, 100);
    });
    if (anim?.kind === 'value-pass' && ex.revealAnswer && fraction < 1) {
      const i = ex.values.indexOf(answer),
        p = ease(fraction),
        from = 350 + i * (900 / Math.max(1, ex.values.length - 1));
      text(
        String(answer),
        {
          x: from + (800 - from) * p - 45,
          y: 700 + (440 - 700) * p - 45,
          w: 90,
          h: 90,
        },
        68,
        '#6f7d31',
      );
    }
    text(
      ex.revealAnswer
        ? `${ex.role} chooses the ${ex.role === 'MIN' ? 'smaller' : 'larger'} score.`
        : 'Predict first. Petros will wait.',
      BOARD.foot,
      40,
    );
    return result;
  }
  if (v.kind === 'tree') {
    const tree = activeTree(v),
      mm = minimax(tree),
      pass = alphaBeta(tree),
      events = pass.events.slice(0, v.pruneStep),
      r = v.reveal >= 3 ? 10 : v.reveal >= 2 ? 9 : 6;
    const xs = [320, 800, 1280],
      rootY = 305,
      minY = 490,
      leafY = 700;
    if (r >= 1) {
      if (r >= 2) xs.forEach((x) => line(800, 350, x, 440));
      node(
        'root',
        r >= 10 || (!v.transfer && state.completion['AI3-Q07']?.outcome === 'explored')
          ? `MAX = ${mm.value}`
          : 'MAX',
        'Root MAX + children MIN',
        800,
        rootY,
        330,
        90,
        '#dbe9cd',
      );
    }
    if (r >= 2)
      xs.forEach((x, b) => {
        if (r < 3 && b > 0) return;
        node(
          `branch-${b}`,
          `MIN ${'ABC'[b]}${r >= 7 + b || (!v.transfer && state.completion[`AI3-Q0${b + 4}`]?.outcome === 'explored') ? ' = ' + mm.children[b] : ''}`,
          'ABC'[b]!,
          x,
          minY,
          310,
          92,
          '#f1e5d8',
        );
        if (r < 4 + b) return;
        tree[b]!.forEach((n, l) => {
          const lx = x + (l === 0 ? -98 : 98);
          const e = events.find((e) => e.branch === b && e.leaf === l);
          line(x, 537, lx, 651, e?.skipped ? '#b38a54' : e ? '#477a58' : '#adbcaf', e?.skipped);
          node(
            `leaf-${b}-${l}`,
            String(n),
            String(n),
            lx,
            leafY,
            160,
            96,
            e?.skipped ? '#f4e8d0' : e ? '#d4e8ce' : '#f1f4ed',
          );
          if (e?.skipped) text('skipped', { x: lx - 115, y: 754, w: 230, h: 40 }, 32, '#966d38');
        });
      });
    if (r >= 7 && r <= 9) {
      const b = r - 7,
        leaves = tree[b]!,
        l = leaves.indexOf(mm.children[b]!);
      const p = Math.min(1, frame.progress ?? 1);
      if (p < 1) {
        const y = leafY + (minY - leafY) * p,
          x = xs[b]! + (l === 0 ? -98 : 98) * (1 - p);
        ctx.fillStyle = '#fff9d9';
        ctx.beginPath();
        ctx.arc(x, y, 42, 0, Math.PI * 2);
        ctx.fill();
        text(String(mm.children[b]), { x: x - 38, y: y - 38, w: 76, h: 76 }, 60);
      }
    }
    if (v.pruneStep > 0)
      text(
        `${events.filter((e) => !e.skipped).length} examined · ${events.filter((e) => e.skipped).length} skipped · α = ${v.pruneStep >= 2 ? mm.children[0] : '−∞'} · β = ${events.at(-1)?.beta ?? '∞'}`,
        BOARD.foot,
        36,
        '#486c53',
      );
  } else if (v.kind === 'kb') {
    const heads = ['FACTS', 'RULE', 'CONCLUSIONS'];
    const xs = [290, 800, 1310];
    heads.forEach((t, i) => text(t, { x: xs[i]! - 210, y: 280, w: 420, h: 70 }, 48));
    const facts = frame.reveal >= 2 ? v.facts : [],
      derived = frame.reveal >= 4 ? v.derived : [];
    facts.forEach((fact, i) => node(fact, fact, fact, 290, 430 + i * 135, 380, 100));
    if (frame.reveal >= 3) {
      node('rule', 'Bird(x) → HasWings(x)', 'Bird(x) → HasWings(x)', 800, 450, 490, 125);
      line(495, 450, 545, 450);
    }
    derived.forEach((fact, i) => {
      line(
        1050,
        450 + i * 135,
        1100,
        450 + i * 135,
        '#588961',
        false,
        anim?.kind === 'rule-link' ? part(0, 400) : 1,
      );
      node(fact, fact, fact, 1310, 450 + i * 135, 390, 100);
    });
    if (v.query) {
      const answer = entail(v.facts, v.query);
      text(
        `${v.query}: ${answer.status}`,
        { x: 120, y: 690, w: 1360, h: 80 },
        48,
        answer.status === 'entailed' ? '#39674c' : '#956b3a',
      );
    }
  } else if (v.kind === 'network') {
    const updating =
      anim?.kind === 'network-update' && anim.before?.kind === 'network' && fraction < 1;
    const weight = updating
      ? Number(
          (anim.before!.kind === 'network'
            ? anim.before!.weight + (v.weight - anim.before!.weight) * ease(fraction)
            : v.weight
          ).toFixed(2),
        )
      : v.weight;
    const output = tinyModel(v.input, weight);
    if (frame.reveal >= 1) node('input', `Input ${v.input}`, '', 300, 450, 350, 130);
    if (frame.reveal >= 2) {
      line(
        480,
        450,
        1110,
        450,
        '#a6bcb2',
        false,
        anim?.kind === 'network-build' ? part(250, 500) : 1,
        2 + 2 * weight,
      );
      node(
        'weight',
        `Weight ${weight.toFixed(updating ? 2 : 1)}${updating ? ` → ${v.weight.toFixed(1)}` : ''}`,
        '',
        800,
        450,
        440,
        125,
        '#e6ecd4',
      );
    }
    if (frame.reveal >= 3)
      node(
        'output',
        predicting && ['AI-Q04', 'AI-Q07'].includes(state.questionId ?? '')
          ? '?'
          : String(output.toFixed(updating ? 2 : 1)),
        '',
        1300,
        450,
        300,
        130,
      );
    if (frame.reveal >= 4) {
      const hidden = predicting && ['AI-Q04', 'AI-Q05', 'AI-Q07'].includes(state.questionId ?? '');
      ctx.save();
      if (anim?.kind === 'network-build') ctx.globalAlpha = part(1150, 300);
      if (!hidden)
        text(
          `${v.input} × ${weight.toFixed(updating ? 2 : 1)} = ${output.toFixed(updating ? 2 : 1)}`,
          { x: 130, y: 550, w: 1340, h: 80 },
          46,
        );
      text(
        `Target ${v.target} · absolute error ${predicting && ['AI-Q04', 'AI-Q05', 'AI-Q07'].includes(state.questionId ?? '') ? '?' : Math.abs(output - v.target).toFixed(updating ? 2 : 1)}`,
        { x: 130, y: 650, w: 1340, h: 90 },
        54,
      );
      ctx.restore();
    }
  } else if (v.kind === 'clocks') {
    if (frame.reveal >= 1) {
      node('earth', `${v.earthYears} years`, '', 440, 470, 550, 160);
      text('Earth-frame interval', { x: 160, y: 330, w: 560, h: 70 }, 48);
    }
    if (frame.reveal >= 2) {
      node(
        'traveler',
        predicting && state.questionId === 'TIME-Q05'
          ? '? years'
          : `${elapsedTime(v.earthYears, v.speed).toFixed(2)} years`,
        '',
        1160,
        470,
        550,
        160,
      );
      text(`Traveler · ${v.speed.toFixed(1)}c`, { x: 880, y: 330, w: 560, h: 70 }, 48);
    }
    if (frame.reveal >= 3) text('Δτ = Δt √(1 − v²/c²)', { x: 180, y: 660, w: 1240, h: 90 }, 62);
  } else {
    text(
      v.kind === 'hazards'
        ? 'Observe → identify → explain → make safer'
        : 'Identify source → select prevention → compare',
      { x: 160, y: 360, w: 1280, h: 200 },
      64,
    );
  }
  if (v.kind !== 'tree' || v.pruneStep === 0)
    text(
      state.sourceId
        ? `${state.sourceId} · pp. ${state.sourcePages.join(', ')} · teaching illustration`
        : state.topicLesson?.origin === 'generated'
          ? 'AI-generated general knowledge · check important facts'
          : 'Prepared general knowledge · simplified teaching model',
      BOARD.foot,
      32,
      '#667f70',
    );
  return result;
}
