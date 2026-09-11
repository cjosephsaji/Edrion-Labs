import { z } from 'zod';

export const PETROS_INFLATION_PILOT = 'inflation-stage-v1' as const;
export const petrosPilotSceneIdSchema = z.enum([
  'basket',
  'definition',
  'demand',
  'costs',
  'consequences',
  'transfer',
]);
export type PetrosPilotSceneId = z.infer<typeof petrosPilotSceneIdSchema>;

/** Authored, student-visible teaching material. Assessment rubrics stay on the server. */
export const petrosPilotSceneSchema = z
  .object({
    type: z.literal('teaching_stage'),
    id: petrosPilotSceneIdSchema,
    eyebrow: z.string(),
    title: z.string(),
    introduction: z.string(),
    explanation: z.string(),
    question: z.string(),
    hint: z.string(),
    example: z.string(),
    target: z.enum(['left', 'center', 'right']),
    responseType: z.enum(['choice', 'explanation']),
    choices: z.array(z.object({ id: z.string(), label: z.string() })),
  })
  .strict();
export type PetrosPilotScene = z.infer<typeof petrosPilotSceneSchema>;

export const PETROS_PILOT_SCENES: PetrosPilotScene[] = [
  {
    type: 'teaching_stage',
    id: 'basket',
    eyebrow: 'A familiar puzzle',
    title: 'Same basket. More money.',
    introduction:
      'Yesterday’s budget does not always buy today’s basket. But does every price increase mean inflation?',
    explanation:
      'Inflation is an increase in the general price level over time. A single item can become expensive because of a local shortage, even when most other prices stay the same.',
    question:
      'Only tomatoes become more expensive. Everything else stays the same. Does this alone establish inflation?',
    responseType: 'choice',
    choices: [
      { id: 'yes', label: 'Yes — any price increase is inflation' },
      {
        id: 'no',
        label: 'No — we need evidence about the general price level',
      },
    ],
    hint: 'Look beyond one price. What would you need to know about other goods and services?',
    example:
      'A failed tomato harvest can raise tomato prices while clothing, transport and other food prices remain unchanged. That one price cannot establish a broad price-level rise.',
    target: 'left',
  },
  {
    type: 'teaching_stage',
    id: 'definition',
    eyebrow: 'Make the idea precise',
    title: 'Look at the whole basket.',
    introduction:
      'Now several prices change together. Compare the same quantities at two points in time.',
    explanation:
      'In this simplified basket, the total rises from ₹100 to ₹110: a 10% increase. The same ₹100 buys less of this basket. Real price indices cover many goods and services, with weights that reflect spending.',
    question:
      'Explain why a broad rise in prices reduces the purchasing power of money when your income stays unchanged.',
    responseType: 'explanation',
    choices: [],
    hint: 'Keep the amount of money fixed. What happens to how much it can buy?',
    example:
      'If your budget remains ₹100 but the same basket now costs ₹110, you must buy less or find another ₹10. Your money has less purchasing power.',
    target: 'right',
  },
  {
    type: 'teaching_stage',
    id: 'demand',
    eyebrow: 'Investigate a cause',
    title: 'More buyers. Same supply.',
    introduction:
      'Predict what happens when spending demand grows faster than the available supply. Then try the demand control.',
    explanation:
      'When aggregate demand grows faster than the economy can supply goods and services, it can put upward pressure on the general price level. This is demand-pull inflation. Our small market illustrates the mechanism; a single market alone does not establish economy-wide inflation.',
    question:
      'Demand rises across the economy while productive capacity cannot keep up. Which price pressure would you expect?',
    responseType: 'choice',
    choices: [
      { id: 'up', label: 'Upward pressure on prices' },
      { id: 'down', label: 'Downward pressure on prices' },
      { id: 'none', label: 'No pressure because supply did not change' },
    ],
    hint: 'More spending is competing for goods and services whose supply has not kept up.',
    example:
      'Households and firms increase spending, but factories and services are already near capacity. Competition for limited output can push prices upward.',
    target: 'left',
  },
  {
    type: 'teaching_stage',
    id: 'costs',
    eyebrow: 'Compare the mechanism',
    title: 'Same buyers. Higher costs.',
    introduction:
      'This time demand stays steady. Raise energy costs and follow the pressure from production to selling prices.',
    explanation:
      'Higher production costs, such as energy or imported inputs, can reduce aggregate supply and put upward pressure on prices. This is cost-push inflation. Firms may absorb some costs; the amount passed through depends on conditions.',
    question:
      'Energy becomes more expensive across many industries while demand stays steady. Explain how this can raise prices, and how it differs from demand-pull inflation.',
    responseType: 'explanation',
    choices: [],
    hint: 'Start with the producer’s costs. Compare that starting point with an increase in spending demand.',
    example:
      'Higher fuel costs make transport and production more expensive. Firms may raise selling prices or reduce output. The pressure starts with costs and supply, rather than an increase in demand.',
    target: 'right',
  },
  {
    type: 'teaching_stage',
    id: 'consequences',
    eyebrow: 'Who feels the change?',
    title: 'The same rise. Different effects.',
    introduction:
      'Hold a salary fixed while prices rise. Then compare fixed-rate debt and the pace of price increases.',
    explanation:
      'If income grows more slowly than prices, purchasing power falls. Unexpected inflation can benefit borrowers with fixed nominal repayments and hurt lenders in real terms, other things equal. If inflation falls from 10% to 5%, prices are still rising — just more slowly.',
    question:
      'A price index rises from 100 to 110, then to 115.5. What happened in the second year?',
    responseType: 'choice',
    choices: [
      { id: 'slower', label: 'Prices rose by 5%; inflation slowed' },
      { id: 'fell', label: 'Prices fell because inflation fell' },
      { id: 'faster', label: 'Prices rose by 15.5% in the second year' },
    ],
    hint: 'Compare 115.5 with 110, not with the original 100.',
    example:
      'The second-year increase is 5.5 ÷ 110 = 5%. The price level is higher even though its growth rate is lower. Falling inflation is not the same as falling prices.',
    target: 'right',
  },
  {
    type: 'teaching_stage',
    id: 'transfer',
    eyebrow: 'Use it somewhere new',
    title: 'Tell the story behind the prices.',
    introduction:
      'Bring the ideas together. Choose a connection to inspect, then explain a new situation without a worked answer.',
    explanation:
      'A relationship map is a way to explain mechanisms: demand or costs can put pressure on prices, and higher prices change purchasing power. Different causes can operate together.',
    question:
      'Imported energy becomes more expensive, households keep spending the same amount, and salaries stay fixed. Explain a possible cause of broad price rises and the effect on purchasing power. If inflation later slows but stays positive, do prices return to their old level?',
    responseType: 'explanation',
    choices: [],
    hint: 'Trace energy costs → production → prices → what a fixed salary buys. Then distinguish the price level from its rate of growth.',
    example:
      'In a different case, a spending boom meets limited capacity: demand-pull pressure can raise prices. If salaries lag, purchasing power falls. A lower positive inflation rate still means prices are increasing.',
    target: 'center',
  },
];

