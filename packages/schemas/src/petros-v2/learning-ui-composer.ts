import type { M4Snapshot } from './student-session';
import type { CanvasElement } from './canvas';
import {
  learningUIPlanSchema,
  type LearningUIPlan,
  type LearningUIFamily,
  type LearningUIBlock,
} from './learning-ui';

const recipes: Record<
  LearningUIFamily,
  Pick<LearningUIPlan, 'title' | 'caption' | 'instruction' | 'reason' | 'layout'>
> = {
  reading: {
    layout: 'focus',
    title: 'Explore the source',
    caption: 'Let’s explore the source one idea at a time.',
    instruction:
      'Read the supplied passage. Pick an idea to examine, then explain it in your own words.',
    reason:
      'Starting with the source gives you the context and evidence you’ll use in the next activity.',
  },
  equation: {
    layout: 'sequence',
    title: 'Work through the calculation',
    caption: 'Let’s take the calculation one step at a time.',
    instruction:
      'Compare the worked example with your saved answer. Check each operation and its units before you revise your calculation.',
    reason:
      'Working through one operation at a time makes the calculation easier to follow. Compare each worked step with your saved answer.',
  },
  relationships: {
    layout: 'explore',
    title: 'Compare the connections',
    caption: 'Let’s look at how these ideas connect.',
    instruction:
      'Inspect the ideas, connect the relevant items, and explain the direction of each relationship.',
    reason:
      'Comparing the connections helps you explain how the ideas relate. Use the source to support the connection you choose.',
  },
  comparison: {
    layout: 'compare',
    title: 'Compare the cases',
    caption: 'Let’s compare the details side by side.',
    instruction:
      'Choose the rows you want to compare. Read the same attribute across each case, then explain what differs.',
    reason:
      'Comparing one attribute at a time makes similarities and differences easier to explain.',
  },
  graph: {
    layout: 'compare',
    title: 'Explore the pattern',
    caption: 'Let’s connect the picture with the values behind it.',
    instruction:
      'Select a point and compare its coordinates with the table. Use the displayed values to explain what you notice.',
    reason:
      'A graph shows the pattern, while its values let you inspect individual observations without guessing from the drawing.',
  },
  process: {
    layout: 'sequence',
    title: 'Follow the process',
    caption: 'Let’s follow what changes at each step.',
    instruction:
      'Move through the steps and inspect the recorded state. Explain what changes before moving on.',
    reason:
      'Seeing one step and its state at a time helps you follow the sequence and explain how the process develops.',
  },
  experiment: {
    layout: 'explore',
    title: 'Predict, change, explain',
    caption: 'Make a prediction, then compare it with the checked observation.',
    instruction:
      'Write a prediction, change a model input, and inspect the checked result. Explain how the observation compares with your prediction.',
    reason:
      'Predicting before changing an input makes the comparison useful. The checked observation shows what the stated model does under its assumptions.',
  },
  practice: {
    layout: 'focus',
    title: 'Your turn',
    caption: 'Take your time and show your own reasoning.',
    instruction:
      'Use the question and supplied passage to complete your answer. Save your work before leaving.',
    reason:
      'This question gives you a chance to apply the idea. Feedback follows your submitted answer.',
  },
};

/** Select only from acknowledged public structure. No topic names, answer strings,
 * private criteria, model calls, HTML, CSS or executable UI enter the plan. */
export function canvasLearningBlocks(elements: CanvasElement[]): LearningUIBlock[] {
  const blocks: LearningUIBlock[] = [];
  const relationships = elements.filter((e) => e.kind === 'node' || e.kind === 'edge');
  if (relationships.length)
    blocks.push({
      id: 'relationship-workspace',
      kind: 'relationships',
      elementIds: relationships.map((e) => e.id),
      emphasis: 'primary',
    });
  for (const e of elements) {
    if (e.kind === 'node' || e.kind === 'edge') continue;
    const kind =
      e.kind === 'text'
        ? 'passage'
        : e.kind === 'allocation'
          ? 'experiment'
          : e.kind === 'table'
            ? 'comparison'
            : e.kind === 'trace'
              ? 'process'
              : e.kind;
    blocks.push({
      id: `element-${e.id}`,
      kind,
      elementIds: [e.id],
      emphasis:
        e.kind === 'text' && elements.some((v) => v.kind !== 'text') ? 'supporting' : 'primary',
    });
  }
  return blocks;
}

