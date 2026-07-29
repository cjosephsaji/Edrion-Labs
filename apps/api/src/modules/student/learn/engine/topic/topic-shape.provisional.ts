import type { TopicShapeV1 } from '@edrion/schemas';
import { topicShapeV1Schema } from '@edrion/schemas';

type Draft = {
  kind: TopicShapeV1['kind'];
  subject_family: TopicShapeV1['subject_family'];
  wants_to_be: TopicShapeV1['wants_to_be'];
  has_decision_point: boolean;
  contested: boolean;
  math_load: TopicShapeV1['math_load'];
  misconceptions: TopicShapeV1['misconceptions'];
  spine: TopicShapeV1['spine'];
  canonical_examples: TopicShapeV1['canonical_examples'];
};

function emptyDraft(): Draft {
  return {
    kind: 'concept',
    subject_family: 'general',
    wants_to_be: ['diagram_spatial'],
    has_decision_point: false,
    contested: false,
    math_load: 'none',
    misconceptions: [],
    spine: [],
    canonical_examples: [],
  };
}

function mathGraphs(): Draft {
  return {
    kind: 'procedure',
    subject_family: 'mathematics',
    wants_to_be: ['symbolic_algebraic', 'worked_procedure', 'diagram_spatial'],
    has_decision_point: false,
    contested: false,
    math_load: 'heavy',
    spine: [
      {
        label: 'Where the graph sits',
        gist: 'A graph is the set of points (x, f(x)). Position can change without changing shape — that is what a shift means.',
        depends_on: [],
      },
      {
        label: 'What shifting does',
        gist: 'Vertical shifts add outside the function (change outputs). Horizontal shifts alter the input (change which x maps where).',
        depends_on: [0],
      },
      {
        label: 'Reading a transformation backwards',
        gist: 'From a moved graph, recover the transformation: ask what was done to outputs vs inputs.',
        depends_on: [1],
      },
      {
        label: 'A harder case',
        gist: 'Combine a vertical and horizontal shift and predict the vertex without plotting every point.',
        depends_on: [2],
      },
    ],
    canonical_examples: [
      { setup: 'Shift f(x)=x² so the vertex sits at (0,3).', punchline: 'f(x)=x²+3' },
    ],
    misconceptions: [
      {
        name: 'Horizontal/vertical mix-up',
        student_belief: 'Adding inside the function moves the graph up.',
        why_tempting: 'Students treat +3 the same wherever it appears.',
        correction_hook: 'Outside changes outputs (up/down); inside changes inputs (left/right).',
      },
    ],
  };
}

function mathMatrices(topicTitle: string): Draft {
  return {
    kind: 'procedure',
    subject_family: 'mathematics',
    wants_to_be: ['symbolic_algebraic', 'worked_procedure'],
    has_decision_point: true,
    contested: false,
    math_load: 'heavy',
    spine: [
      {
        label: 'What a matrix is',
        gist: 'A matrix is a rectangular array of numbers that packages a linear map or a system. Rows and columns are ordered — position carries meaning.',
        depends_on: [],
      },
      {
        label: 'Operations that stay linear',
        gist: 'Addition and scalar multiplication act entrywise. Matrix multiplication composes maps — order matters; AB is not BA in general.',
        depends_on: [0],
      },
      {
        label: 'What a determinant measures',
        gist: 'For a square matrix, the determinant is a single number that measures signed volume scaling (and whether the map is invertible).',
        depends_on: [1],
      },
      {
        label: 'When det = 0',
        gist: 'det(A)=0 means the columns are linearly dependent: the map squashes space and has no inverse. Nonzero det means invertible.',
        depends_on: [2],
      },
      {
        label: 'Compute a small case',
        gist: 'For 2×2, det[[a,b],[c,d]] = ad−bc. Use that as the check before jumping to bigger formulas.',
        depends_on: [3],
      },
    ],
    canonical_examples: [
      {
        setup:
          'Compute $\\det\\begin{pmatrix}2&1\\\\4&3\\end{pmatrix}$.',
        punchline: '$2\\cdot3 - 1\\cdot4 = 2$',
      },
    ],
    misconceptions: [
      {
        name: 'Det is just the product of the diagonal',
        student_belief: 'det(A) is always a₁₁a₂₂…aₙₙ.',
        why_tempting: 'The 2×2 formula looks diagonal-ish and diagonals feel special.',
        correction_hook: 'Even in 2×2 you subtract the other product bc — the off-diagonal path matters.',
      },
      {
        name: 'Matrix multiply is entrywise',
        student_belief: '(AB)ᵢⱼ = aᵢⱼ · bᵢⱼ.',
        why_tempting: 'Addition is entrywise, so multiply feels like it should be too.',
        correction_hook: 'Row-dot-column: each entry of AB mixes a whole row with a whole column.',
      },
    ],
  };
}

