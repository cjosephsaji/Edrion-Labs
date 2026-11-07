import { defineStageLesson, type V3 } from '../lesson';
import { initial } from '../../simulations/runtime';
import {
  contextPosition,
  queryPosition,
  tokenPosition,
  nextAttentionQuery,
  vectorText,
  type AttentionStageState,
} from '../attention-logic';
import { format } from '../logic';
const q = (s: AttentionStageState): V3 => queryPosition(s);
const mask: V3 = [-2.55, 0.65, 1.25];
export function createAttentionLesson(tokens: string[]) {
  const example = initial('attention');
  const next = (s: AttentionStageState) => ({
    tool: 'sim_set_params' as const,
    args: { patch: { query: nextAttentionQuery(s) } },
  });
  return defineStageLesson<AttentionStageState>({
    id: 'attention',
    shortTitle: 'Attention',
    title: 'Where words look',
    eyebrow: 'Lesson 03 · Attention',
    nextLessons: ['Traffic waves', 'Time dilation'],
    subtitle:
      'Choose a word. Follow the shares of information it borrows from the sentence.',
    abstractSubtitle:
      'One attention head. Computed shares mix four-number value vectors.',
    canvasDescription:
      'Attention Stage. Glass word tablets form a sentence. The gold tablet is the selected query. Curved beams carry value information into it; thicker beams mean larger computed shares. Blocked future words show a lock and zero share. The front glass mixer shows the four-number context. Click a word to select and inspect it; drag the studio to orbit.',
    story: {
      description: 'One sentence · four-number toy vectors',
      fallback: 'Toy vectors · Q = K = V · no language understanding',
      units: {},
      enabled: () => true,
    },
    bounds: { min: [-3.4, -0.35, -3.4], max: [3.4, 3.6, 3.4] },
    framePoints: [
      ...Array.from(
        { length: 16 },
        (_, i): V3 => [
          Math.sin((i / 16) * Math.PI * 2) * 3.4,
          -0.35,
          Math.cos((i / 16) * Math.PI * 2) * 3.4,
        ],
      ),
      [-3, 3.5, -1.5],
      [3, 3.5, -1.5],
    ],
    labelAvoidPoints: Array.from(
      { length: 32 },
      (_, i): V3 => [
        Math.sin((i / 16) * Math.PI * 2) * 3.4,
        i < 16 ? 0 : -0.35,
        Math.cos((i / 16) * Math.PI * 2) * 3.4,
      ],
    ),
    parts: [
      ...tokens.map((word, i) => ({
        id: `token-${i}`,
        name: `“${word}” · word ${i + 1}`,
        chip: 'a-query',
        anchor: () => tokenPosition(i, tokens.length),
        radius: 0.5,
      })),
      {
        id: 'query',
        name: 'The query word',
        chip: 'a-query',
        anchor: q,
        radius: 0.5,
      },
      {
        id: 'tokens',
        name: 'Numbers for words',
        chip: 'a-token',
        anchor: () => [0, 1.2, -0.4],
        radius: 0.7,
      },
      {
        id: 'attention-matrix',
        name: 'Information shares',
        chip: 'a-beams',
        anchor: () => [0, 2.3, -0.8],
        radius: 0.7,
      },
      {
        id: 'weights',
        name: 'A whole share of information',
        chip: 'a-weights',
        anchor: () => [0, 0.25, 1.65],
        radius: 0.65,
      },
      {
        id: 'mask',
        name: 'The causal mask',
        chip: 'a-mask',
        anchor: () => mask,
        radius: 0.35,
      },
      {
        id: 'vectors',
        name: 'Query, key and value',
        chip: 'a-qkv',
        anchor: (s) => {
          const p = q(s);
          return [p[0], p[1] + 0.8, p[2]];
        },
        radius: 0.6,
      },
      {
        id: 'context',
        name: 'The mixed context',
        chip: 'a-context',
        anchor: () => contextPosition,
        radius: 0.48,
      },
      {
        id: 'next-query',
        name: 'Choose another query',
        chip: 'a-query',
        anchor: q,
        radius: 0.5,
      },
      {
        id: 'whole',
        name: 'One tiny attention head',
        chip: 'a-chatgpt',
        anchor: () => [0, 1.2, 0],
        radius: 0.8,
      },
    ],
    labels: [
      {
        id: 'query',
        title: 'Query',
        value: (s) => s.query + 1,
        text: (s) =>
          `“${s.tokens[s.query]}” · ${s.query + 1}/${s.tokens.length}`,
        placement: 'right',
        screenOffset: [0, -65],
      },
      {
        id: 'context',
        title: 'Context',
        value: () => 0,
        text: (s) => vectorText(s.context),
        placement: 'lower',
        opposite: 'query',
        offset: 25,
      },
    ],
    metric: {
      id: 'attention-matrix',
      name: 'Largest share',
      value: (s) => Math.max(...s.row) * 100,
      digits: 1,
      unit: '%',
      status: (s) => `“${s.tokens[s.strongest]}”`,
      formula: (s) =>
        `${s.eligible}/${s.tokens.length} allowed · total ${format(s.rowSum * 100, 1)}%`,
      history: () => [],
      spark: false,
    },
    parameter: {
      id: 'query',
      key: 'query',
      label: 'Query',
      range: (s) => [0, s.tokens.length - 1],
      step: 1,
      value: (s) => s.query,
      choices: (s) =>
        s.tokens.map((word, i) => ({ value: i, label: `${i + 1} · ${word}` })),
      resetFocus: true,
    },
    toggles: [{ key: 'causal', label: 'Causal mask', value: (s) => s.causal }],
    textControls: [
      {
        key: 'tokens',
        label: 'Sentence',
        help: '1–12 words, up to 20 characters each. Unknown words use deterministic toy numbers.',
        value: (s) => s.tokens.join(' '),
        maxLength: 240,
      },
    ],
    readouts: [
      {
        label: 'Eligible',
        value: (s) => `${s.eligible} of ${s.tokens.length}`,
        part: 'mask',
      },
      { label: 'Vectors', value: () => '4 numbers', part: 'vectors' },
      { label: 'Model', value: () => 'Q = K = V', part: 'vectors' },
    ],
    train: {
      id: 'next-query',
      label: 'Next word',
      autoLabel: 'Scan sentence',
      stopLabel: 'Pause scan',
      action: next,
      autoAction: next,
      intervalMs: 1400,
      enabled: (s) => s.tokens.length > 1,
      resetFocus: true,
    },
    solved: () => false,
    equation: ['query', '·', 'key', '÷ √4', '→', 'shares', '→', 'context'],
    chips: [
      {
        id: 'a-query',
        text: 'What is the query?',
        part: 'query',
        answer: () =>
          'The query is the word we are updating. It compares its query numbers with the keys of allowed words. The gold tablet marks that word. Choose another word and the shares change, because we are asking a different question.',
        analogy: 'Like asking the same group a different question.',
        demo: 'query',
        tryLabel: 'Select the first word, then the last word',
      },
      {
        id: 'a-token',
        text: 'Why numbers for words?',
        part: 'tokens',
        answer: () =>
          'A computer needs numbers to do arithmetic. Each word here has four toy numbers, called a vector. Equal words get equal numbers. Unknown words get repeatable made-up numbers, not a learned meaning. Real language models use learned representations and may split words into smaller tokens.',
        analogy:
          'Like giving a book a catalogue code so a system can work with it.',
        demo: 'numbers',
        tryLabel: 'Reveal the four numbers inside the selected word',
      },
      {
        id: 'a-beams',
        text: 'What do the beams mean?',
        part: 'attention-matrix',
        also: ['query', 'context'],
        answer: () =>
          'Each beam carries a share of value information into the query word. A thicker beam means a larger share. Moving lights show information flowing toward the query. A locked word contributes zero. These are computed attention shares, not the learned dial from Neural.',
        analogy: 'Like a recipe: a bigger share adds more of that ingredient.',
        demo: 'beams',
        tryLabel: 'Follow information flowing into the selected word',
      },
      {
        id: 'a-weights',
        text: 'Why do shares add to 100%?',
        part: 'weights',
        answer: (s) =>
          `Softmax turns the allowed matching scores into positive shares that add to 100%. This row totals ${format(s.rowSum * 100, 1)}%. Masked words get zero before the shares are calculated. The shares tell us how to mix information; they are not confidence that the next word is correct.`,
        analogy: 'Like dividing one whole pie among the allowed guests.',
        demo: 'shares',
        tryLabel:
          'Compare the first word’s single share with the last word’s mixture',
      },
      {
        id: 'a-mask',
        text: 'Why hide later words?',
        part: 'mask',
        answer: () =>
          'A next-word model must not peek ahead. The causal mask blocks words after the query, even if their numbers match well. The current word and earlier words remain allowed. For the first word, only itself is allowed, so its share is 100%.',
        analogy: 'Like covering the answer while practising a test.',
        demo: 'mask',
        tryLabel: 'Compare the first word with the mask on, off, then on again',
      },
      {
        id: 'a-qkv',
        text: 'What are Q, K and V?',
        part: 'vectors',
        answer: () =>
          'Q is the query: what we look for. K is a key: what we compare with it. V is the value: information we mix. This tiny model uses the same four numbers for all three. Real transformers learn separate projections for Q, K and V.',
        analogy:
          'Like a search request, catalogue labels and the contents of the books.',
        demo: 'numbers',
        tryLabel: 'Reveal Q, K and V for this toy query',
      },
      {
        id: 'a-context',
        text: 'What is the context?',
        part: 'context',
        answer: (s) =>
          `The context mixes allowed value vectors using their attention shares. Its four numbers are ${vectorText(s.context)}. It changes with the query, sentence or mask. Each bar shows one number. The copper line is zero; negative values extend below it.`,
        analogy: 'Like blending ingredients in the proportions from a recipe.',
        demo: 'context',
        tryLabel: 'Change the query and watch the actual mixed vector change',
      },
      {
        id: 'a-swap',
        text: 'What if cat becomes dog?',
        part: `token-${Math.max(
          0,
          tokens.findIndex(
            (t) => t.toLowerCase() === 'cat' || t.toLowerCase() === 'dog',
          ),
        )}`,
        answer: () =>
          'Changing a word changes its toy numbers. We recompute the matching scores, attention shares and mixed context. The demo replaces only cat with dog in the default sentence. A changed result shows arithmetic changing, not proof that this toy understands cats, dogs or grammar.',
        analogy: 'Like swapping one ingredient: the final mixture can change.',
        demo: 'swap',
        tryLabel: 'Compare cat → dog in the default sentence',
      },
      {
        id: 'a-chatgpt',
        text: 'Is this inside ChatGPT?',
        part: 'whole',
        answer: () =>
          'This shows the attention calculation in miniature. Real transformers use many heads, layers and learned vectors. This toy uses four fixed numbers and Q = K = V. It does not generate language or reveal ChatGPT’s internal weights, and its strongest share is not a grammar explanation.',
        analogy:
          'Like a working model bridge: useful for one idea, smaller than the real thing.',
        demo: 'many',
        tryLabel: 'Reveal three faint attention heads as a visual hint',
      },
    ],
    glossary: {
      query: 'a-query',
      token: 'a-token',
      tokens: 'a-token',
      word: 'a-token',
      vector: 'a-token',
      vectors: 'a-qkv',
      key: 'a-qkv',
      keys: 'a-qkv',
      value: 'a-qkv',
      values: 'a-qkv',
      weights: 'a-beams',
      shares: 'a-weights',
      softmax: 'a-weights',
      mask: 'a-mask',
      causal: 'a-mask',
      context: 'a-context',
      attention: 'a-beams',
    },
    demos: {
      query: [
        {
          delay: 0,
          action: () => ({
            tool: 'sim_set_params',
            args: { patch: { query: 0 } },
          }),
        },
        {
          delay: 1700,
          action: (s) => ({
            tool: 'sim_set_params',
            args: { patch: { query: s.tokens.length - 1 } },
          }),
        },
      ],
      numbers: [
        {
          delay: 0,
          focus: 'vectors',
          highlight: 'Four toy numbers · Q = K = V',
        },
      ],
      beams: [
        {
          delay: 0,
          highlight: 'Value information flows toward the gold query',
        },
      ],
      shares: [
        {
          delay: 0,
          action: () => ({
            tool: 'sim_set_params',
            args: { patch: { query: 0, causal: true } },
          }),
          message: () => 'One allowed word · 100% to itself',
        },
        {
          delay: 1800,
          action: (s) => ({
            tool: 'sim_set_params',
            args: { patch: { query: s.tokens.length - 1 } },
          }),
          message: () => 'All words allowed · one normalized mixture',
        },
      ],
      mask: [
        {
          delay: 0,
          action: () => ({
            tool: 'sim_set_params',
            args: { patch: { query: 0, causal: true } },
          }),
          focus: null,
          closeCard: true,
          message: () => 'First word · mask on · later words contribute zero',
        },
        {
          delay: 1800,
          action: () => ({
            tool: 'sim_set_params',
            args: { patch: { causal: false } },
          }),
          message: () => 'Mask off · later words become eligible',
        },
        {
          delay: 3600,
          action: () => ({
            tool: 'sim_set_params',
            args: { patch: { causal: true } },
          }),
          message: () => 'Mask on · future information blocked again',
        },
      ],
      context: [
        {
          delay: 0,
          action: () => ({
            tool: 'sim_set_params',
            args: { patch: { query: 0 } },
          }),
        },
        {
          delay: 1600,
          action: (s) => ({
            tool: 'sim_set_params',
            args: { patch: { query: s.tokens.length - 1 } },
          }),
        },
      ],
      swap: [
        {
          delay: 0,
          action: () => ({ tool: 'sim_restore', args: { snapshot: example } }),
          focus: null,
          closeCard: true,
          message: () => 'Default sentence · cat',
        },
        {
          delay: 1800,
          action: () => ({
            tool: 'sim_set_params',
            args: { patch: { tokens: 'the dog chased the ball' } },
          }),
          message: () => 'Only cat → dog changed · every share recomputed',
        },
      ],
      many: [
        {
          delay: 0,
          highlight:
            'Many learned heads in a real transformer · this toy computes one',
        },
      ],
    },
    shots: [
      {
        part: 'whole',
        target: () => [0, 1.3, 0],
        distance: 18,
        azimuth: 0.12,
        polar: 1.08,
      },
      ...tokens.map((_, i) => ({
        part: `token-${i}`,
        target: (): V3 => tokenPosition(i, tokens.length),
        distance: 8,
        azimuth: 0.12,
        polar: 1.12,
        phoneDistance: 18,
      })),
      {
        part: 'query',
        target: q,
        distance: 9,
        azimuth: 0.12,
        polar: 1.1,
        phoneDistance: 19,
      },
      {
        part: 'tokens',
        target: () => [0, 1.25, -0.4],
        distance: 13,
        azimuth: 0.08,
        polar: 1.08,
        phoneDistance: 25,
      },
      {
        part: 'attention-matrix',
        target: () => [0, 2.25, -0.8],
        distance: 13,
        azimuth: 0.08,
        polar: 1.12,
        phoneDistance: 23,
      },
      {
        part: 'weights',
        target: () => [0, 0.4, 1.65],
        distance: 8,
        azimuth: 0.15,
        polar: 0.85,
        phoneDistance: 18,
      },
      {
        part: 'mask',
        target: () => mask,
        distance: 7,
        azimuth: 0.12,
        polar: 1.1,
        phoneDistance: 16,
      },
      {
        part: 'vectors',
        target: (s) => {
          const p = q(s);
          return [p[0], p[1] + 0.65, p[2]];
        },
        distance: 10,
        azimuth: 0.12,
        polar: 1.1,
        phoneDistance: 21,
      },
      {
        part: 'context',
        target: () => contextPosition,
        distance: 8,
        azimuth: 0.12,
        polar: 1.08,
        phoneDistance: 18,
      },
      {
        part: 'next-query',
        target: q,
        distance: 9,
        azimuth: 0.12,
        polar: 1.1,
        phoneDistance: 19,
      },
    ],
  });
}
