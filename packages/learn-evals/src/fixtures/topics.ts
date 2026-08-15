import type { TopicProfileV1 } from '@edrion/schemas';

export type EvalTopicFixture = {
  key: string;
  title: string;
  /** Canonical four used for pairwise-distinct sequence AC. */
  canonical?: boolean;
  profile: TopicProfileV1;
  answers: { correct: string[]; incorrect: string[] };
};

function p(partial: TopicProfileV1): TopicProfileV1 {
  return partial;
}

/**
 * 30 frozen topics — hyperspec 3 §1.2 coverage:
 * every knowledge_type ≥ 6, every native_representation ≥ 4,
 * ≥ 8 high prerequisite_density, ≥ 6 high misconception_richness, ≥ 5 heavy math_load.
 */
export const TOPIC_FIXTURES: EvalTopicFixture[] = [
  // —— Canonical four ——
  {
    key: 'topic:integration-by-parts',
    title: 'Integration by parts',
    canonical: true,
    profile: p({
      knowledge_type: ['procedural'],
      abstraction: 'abstract',
      native_representation: 'symbolic',
      prerequisite_density: 'high',
      prerequisites: [
        { atom_id: null, label: 'Product rule' },
        { atom_id: null, label: 'Indefinite integrals' },
      ],
      misconception_richness: 'high',
      known_misconceptions: ['Dropping the +C', 'Swapping u and dv arbitrarily'],
      math_load: 'heavy',
      memorization_load: 'light',
      real_world_anchors: ['Physics work integrals'],
    }),
    answers: {
      correct: ['∫u dv = uv − ∫v du', 'Choose u that simplifies when differentiated'],
      incorrect: ['∫u dv = uv + ∫v du', 'Always pick the polynomial as dv'],
    },
  },
  {
    key: 'topic:photosynthesis',
    title: 'Photosynthesis',
    canonical: true,
    profile: p({
      knowledge_type: ['conceptual'],
      abstraction: 'mixed',
      native_representation: 'visual_spatial',
      prerequisite_density: 'medium',
      prerequisites: [{ atom_id: null, label: 'Cell organelles' }],
      misconception_richness: 'high',
      known_misconceptions: ['Plants only respire at night', 'Glucose is made in the light reactions'],
      math_load: 'none',
      memorization_load: 'heavy',
      real_world_anchors: ['Greenhouse growth'],
    }),
    answers: {
      correct: ['Light reactions capture energy; Calvin cycle builds sugars', 'Chloroplasts'],
      incorrect: ['Mitochondria make sugar from light', 'Only happens at night'],
    },
  },
  {
    key: 'topic:french-revolution',
    title: 'French Revolution causes',
    canonical: true,
    profile: p({
      knowledge_type: ['conceptual', 'factual'],
      abstraction: 'mixed',
      native_representation: 'temporal_sequence',
      prerequisite_density: 'medium',
      prerequisites: [{ atom_id: null, label: 'Ancien Régime estates' }],
      misconception_richness: 'medium',
      known_misconceptions: ['It was only about bread prices'],
      math_load: 'none',
      memorization_load: 'heavy',
      real_world_anchors: ['Modern constitutional crises'],
    }),
    answers: {
      correct: ['Fiscal crisis, inequality, and Enlightenment ideas combined', 'Estates-General deadlock'],
      incorrect: ['Napoleon caused it', 'It started in 1815'],
    },
  },
  {
    key: 'topic:python-for-loops',
    title: 'Python for-loops',
    canonical: true,
    profile: p({
      knowledge_type: ['procedural', 'skill'],
      abstraction: 'concrete',
      native_representation: 'symbolic',
      prerequisite_density: 'low',
      prerequisites: [{ atom_id: null, label: 'Sequences / lists' }],
      misconception_richness: 'medium',
      known_misconceptions: ['range(n) includes n'],
      math_load: 'light',
      memorization_load: 'light',
      real_world_anchors: ['Batching file renames'],
    }),
    answers: {
      correct: ['for x in iterable:', 'range(3) yields 0,1,2'],
      incorrect: ['foreach (x in list)', 'range(3) yields 1,2,3'],
    },
  },

  // —— Remaining 26 ——
  {
    key: 'topic:ohm-law',
    title: "Ohm's law",
    profile: p({
      knowledge_type: ['procedural', 'factual'],
      abstraction: 'concrete',
      native_representation: 'symbolic',
      prerequisite_density: 'high',
      prerequisites: [{ atom_id: null, label: 'Current and voltage' }],
      misconception_richness: 'high',
      known_misconceptions: ['V = I/R'],
      math_load: 'heavy',
      memorization_load: 'light',
      real_world_anchors: ['Household circuits'],
    }),
    answers: { correct: ['V = IR'], incorrect: ['V = I/R'] },
  },
  {
    key: 'topic:quadratic-formula',
    title: 'Quadratic formula',
    profile: p({
      knowledge_type: ['procedural'],
      abstraction: 'abstract',
      native_representation: 'symbolic',
      prerequisite_density: 'high',
      prerequisites: [{ atom_id: null, label: 'Expanding brackets' }],
      misconception_richness: 'medium',
      known_misconceptions: ['Forgetting ±'],
      math_load: 'heavy',
      memorization_load: 'heavy',
      real_world_anchors: ['Projectile motion'],
    }),
    answers: { correct: ['x = (−b ± √(b²−4ac))/(2a)'], incorrect: ['x = (−b ± √(b²+4ac))/(2a)'] },
  },
  {
    key: 'topic:mitosis-stages',
    title: 'Mitosis stages',
    profile: p({
      knowledge_type: ['factual'],
      abstraction: 'concrete',
      native_representation: 'temporal_sequence',
      prerequisite_density: 'medium',
      prerequisites: [{ atom_id: null, label: 'Chromosomes' }],
      misconception_richness: 'high',
      known_misconceptions: ['Mitosis produces gametes'],
      math_load: 'none',
      memorization_load: 'heavy',
      real_world_anchors: ['Wound healing'],
    }),
    answers: { correct: ['PMAT — prophase, metaphase, anaphase, telophase'], incorrect: ['Only two stages'] },
  },
  {
    key: 'topic:supply-demand',
    title: 'Supply and demand',
    profile: p({
      knowledge_type: ['conceptual'],
      abstraction: 'mixed',
      native_representation: 'comparative_table',
      prerequisite_density: 'low',
      prerequisites: [],
      misconception_richness: 'medium',
      known_misconceptions: ['Price floors always help buyers'],
      math_load: 'light',
      memorization_load: 'light',
      real_world_anchors: ['Concert ticket scalping'],
    }),
    answers: { correct: ['Equilibrium where supply meets demand'], incorrect: ['Higher price always increases demand'] },
  },
  {
    key: 'topic:stoichiometry',
    title: 'Stoichiometry mole ratios',
    profile: p({
      knowledge_type: ['procedural'],
      abstraction: 'mixed',
      native_representation: 'symbolic',
      prerequisite_density: 'high',
      prerequisites: [{ atom_id: null, label: 'Balancing equations' }],
      misconception_richness: 'high',
      known_misconceptions: ['Grams equal moles'],
      math_load: 'heavy',
      memorization_load: 'light',
      real_world_anchors: ['Pharmacy dosing'],
    }),
    answers: { correct: ['Use mole ratios from the balanced equation'], incorrect: ['Multiply masses directly'] },
  },
  {
    key: 'topic:essay-thesis',
    title: 'Thesis statements',
    profile: p({
      knowledge_type: ['skill'],
      abstraction: 'abstract',
      native_representation: 'verbal',
      prerequisite_density: 'low',
      prerequisites: [],
      misconception_richness: 'low',
      known_misconceptions: ['A thesis is a topic title'],
      math_load: 'none',
      memorization_load: 'light',
      real_world_anchors: ['Op-eds'],
    }),
    answers: { correct: ['A claim that can be argued with evidence'], incorrect: ['A list of topics'] },
  },
  {
    key: 'topic:binary-search',
    title: 'Binary search',
    profile: p({
      knowledge_type: ['procedural', 'skill'],
      abstraction: 'abstract',
      native_representation: 'temporal_sequence',
      prerequisite_density: 'high',
      prerequisites: [{ atom_id: null, label: 'Sorted arrays' }],
      misconception_richness: 'medium',
      known_misconceptions: ['Works on unsorted lists'],
      math_load: 'light',
      memorization_load: 'light',
      real_world_anchors: ['Dictionary lookup'],
    }),
    answers: { correct: ['Halve the search space each step on a sorted list'], incorrect: ['Scan every element'] },
  },
  {
    key: 'topic:periodic-trends',
    title: 'Periodic table trends',
    profile: p({
      knowledge_type: ['factual', 'conceptual'],
      abstraction: 'mixed',
      native_representation: 'comparative_table',
      prerequisite_density: 'medium',
      prerequisites: [{ atom_id: null, label: 'Atomic structure' }],
      misconception_richness: 'high',
      known_misconceptions: ['Atomic radius increases across a period'],
      math_load: 'none',
      memorization_load: 'heavy',
      real_world_anchors: ['Metal reactivity'],
    }),
    answers: { correct: ['Electronegativity rises across a period'], incorrect: ['Noble gases are the most reactive'] },
  },
  {
    key: 'topic:ww1-causes',
    title: 'Causes of World War I',
    profile: p({
      knowledge_type: ['factual'],
      abstraction: 'mixed',
      native_representation: 'temporal_sequence',
      prerequisite_density: 'medium',
      prerequisites: [],
      misconception_richness: 'medium',
      known_misconceptions: ['Only the assassination caused it'],
      math_load: 'none',
      memorization_load: 'heavy',
      real_world_anchors: ['Alliance politics today'],
    }),
    answers: { correct: ['Militarism, alliances, imperialism, nationalism'], incorrect: ['It began in 1939'] },
  },
  {
    key: 'topic:sql-joins',
    title: 'SQL joins',
    profile: p({
      knowledge_type: ['skill', 'procedural'],
      abstraction: 'concrete',
      native_representation: 'comparative_table',
      prerequisite_density: 'high',
      prerequisites: [{ atom_id: null, label: 'Primary keys' }],
      misconception_richness: 'high',
      known_misconceptions: ['INNER JOIN keeps unmatched rows'],
      math_load: 'none',
      memorization_load: 'light',
      real_world_anchors: ['CRM reports'],
    }),
    answers: { correct: ['INNER JOIN returns matching rows only'], incorrect: ['JOIN always duplicates every row'] },
  },
  {
    key: 'topic:newton-2',
    title: "Newton's second law",
    profile: p({
      knowledge_type: ['conceptual', 'procedural'],
      abstraction: 'mixed',
      native_representation: 'symbolic',
      prerequisite_density: 'high',
      prerequisites: [{ atom_id: null, label: 'Vectors' }],
      misconception_richness: 'high',
      known_misconceptions: ['Heavier objects fall faster in vacuum'],
      math_load: 'heavy',
      memorization_load: 'light',
      real_world_anchors: ['Seatbelt forces'],
    }),
    answers: { correct: ['F = ma'], incorrect: ['F = mv'] },
  },
  {
    key: 'topic:meiosis',
    title: 'Meiosis vs mitosis',
    profile: p({
      knowledge_type: ['conceptual'],
      abstraction: 'mixed',
      native_representation: 'comparative_table',
      prerequisite_density: 'high',
      prerequisites: [{ atom_id: null, label: 'Mitosis stages' }],
      misconception_richness: 'high',
      known_misconceptions: ['Meiosis makes identical body cells'],
      math_load: 'none',
      memorization_load: 'heavy',
      real_world_anchors: ['Genetic diversity'],
    }),
    answers: { correct: ['Meiosis produces haploid gametes'], incorrect: ['Meiosis has one division'] },
  },
  {
    key: 'topic:literary-irony',
    title: 'Types of irony',
    profile: p({
      knowledge_type: ['conceptual'],
      abstraction: 'abstract',
      native_representation: 'verbal',
      prerequisite_density: 'low',
      prerequisites: [],
      misconception_richness: 'medium',
      known_misconceptions: ['Irony means coincidence'],
      math_load: 'none',
      memorization_load: 'light',
      real_world_anchors: ['Satire'],
    }),
    answers: { correct: ['Dramatic irony: audience knows what characters do not'], incorrect: ['Irony is always sarcasm'] },
  },
  {
    key: 'topic:derivatives-power',
    title: 'Power rule derivatives',
    profile: p({
      knowledge_type: ['procedural'],
      abstraction: 'abstract',
      native_representation: 'symbolic',
      prerequisite_density: 'high',
      prerequisites: [{ atom_id: null, label: 'Limits intuition' }],
      misconception_richness: 'medium',
      known_misconceptions: ['Derivative of x² is 2x²'],
      math_load: 'heavy',
      memorization_load: 'light',
      real_world_anchors: ['Instantaneous speed'],
    }),
    answers: { correct: ['d/dx xⁿ = n xⁿ⁻¹'], incorrect: ['d/dx xⁿ = xⁿ⁺¹'] },
  },
  {
    key: 'topic:plate-tectonics',
    title: 'Plate tectonics',
    profile: p({
      knowledge_type: ['conceptual', 'factual'],
      abstraction: 'concrete',
      native_representation: 'visual_spatial',
      prerequisite_density: 'medium',
      prerequisites: [],
      misconception_richness: 'medium',
      known_misconceptions: ['Continents float on open water'],
      math_load: 'none',
      memorization_load: 'heavy',
      real_world_anchors: ['Earthquakes'],
    }),
    answers: { correct: ['Plates move on the asthenosphere'], incorrect: ['Earth is hollow'] },
  },
  {
    key: 'topic:probability-independent',
    title: 'Independent events',
    profile: p({
      knowledge_type: ['procedural', 'conceptual'],
      abstraction: 'abstract',
      native_representation: 'symbolic',
      prerequisite_density: 'medium',
      prerequisites: [{ atom_id: null, label: 'Basic probability' }],
      misconception_richness: 'high',
      known_misconceptions: ['Gambler fallacy'],
      math_load: 'heavy',
      memorization_load: 'light',
      real_world_anchors: ['Dice games'],
    }),
    answers: { correct: ['P(A and B) = P(A)P(B) when independent'], incorrect: ['Always add probabilities'] },
  },
  {
    key: 'topic:cell-membrane',
    title: 'Cell membrane transport',
    profile: p({
      knowledge_type: ['conceptual'],
      abstraction: 'mixed',
      native_representation: 'visual_spatial',
      prerequisite_density: 'medium',
      prerequisites: [{ atom_id: null, label: 'Diffusion' }],
      misconception_richness: 'medium',
      known_misconceptions: ['Active transport needs no energy'],
      math_load: 'none',
      memorization_load: 'heavy',
      real_world_anchors: ['Kidney dialysis'],
    }),
    answers: { correct: ['Active transport moves against the gradient using ATP'], incorrect: ['Osmosis requires ATP'] },
  },
  {
    key: 'topic:git-branching',
    title: 'Git branching',
    profile: p({
      knowledge_type: ['skill'],
      abstraction: 'concrete',
      native_representation: 'temporal_sequence',
      prerequisite_density: 'low',
      prerequisites: [{ atom_id: null, label: 'Commits' }],
      misconception_richness: 'medium',
      known_misconceptions: ['Merge deletes history'],
      math_load: 'none',
      memorization_load: 'light',
      real_world_anchors: ['Team feature work'],
    }),
    answers: { correct: ['Branches diverge then merge commit histories'], incorrect: ['Branch means copy the whole disk'] },
  },
  {
    key: 'topic:acid-base',
    title: 'Acids and bases',
    profile: p({
      knowledge_type: ['factual', 'conceptual'],
      abstraction: 'mixed',
      native_representation: 'comparative_table',
      prerequisite_density: 'medium',
      prerequisites: [{ atom_id: null, label: 'pH scale' }],
      misconception_richness: 'high',
      known_misconceptions: ['All acids are strong'],
      math_load: 'light',
      memorization_load: 'heavy',
      real_world_anchors: ['Antacids'],
    }),
    answers: { correct: ['Acids donate H⁺ (Brønsted)'], incorrect: ['pH 14 is strongly acidic'] },
  },
  {
    key: 'topic:rhetoric-ethos',
    title: 'Ethos pathos logos',
    profile: p({
      knowledge_type: ['conceptual'],
      abstraction: 'abstract',
      native_representation: 'verbal',
      prerequisite_density: 'low',
      prerequisites: [],
      misconception_richness: 'low',
      known_misconceptions: ['Pathos is always manipulative'],
      math_load: 'none',
      memorization_load: 'light',
      real_world_anchors: ['Speeches'],
    }),
    answers: { correct: ['Ethos is credibility of the speaker'], incorrect: ['Logos means emotion'] },
  },
  {
    key: 'topic:recursion-base',
    title: 'Recursion base cases',
    profile: p({
      knowledge_type: ['skill', 'procedural'],
      abstraction: 'abstract',
      native_representation: 'symbolic',
      prerequisite_density: 'high',
      prerequisites: [{ atom_id: null, label: 'Functions' }],
      misconception_richness: 'high',
      known_misconceptions: ['Recursion never needs a base case'],
      math_load: 'light',
      memorization_load: 'light',
      real_world_anchors: ['Directory tree walks'],
    }),
    answers: { correct: ['Base case stops infinite recursion'], incorrect: ['Recursion always uses a for-loop'] },
  },
  {
    key: 'topic:cold-war',
    title: 'Cold War origins',
    profile: p({
      knowledge_type: ['factual'],
      abstraction: 'mixed',
      native_representation: 'temporal_sequence',
      prerequisite_density: 'medium',
      prerequisites: [],
      misconception_richness: 'medium',
      known_misconceptions: ['It was a direct US–USSR land war'],
      math_load: 'none',
      memorization_load: 'heavy',
      real_world_anchors: ['Proxy conflicts'],
    }),
    answers: { correct: ['Ideological rivalry after WWII without direct great-power war'], incorrect: ['Started in 1914'] },
  },
  {
    key: 'topic:enzyme-kinetics',
    title: 'Enzyme kinetics basics',
    profile: p({
      knowledge_type: ['conceptual', 'procedural'],
      abstraction: 'mixed',
      native_representation: 'visual_spatial',
      prerequisite_density: 'high',
      prerequisites: [{ atom_id: null, label: 'Proteins' }],
      misconception_richness: 'medium',
      known_misconceptions: ['Enzymes are consumed in reactions'],
      math_load: 'heavy',
      memorization_load: 'light',
      real_world_anchors: ['Digestion'],
    }),
    answers: { correct: ['Enzymes lower activation energy and are reusable'], incorrect: ['Heat always speeds enzymes forever'] },
  },
  {
    key: 'topic:map-projections',
    title: 'Map projections',
    profile: p({
      knowledge_type: ['conceptual'],
      abstraction: 'concrete',
      native_representation: 'visual_spatial',
      prerequisite_density: 'low',
      prerequisites: [],
      misconception_richness: 'medium',
      known_misconceptions: ['Mercator shows true area'],
      math_load: 'light',
      memorization_load: 'light',
      real_world_anchors: ['Navigation apps'],
    }),
    answers: { correct: ['Every flat map distorts some property of the globe'], incorrect: ['Mercator preserves area perfectly'] },
  },
  {
    key: 'topic:citation-styles',
    title: 'Citation styles',
    profile: p({
      knowledge_type: ['skill', 'factual'],
      abstraction: 'concrete',
      native_representation: 'verbal',
      prerequisite_density: 'low',
      prerequisites: [],
      misconception_richness: 'low',
      known_misconceptions: ['URL alone is enough'],
      math_load: 'none',
      memorization_load: 'heavy',
      real_world_anchors: ['Research papers'],
    }),
    answers: { correct: ['APA and MLA format author/year differently'], incorrect: ['Citations are optional if you paraphrase'] },
  },
  {
    key: 'topic:boolean-algebra',
    title: 'Boolean algebra',
    profile: p({
      knowledge_type: ['procedural', 'skill'],
      abstraction: 'abstract',
      native_representation: 'symbolic',
      prerequisite_density: 'medium',
      prerequisites: [{ atom_id: null, label: 'Logic gates intuition' }],
      misconception_richness: 'medium',
      known_misconceptions: ['OR is the same as XOR'],
      math_load: 'heavy',
      memorization_load: 'light',
      real_world_anchors: ['Circuit design'],
    }),
    answers: { correct: ['A AND 0 = 0'], incorrect: ['A OR 1 = 0'] },
  },
];