function mathCalculus(): Draft {
  return {
    kind: 'procedure',
    subject_family: 'mathematics',
    wants_to_be: ['symbolic_algebraic', 'worked_procedure'],
    has_decision_point: true,
    contested: false,
    math_load: 'heavy',
    spine: [
      {
        label: 'What we are measuring',
        gist: 'Derivatives measure instantaneous rate; integrals accumulate. Name which one this topic asks for before manipulating symbols.',
        depends_on: [],
      },
      {
        label: 'The key move',
        gist: 'Apply one rule cleanly (power, chain, substitution, parts) and write what stays fixed vs what changes.',
        depends_on: [0],
      },
      {
        label: 'A check that catches slips',
        gist: 'Differentiate your integral (or integrate your derivative) on a simple case to catch algebraic mistakes early.',
        depends_on: [1],
      },
      {
        label: 'A branching choice',
        gist: 'When two techniques look plausible, name the signal that picks one (composition inside, product of unlike factors, rational form).',
        depends_on: [2],
      },
    ],
    canonical_examples: [
      { setup: 'Differentiate x³ + 2x.', punchline: '3x² + 2' },
    ],
    misconceptions: [
      {
        name: 'Power rule on the wrong piece',
        student_belief: 'Every factor gets the power rule blindly.',
        why_tempting: 'The power rule is the first tool students over-apply.',
        correction_hook: 'Ask: is this a composition, a product, or a single power of x?',
      },
    ],
  };
}

function mathGeneric(topicTitle: string): Draft {
  const short = topicTitle.length > 48 ? `${topicTitle.slice(0, 45)}…` : topicTitle;
  return {
    kind: 'procedure',
    subject_family: 'mathematics',
    wants_to_be: ['symbolic_algebraic', 'worked_procedure'],
    has_decision_point: false,
    contested: false,
    math_load: 'heavy',
    spine: [
      {
        label: `What ${short} is asking`,
        gist: `State the object and the goal for ${topicTitle} in one concrete sentence — what you start with and what a correct answer looks like.`,
        depends_on: [],
      },
      {
        label: 'The central move',
        gist: `Name the main technique used in ${topicTitle} and why it fits this object (not a neighbouring topic).`,
        depends_on: [0],
      },
      {
        label: 'A worked case',
        gist: `Walk one small example of ${topicTitle} end to end before generalising.`,
        depends_on: [1],
      },
      {
        label: 'A typical slip',
        gist: `Name the most common wrong move on ${topicTitle} and the check that catches it.`,
        depends_on: [2],
      },
    ],
    canonical_examples: [
      { setup: `Work the simplest non-trivial case of ${topicTitle}.`, punchline: 'Arrive at a checkable answer.' },
    ],
    misconceptions: [
      {
        name: 'Neighbour-topic mix-up',
        student_belief: `Treat ${topicTitle} as if it were a more familiar nearby procedure.`,
        why_tempting: 'Similar notation invites transplanting the wrong rule.',
        correction_hook: 'Re-state the definition for this object before applying a rule.',
      },
    ],
  };
}

/**
 * Deterministic provisional shape when no cached TopicShape exists.
 * Math is split by subtopic — never serve graph-shift content for matrices, etc.
 */
