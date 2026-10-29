import { teachingPlan } from './curriculum';
import { activeTree } from './tree-variant';
import {
  alphaBeta,
  elapsedTime,
  entail,
  HAZARDS,
  minimax,
  POLLUTION,
  tinyModel,
} from './algorithms';
import type { Lesson, ShowcaseState } from './types';
export interface RetrievedExplanation {
  text: string;
  label: string;
  target: string | null;
  clarification?: boolean;
}
/** Prepared retrieval over the actual visible demonstrator, never a model impersonation or prose grader. */
export function retrieveExplanation(
  state: ShowcaseState,
  lesson: Lesson,
  prompt: string,
): RetrievedExplanation | null {
  const q =
    lesson.questions.find((q) => q.id === state.questionId) ??
    lesson.questions[0]!;
  const text = prompt.trim().toLowerCase();
  const target = state.highlightTargetId;
  const simpler =
    /simpler|simply|another example|didn.t understand|don.t understand|do not understand/.test(
      text,
    );
  const relevant =
    simpler ||
    /another example|what.s the point|quiz me|more practice|go back|previous step/.test(
      text,
    ) ||
    /\bmin\b|\bmax\b|node|branch|leaf|this|that|this step|didn.t understand|go back|check|choose|chosen|support|follow|prun|unknown|false|clock|weight|hazard|pollut|tweety|rio|rule|fact|scaffold|runoff/.test(
      text,
    );
  if (!relevant) return null;
  const label = lesson.general
    ? 'Prepared general-knowledge explanation'
    : 'Prepared source-linked explanation';
  const suffix = lesson.filename
    ? ` Source: ${lesson.filename}, pp. ${(state.sourcePages.length ? state.sourcePages : q.pages).join(', ')}.`
    : '';
  const v = state.visualState;
  if (/another example|quiz me|more practice/.test(text)) {
    const plan = teachingPlan(state, lesson, q);
    return {
      text: `${plan.example} We can try a follow-up here when you resume.${suffix}`,
      label,
      target,
    };
  }
  if (/what.s the point/.test(text))
    return {
      text: `${lesson.introduction} ${teachingPlan(state, lesson, q).introduction}${suffix}`,
      label,
      target,
    };
  if (/go back|previous (step|checkpoint)/.test(text))
    return {
      text: 'We can revisit the previous checkpoint. Your submitted responses are preserved; resume when you are ready.',
      label: 'Prepared lesson control',
      target,
    };
  if (v.kind === 'tree') {
    if (v.example) {
      const ex = v.example,
        answer =
          ex.role === 'MIN' ? Math.min(...ex.values) : Math.max(...ex.values);
      return {
        text: `${simpler ? (ex.role === 'MIN' ? 'Imagine your opponent choosing your points. They want you to get fewer.' : 'Imagine choosing your own points. You want more.') : `This visible ${ex.role} example compares ${ex.values.join(' and ')}.`} ${ex.role} returns ${ex.role.toLowerCase()}(${ex.values.join(', ')}) = ${answer}. ${ex.role === 'MIN' ? 'These scores measure MAX’s benefit, so MIN prefers the smaller value.' : 'The scores measure MAX’s benefit, so MAX prefers the larger value.'}${suffix}`,
        label,
        target,
      };
    }

    const tree = activeTree(v);
    const result = minimax(tree);
    const pass = alphaBeta(tree);
    if (
      /prun|alpha|beta|skip/.test(text) ||
      (v.pruneStep >= 4 && /check.*9|9.*check/.test(text))
    )
      return {
        text: `After A establishes alpha = ${result.children[0]}, MIN B observes ${tree[1]![0]}. B can guarantee no more than ${tree[1]![0]}, so it cannot improve MAX's available ${result.children[0]}. Its remaining ${tree[1]![1]} is skipped. C begins with ${tree[2]![0]}${tree[2]![0]! > result.children[0]! ? ` > ${result.children[0]}, so we must also examine its ${tree[2]![1]}` : ', already below alpha'}. This traversal evaluates ${pass.visited} leaves and skips ${pass.skipped}; the root is still ${result.value}.${suffix}`,
        label,
        target: 'leaf-1-1',
      };
    const named = (prompt.match(/\b(?:min|branch)\s+([abc])\b/i) ??
      prompt.match(/\b([ABC])\b/))?.[1]?.toUpperCase();
    const explicitRoot =
      /root/.test(text) || (/\bmax\b/.test(text) && !/\bmin\b/.test(text));
    const selected = target?.match(/(?:branch|leaf)-(\d)/)?.[1];
    const index = named
      ? 'ABC'.indexOf(named)
      : selected !== undefined
        ? Number(selected)
        : null;
    if (!explicitRoot && index !== null && index >= 0 && index < 3) {
      const values = tree[index]!;
      const mentioned = (text.match(/\b\d+\b/g) ?? []).map(Number);
      if (mentioned.length > 0 && mentioned.some((n) => !values.includes(n)))
        return {
          text: `The highlighted MIN ${'ABC'[index]} is comparing ${values.join(' and ')}. You mentioned ${mentioned.join(' and ')}. Do you mean this MIN node, or MAX's root decision? I’ll keep this node highlighted while you clarify.`,
          label: 'Clarification needed · current diagram',
          target,
          clarification: true,
        };
      return {
        text: simpler
          ? `Think of MIN ${'ABC'[index]} as your opponent choosing from ${values.join(' and ')}. They choose the smaller score, ${result.children[index]}, because the score is measured for MAX. A tempting larger leaf is not guaranteed: your opponent controls this choice.${suffix}`
          : `At the highlighted MIN ${'ABC'[index]}, the actual alternatives are ${values.join(' and ')}. MIN returns min(${values.join(', ')}) = ${result.children[index]}. It minimizes MAX's utility, so the larger leaf cannot be promised to MAX.${suffix}`,
        label,
        target: named && selected !== String(index) ? `branch-${index}` : target,
      };
    }
    if (explicitRoot || target === 'root')
      return {
        text: `MAX compares the guarantees of whole branches: A=${result.children[0]}, B=${result.children[1]}, C=${result.children[2]}. It chooses ${'ABC'[result.best]}, which guarantees ${result.value}. A leaf such as ${Math.max(...tree[1]!)} is not B's guarantee; MIN B can choose its smaller leaf.${suffix}`,
        label,
        target: 'root',
      };
    return {
      text: 'Which node do you mean? Select MAX or MIN A, B or C, then ask again. I’ll explain the actual values at that node.',
      label: 'Clarification needed · select a node',
      target: null,
      clarification: true,
    };
  }
  if (simpler) {
    const plan = teachingPlan(state, lesson, q);
    return {
      text: `${plan.simpler} ${plan.demonstration}${suffix}`,
      label,
      target,
    };
  }
  if (v.kind === 'kb') {
    const query = /canfly|\bfly\b|flight/.test(text)
      ? `CanFly(${/rio/.test(text) ? 'Rio' : 'Tweety'})`
      : /haswings|wings/.test(text)
        ? `HasWings(${/rio/.test(text) ? 'Rio' : 'Tweety'})`
        : v.query ||
          (target?.includes('CanFly') ? 'CanFly(Tweety)' : 'HasWings(Tweety)');
    const answer = entail(v.facts, query);
    return {
      text: query.includes('CanFly')
        ? `Our visible knowledge base contains bird facts and the wings rule. It contains no flight rule, so ${query} is not entailed. Missing support does not prove falsehood. For comparison, Bird(Tweety) plus Bird(x) → HasWings(x) does support wings.${suffix}`
        : `For ${query}, the current result is ${answer.status}. ${answer.path.join(' → ')}. ${simpler ? 'Think of a rule as a bridge: you can cross only when its starting fact is present. TELL adds a fact; ASK checks where those bridges lead.' : 'We derive only what the stored facts and this permitted rule support.'}${suffix}`,
      label,
      target: query,
    };
  }
  if (v.kind === 'hazards') {
    const hazard = HAZARDS.find((h) => h.id === v.selected);
    return hazard
      ? {
          text: `You selected ${hazard.label.toLowerCase()}. ${hazard.reason} ${simpler ? 'Look at the changed object in the safer version and connect it to this specific risk.' : ''} Source: EHS_Module_3.pdf, p. ${hazard.page}. Educational illustration only.`,
          label,
          target: hazard.id,
        }
      : {
          text: 'Select a visible hazard first so I can explain that exact part of the construction model.',
          label: 'Clarification needed · select a hazard',
          target: null,
          clarification: true,
        };
  }
  if (v.kind === 'river') {
    const source = POLLUTION.find((p) => p.id === v.selected);
    return source
      ? {
          text: `The selected pathway is ${source.label.toLowerCase()}. ${source.reason} It is currently ${v.controls.includes(source.id) ? 'controlled' : 'uncontrolled'} in this illustration. This does not measure water quality or establish drinking safety. Source: EHS_Module_5.pdf, p. ${source.page}.`,
          label,
          target: source.id,
        }
      : {
          text: 'Select one pollution source so we can trace its particular pathway into the river.',
          label: 'Clarification needed · select a source',
          target: null,
          clarification: true,
        };
  }
  if (v.kind === 'network')
    return {
      text: `Right now this tiny model multiplies input ${v.input} by weight ${v.weight.toFixed(1)} to predict ${tinyModel(v.input, v.weight).toFixed(1)}. Its target is ${v.target}, so the absolute error is ${Math.abs(v.target - tinyModel(v.input, v.weight)).toFixed(1)}. ${simpler ? 'The weight is like a volume knob for this one connection. Change it and the output changes.' : 'This hand-adjusted single connection is an illustration, not a description of all AI or an LLM.'}`,
      label,
      target,
    };
  return {
    text: simpler
      ? `Imagine two elapsed-time readings: the Earth-frame clock counts ${v.earthYears} years, while the traveler counts ${elapsedTime(v.earthYears, v.speed).toFixed(2)} at ${v.speed.toFixed(1)}c. Neither clock rewinds. A different hypothetical is 10 Earth-frame years at 0.6c: the same formula gives ${elapsedTime(10, 0.6).toFixed(0)} traveler years. These simplified comparisons omit acceleration and gravity; they do not establish backward travel.`
      : `At ${v.speed.toFixed(1)}c, the current ${v.earthYears} Earth-frame years correspond to ${elapsedTime(v.earthYears, v.speed).toFixed(2)} traveler years: Δτ = Δt √(1 − v²/c²). This idealized constant-speed segment omits acceleration, turnaround and gravity. It illustrates forward time dilation, not established backward travel.`,
    label,
    target,
  };
}