export const CANONICAL_TOPIC_KEYS = TOPIC_FIXTURES.filter((t) => t.canonical).map((t) => t.key);

export const PERSONAS = [
  'fast_confident',
  'slow_careful',
  'confidently_wrong',
  'disengaged_skipping',
  'weak_prerequisites',
  'relevant_detour',
  'unsure_but_correct',
  'repeated_struggle',
] as const;

export type EvalPersona = (typeof PERSONAS)[number];

/** Assert §1.2 coverage at module load — fail loud if fixtures drift. */
export function assertTopicCoverage(topics: EvalTopicFixture[] = TOPIC_FIXTURES): void {
  if (topics.length !== 30) throw new Error(`Expected 30 topics, got ${topics.length}`);
  const kt = (k: string) => topics.filter((t) => t.profile.knowledge_type.includes(k as never)).length;
  for (const k of ['conceptual', 'procedural', 'factual', 'skill'] as const) {
    if (kt(k) < 6) throw new Error(`knowledge_type ${k} has ${kt(k)} (<6)`);
  }
  const nr = (k: string) => topics.filter((t) => t.profile.native_representation === k).length;
  for (const k of [
    'visual_spatial',
    'symbolic',
    'verbal',
    'temporal_sequence',
    'comparative_table',
  ] as const) {
    if (nr(k) < 4) throw new Error(`native_representation ${k} has ${nr(k)} (<4)`);
  }
  if (topics.filter((t) => t.profile.prerequisite_density === 'high').length < 8) {
    throw new Error('need ≥8 high prerequisite_density');
  }
  if (topics.filter((t) => t.profile.misconception_richness === 'high').length < 6) {
    throw new Error('need ≥6 high misconception_richness');
  }
  if (topics.filter((t) => t.profile.math_load === 'heavy').length < 5) {
    throw new Error('need ≥5 heavy math_load');
  }
}