export function provisionalTopicShape(topicTitle: string): TopicShapeV1 {
  const t = topicTitle.toLowerCase();
  let d = emptyDraft();

  // --- Mathematics: most specific first ---
  if (/matrix|matrices|determinant|eigen|linear algebra|row reduc|inverse matrix/.test(t)) {
    d = mathMatrices(topicTitle);
  } else if (
    /graph|parabola|quadratic|shift|transform|function of|functions and|vertical shift|horizontal shift/.test(
      t,
    ) ||
    (/\bfunction\b/.test(t) && /graph|plot|shift|transform/.test(t))
  ) {
    d = mathGraphs();
  } else if (
    /integral|antiderivative|derivative|differenti|calculus|chain rule|u-sub|integration by parts|riemann/.test(
      t,
    )
  ) {
    d = mathCalculus();
    d.has_decision_point = /parts|substitution|u-sub|chain rule/.test(t);
  } else if (/probability|statistic|binomial|normal distribution|expected value/.test(t)) {
    d = mathGeneric(topicTitle);
    d.wants_to_be = ['symbolic_algebraic', 'worked_procedure'];
  } else if (
    /algebra|equation|polynomial|trigonometry|vector|limit|series|matrix|calculus|math/.test(t) ||
    /\b(sin|cos|tan|log|ln)\b/.test(t)
  ) {
    d = mathGeneric(topicTitle);
  } else if (
    /photosynthesis|cell|enzyme|krebs|mitosis|dna|atom|molecule|bond|reaction|respiration|osmosis|neuron/.test(
      t,
    )
  ) {
    d.kind = 'concept';
    d.subject_family = 'sciences';
    d.wants_to_be = ['diagram_spatial', 'comparison_contrast'];
    d.math_load = /rate|concentration|equilibrium/.test(t) ? 'light' : 'none';
    d.spine = [
      {
        label: 'What is actually happening',
        gist: 'Name the process in plain language: what starts, what changes, what you end with — before any jargon pile-on.',
        depends_on: [],
      },
      {
        label: 'The mechanism step',
        gist: 'Pin one causal step: energy, matter, or information moves from A to B for a reason you can state.',
        depends_on: [0],
      },
      {
        label: 'A tempting wrong story',
        gist: 'Students often swap cause and effect or credit the visible part of the system. Name that lure and why it feels right.',
        depends_on: [1],
      },
      {
        label: 'What would disprove it',
        gist: 'State one observation that would force you to revise the mechanism — science as testable claim, not vocabulary.',
        depends_on: [2],
      },
    ];
    if (/photo/.test(t)) {
      d.misconceptions.push({
        name: 'Plants eat soil',
        student_belief: 'Plant mass comes mainly from soil.',
        why_tempting: 'Roots are visible and soil feels like food.',
        correction_hook: 'Most dry mass comes from carbon dioxide via photosynthesis.',
      });
    }
    d.canonical_examples.push({
      setup: 'Track where the dry mass of a growing plant comes from.',
      punchline: 'Mostly CO₂ fixed into carbohydrate, not soil bulk.',
    });
  } else if (
    /revolution|war|empire|treaty|constitution|parliament|cold war|renaissance|industrial|colonial/.test(
      t,
    )
  ) {
    d.kind = 'body_of_material';
    d.subject_family = 'history';
    d.wants_to_be = ['timeline_causal', 'comparison_contrast'];
    d.contested = true;
    d.spine = [
      {
        label: 'What broke first',
        gist: 'Long structural pressures (fiscal, social, legitimacy) piled up before any single dramatic week. Name two pressures that made rupture possible.',
        depends_on: [],
      },
      {
        label: 'How events chained',
        gist: 'Each rupture changed what the next could mean: a fiscal crisis becomes a constitutional crisis only after institutions fail to absorb it.',
        depends_on: [0],
      },
      {
        label: 'Actors and choices',
        gist: 'Who had room to act, and what constraints closed that room? Agency sits inside structure — not instead of it.',
        depends_on: [1],
      },
      {
        label: 'Why historians disagree',
        gist: 'Competing interpretations weigh economic, political, and cultural causes differently. State two readings and what evidence each privileges.',
        depends_on: [2],
      },
      {
        label: 'Turning point vs story',
        gist: 'A turning point is a historiographical judgment about legitimacy breaking — not merely the year a famous speech happened.',
        depends_on: [3],
      },
    ];
  } else if (
    /passé|conjugat|vocab|grammar|pronounc|spanish|german|latin|subjunctive|declension/.test(t) ||
    (/\bfrench\b/.test(t) && !/revolution/.test(t))
  ) {
    d.kind = 'skill';
    d.subject_family = 'languages';
    d.wants_to_be = ['audio_oral'];
    d.spine = [
      {
        label: 'Hear it first',
        gist: 'Meet the target form in a short natural sentence before any paradigm chart.',
        depends_on: [],
      },
      {
        label: 'The pattern',
        gist: 'Extract one reusable pattern (person/tense/ending) and say what stays fixed vs what changes.',
        depends_on: [0],
      },
      {
        label: 'Try it',
        gist: 'Produce one new sentence with the same pattern. Prefer accuracy of the target form over long speech.',
        depends_on: [1],
      },
      {
        label: 'A near miss',
        gist: 'Name the most tempting wrong form and why it sounds plausible to a learner.',
        depends_on: [2],
      },
    ];
  } else if (
    /loop|array|algorithm|recursion|pointer|class\b|api\b|binary|sort|hash|async|promise|python|javascript|typescript/.test(
      t,
    )
  ) {
    d.kind = 'skill';
    d.subject_family = 'computing';
    d.wants_to_be = ['code_execution', 'worked_procedure'];
    d.spine = [
      {
        label: 'What we are computing',
        gist: 'State the input, the output, and the invariant you will protect — before touching syntax.',
        depends_on: [],
      },
      {
        label: 'Trace one run',
        gist: 'Walk a tiny input step by step: values in memory after each line. Prediction before typing.',
        depends_on: [0],
      },
      {
        label: 'The edge case',
        gist: 'Empty input, off-by-one, or shared mutation — name the failure mode this pattern usually hits.',
        depends_on: [1],
      },
      {
        label: 'Rewrite the move',
        gist: 'Change one constraint (size, order, mutability) and say what in the algorithm must change with it.',
        depends_on: [2],
      },
    ];
    d.canonical_examples.push({
      setup: 'Trace arr = [3,1,2] through one pass of the target algorithm.',
      punchline: 'Write the array after each comparison/swap.',
    });
    d.misconceptions.push({
      name: 'Looks right in the happy path',
      student_belief: 'If the example works, the algorithm is done.',
      why_tempting: 'Happy-path traces feel complete.',
      correction_hook: 'Always invent the empty / single-element / already-sorted case.',
    });
  } else {
    d.spine = [
      {
        label: 'What this is really about',
        gist: `Pin the core claim in ${topicTitle} to one sentence a skeptical classmate would accept as specific.`,
        depends_on: [],
      },
      {
        label: 'How it works',
        gist: 'Walk the mechanism or structure once, with a concrete example — not a synonym of the title.',
        depends_on: [0],
      },
      {
        label: 'A check',
        gist: 'Ask something that only works if the previous idea landed — not a topic-name quiz.',
        depends_on: [1],
      },
      {
        label: 'In your own words',
        gist: 'Restate the claim without copying the textbook phrasing; keep one concrete detail.',
        depends_on: [2],
      },
    ];
  }

  return topicShapeV1Schema.parse({
    v: 1,
    kind: d.kind,
    subject_family: d.subject_family,
    wants_to_be: d.wants_to_be,
    spine: d.spine,
    prerequisites: [],
    misconceptions: d.misconceptions,
    math_load: d.math_load,
    memorization_load: d.kind === 'body_of_material' ? 'heavy' : 'none',
    procedure_steps: d.kind === 'procedure' ? 4 : d.kind === 'skill' ? 3 : 0,
    has_decision_point: d.has_decision_point,
    contested: d.contested,
    canonical_examples: d.canonical_examples,
    vocabulary: [],
    real_world_hooks: [],
  });
}