export const petrosPilotAttemptSchema = z
  .object({
    answer: z.string(),
    correctness: z.enum(['correct', 'partial', 'incorrect', 'invalid']),
    feedback: z.string(),
    hint: z.string(),
    supported: z.boolean(),
    at: z.string().datetime(),
  })
  .strict();
export const petrosPilotSceneProgressSchema = z
  .object({
    draft: z.string().max(4000).default(''),
    value: z.number().int().min(0).max(2).default(0),
    help: z.enum(['none', 'hint', 'example']).default('none'),
    outcome: z
      .enum(['unseen', 'unresolved', 'independent', 'supported'])
      .default('unseen'),
    attempts: z.array(petrosPilotAttemptSchema).max(60).default([]),
    question: z.string().default(''),
    reply: z.string().default(''),
  })
  .strict();
export const petrosPilotStateSchema = z
  .object({
    experience: z.literal(PETROS_INFLATION_PILOT),
    scene: z.number().int().min(0).max(5),
    unlocked: z.number().int().min(0).max(5),
    mode: z.enum(['voice', 'text']).nullable(),
    finished: z.boolean(),
    scenes: z.record(petrosPilotSceneIdSchema, petrosPilotSceneProgressSchema),
    /** Server-owned deduplication ledger; clients cannot write state directly. */
    commands: z.array(z.string().uuid()).max(2000),
  })
  .strict();
export type PetrosPilotState = z.infer<typeof petrosPilotStateSchema>;

const actionBase = {
  idempotencyKey: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
};
export const petrosPilotActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      ...actionBase,
      action: z.literal('save'),
      scene: petrosPilotSceneIdSchema,
      draft: z.string().max(4000),
      value: z.number().int().min(0).max(2),
    })
    .strict(),
  z
    .object({
      ...actionBase,
      action: z.literal('mode'),
      mode: z.enum(['voice', 'text']),
    })
    .strict(),
  z
    .object({
      ...actionBase,
      action: z.literal('help'),
      kind: z.enum(['hint', 'example']),
    })
    .strict(),
  z
    .object({
      ...actionBase,
      action: z.literal('answer'),
      answer: z.string().trim().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      ...actionBase,
      action: z.literal('ask'),
      question: z.string().trim().min(2).max(2000),
    })
    .strict(),
  z
    .object({
      ...actionBase,
      action: z.literal('navigate'),
      scene: z.number().int().min(0).max(5),
    })
    .strict(),
  z
    .object({ ...actionBase, action: z.literal('advance'), skip: z.boolean() })
    .strict(),
]);
export type PetrosPilotAction = z.infer<typeof petrosPilotActionSchema>;