export function composeLearningUI(s: M4Snapshot): LearningUIPlan {
  const teaching = s.teaching;
  const independent = !!s.task && !s.submission && !teaching;
  const available = s.status === 'blocked' ? [] : (s.canvas?.elements ?? []);
  const capability = teaching?.capability;
  let family: LearningUIFamily = independent
    ? 'practice'
    : teaching?.simulation || capability === 'simulation'
      ? 'experiment'
      : capability === 'code_trace' ||
          capability === 'process' ||
          available.some((e) => e.kind === 'trace')
        ? 'process'
        : capability === 'graph' || available.some((e) => e.kind === 'graph')
          ? 'graph'
          : capability === 'equation' ||
              available.some((e) => e.kind === 'equation') ||
              teaching?.decision.strategy === 'method_repair'
            ? 'equation'
            : capability === 'table' || available.some((e) => e.kind === 'table')
              ? 'comparison'
              : capability === 'diagram' ||
                  available.some((e) => e.kind === 'node') ||
                  (!!teaching &&
                    [
                      'conceptual_contrast',
                      'warrant_inspection',
                      'clarifying_question',
                      'assumption_comparison',
                    ].includes(teaching.decision.strategy))
                ? 'relationships'
                : 'reading';
  if (!independent && capability)
    family = (
      {
        source: 'reading',
        equation: 'equation',
        diagram: 'relationships',
        table: 'comparison',
        graph: 'graph',
        process: 'process',
        code_trace: 'process',
        simulation: 'experiment',
      } as const
    )[capability];
  if (!independent && teaching?.simulation) family = 'experiment';
  if (!teaching && !s.task) family = 'reading';
  const copy = { ...recipes[family] };
  if (teaching && ['relationships', 'comparison'].includes(family))
    copy.instruction = teaching.caption;
  if (teaching?.decision.strategy === 'faded_support')
    Object.assign(copy, {
      title: 'Try with fewer prompts',
      caption: 'You can take the lead on this step.',
      instruction:
        'Explain the idea using what you remember. When you’re ready, try a new question and show your reasoning.',
      reason:
        'You’ve already worked with the explanation. Trying with fewer prompts gives you a chance to explain the next step in your own words.',
    });
  if (
    teaching &&
    ['clarifying_question', 'warrant_inspection', 'assumption_comparison'].includes(
      teaching.decision.strategy,
    )
  )
    Object.assign(copy, {
      title: 'Look more closely',
      caption: 'Let’s look at the evidence behind your explanation.',
      reason:
        'The reasoning needs a closer look before it can be judged. Connect your explanation to the passage and consider another possible interpretation.',
    });
  if (
    family === 'equation' &&
    teaching?.equationSteps?.some((step) => step.rule === 'subtract' && step.result.unit === 'GB')
  )
    Object.assign(copy, {
      instruction:
        'First subtract the memory set aside. Use the remaining amount in the next calculation and keep track of the units. Compare the example with your saved answer.',
      reason:
        'You need to know how much memory remains before using it in the next calculation. This step separates the memory set aside from the memory available.',
    });
  const blocks = canvasLearningBlocks(available);
  if (available.some((e) => e.kind === 'allocation'))
    Object.assign(copy, {
      title: 'Test the resource limit',
      caption: 'Predict, allocate, then explain what the model shows.',
      instruction:
        'Predict whether another allocation fits. Test the model, then revise your calculation and explain what changed.',
    });
  if (
    teaching?.status === 'complete' &&
    teaching.simulation &&
    !available.some((e) => e.kind === 'allocation')
  )
    blocks.push({
      id: 'checked-experiment',
      kind: 'experiment',
      elementIds: [],
      emphasis: 'primary',
    });
  return learningUIPlanSchema.parse({
    version: 'edrion.learning-ui.v1',
    origin: 'structured_content_composer',
    binding: {
      sessionId: s.id,
      revision: s.revision ?? 0,
      epoch: s.epoch ?? 0,
      canvasRevision: s.canvas?.revision ?? null,
    },
    family,
    ...copy,
    blocks,
  });
}

/** Saved snapshots remain compatible. Recompute a stale or unknown component plan. */
export function learningUIFor(s: M4Snapshot): LearningUIPlan {
  const expected = composeLearningUI(s);
  const parsed = learningUIPlanSchema.safeParse(s.learningUI);
  const p = parsed.success ? parsed.data : null;
  if (
    p &&
    p.binding.sessionId === s.id &&
    p.binding.revision === (s.revision ?? 0) &&
    p.binding.epoch === (s.epoch ?? 0) &&
    p.binding.canvasRevision === (s.canvas?.revision ?? null)
  ) {
    const existing = new Set(s.canvas?.elements.map((e) => e.id));
    if (
      p.family === expected.family &&
      p.title === expected.title &&
      p.caption === expected.caption &&
      p.instruction === expected.instruction &&
      p.reason === expected.reason &&
      p.layout === expected.layout &&
      JSON.stringify(p.blocks) === JSON.stringify(expected.blocks) &&
      p.blocks.every((block) => block.elementIds.every((id) => existing.has(id)))
    )
      return p;
  }
  return expected;
}
