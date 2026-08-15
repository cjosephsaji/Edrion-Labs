import {
  PETROS_TEACH_BACK_ANALYSIS_VERSION,
  PETROS_TEACH_BACK_FOLLOW_UP_VERSION,
  PETROS_TEACH_BACK_VERDICT_VERSION,
  petrosTeachBackAnalysisSchema,
  petrosTeachBackFollowUpSchema,
  petrosTeachBackVerdictSchema,
  type PetrosTeachBackAnalysis,
  type PetrosTeachBackFollowUp,
  type PetrosTeachBackVerdict,
} from '@edrion/schemas';

export const TEACH_BACK_PERSONAS = [
  'complete_clear',
  'fluent_causally_incomplete',
  'confidently_wrong',
  'very_short',
  'verbose_confused',
  'stt_corrupted',
] as const;
export type TeachBackPersona = (typeof TEACH_BACK_PERSONAS)[number];

type ExpectedGap = Exclude<PetrosTeachBackAnalysis['primaryGap'], null>['type'] | null;
export type TeachBackQualityCase = {
  id: string;
  persona: TeachBackPersona;
  topic: string;
  explanation: string;
  expectedGap: ExpectedGap;
  speechRecognitionUncertain: boolean;
};

const SEGMENT_ID = '11111111-1111-4111-8111-111111111111';

export const TEACH_BACK_QUALITY_CASES: TeachBackQualityCase[] = [
  {
    id: 'teach-clear-photosynthesis',
    persona: 'complete_clear',
    topic: 'photosynthesis',
    explanation:
      'Photosynthesis lets a plant store light energy as chemical energy. Chlorophyll absorbs light, and that energy helps combine carbon dioxide from the air with water from the roots to make glucose. Oxygen is released. For example, a leaf in bright light can make glucose that the plant later uses for growth.',
    expectedGap: null,
    speechRecognitionUncertain: false,
  },
  {
    id: 'teach-causal-electric-current',
    persona: 'fluent_causally_incomplete',
    topic: 'electric current',
    explanation:
      'A battery has two terminals and a wire joins them through a lamp. The lamp lights and current is measured in amperes. Electrons are in the wire, and the circuit has to be complete.',
    expectedGap: 'missing_causal_link',
    speechRecognitionUncertain: false,
  },
  {
    id: 'teach-wrong-seasons',
    persona: 'confidently_wrong',
    topic: 'seasons',
    explanation:
      'Summer happens because Earth moves much closer to the Sun, so the whole planet receives more heat. Winter happens when Earth is much farther away.',
    expectedGap: 'misconception',
    speechRecognitionUncertain: false,
  },
  {
    id: 'teach-short-osmosis',
    persona: 'very_short',
    topic: 'osmosis',
    explanation: 'Osmosis is when water moves.',
    expectedGap: 'scope_gap',
    speechRecognitionUncertain: false,
  },
  {
    id: 'teach-confused-inflation',
    persona: 'verbose_confused',
    topic: 'inflation',
    explanation:
      'Inflation means prices go up, but it also means money becomes more valuable because you need more of it. Demand can raise prices, although high demand always makes every product cheaper once shops sell more. So purchasing power rises and falls at the same time.',
    expectedGap: 'contradiction',
    speechRecognitionUncertain: false,
  },
  {
    id: 'teach-stt-corrupted-mitosis',
    persona: 'stt_corrupted',
    topic: 'mitosis',
    explanation:
      'The chrome a zones line up and then the seller divides into two genetic lee similar cells.',
    expectedGap: null,
    speechRecognitionUncertain: true,
  },
];

export type TeachBackQualityCandidate = {
  analysis: unknown;
  followUp: unknown | null;
  priorQuestions: string[];
  verdict: unknown;
};

export type TeachBackQualityEvaluation = {
  blockingFailures: string[];
  warnings: string[];
  evidence: Array<{ dimension: string; note: string }>;
};

/** Deterministic, content-local checks; never reads production learner data. */
export function evaluateTeachBackQuality(
  qualityCase: TeachBackQualityCase,
  candidate: TeachBackQualityCandidate,
): TeachBackQualityEvaluation {
  const blockingFailures: string[] = [];
  const warnings: string[] = [];
  const evidence: Array<{ dimension: string; note: string }> = [];
  const analysis = petrosTeachBackAnalysisSchema.safeParse(candidate.analysis);
  if (!analysis.success) {
    blockingFailures.push('analysis_schema: structured analysis is invalid');
  } else {
    const actualGap = analysis.data.primaryGap?.type ?? null;
    if (qualityCase.speechRecognitionUncertain) {
      if (!analysis.data.speechRecognitionUncertain || analysis.data.primaryGap) {
        blockingFailures.push('stt_boundary: recognition uncertainty became a conceptual judgment');
      }
    } else if (actualGap !== qualityCase.expectedGap) {
      blockingFailures.push(
        `gap_detection: expected ${qualityCase.expectedGap ?? 'no gap'}, received ${actualGap ?? 'no gap'}`,
      );
    }
    if (
      qualityCase.expectedGap === null &&
      !qualityCase.speechRecognitionUncertain &&
      analysis.data.needsFollowUp
    ) {
      blockingFailures.push('invented_gap: complete explanation was pestered');
    }
    evidence.push({
      dimension: 'gap_detection',
      note: `Expected ${qualityCase.expectedGap ?? 'none'}; observed ${actualGap ?? 'none'}.`,
    });
  }

  const followUp =
    candidate.followUp == null ? null : petrosTeachBackFollowUpSchema.safeParse(candidate.followUp);
  if (qualityCase.expectedGap && !qualityCase.speechRecognitionUncertain) {
    if (!followUp || !followUp.success) {
      blockingFailures.push('follow_up_schema: one valid junior question is required');
    } else {
      const value = followUp.data;
      if (value.gapType !== qualityCase.expectedGap)
        blockingFailures.push('follow_up_relevance: question targets the wrong gap');
      if (!containsExcerpt(qualityCase.explanation, value.groundedIn.excerpt))
        blockingFailures.push('follow_up_grounding: evidence is not in the student segment');
      if (wordCount(value.question) > 40 || (value.probeNumber === 1 && value.helpAfterCap))
        blockingFailures.push('non_takeover: junior response lectures before the student is stuck');
      if (
        /stupid|obviously|seriously|even a child|you should know|pathetic/i.test(
          `${value.juniorTransition} ${value.question}`,
        )
      )
        blockingFailures.push('tone_mocking: junior language is disrespectful');
      if (/please elaborate|provide more detail|can you explain more\??/i.test(value.question))
        warnings.push('fun_specificity: question is generic rather than naturally curious');
      evidence.push({
        dimension: 'follow_up_relevance',
        note: `Grounded ${value.gapType} question in “${value.groundedIn.excerpt}”.`,
      });
    }
  } else if (candidate.followUp != null) {
    blockingFailures.push(
      qualityCase.speechRecognitionUncertain
        ? 'stt_false_probe: uncertain recognition triggered a conceptual probe'
        : 'invented_follow_up: complete explanation received an unnecessary probe',
    );
  }

  const questions = [
    ...candidate.priorQuestions,
    followUp && followUp.success ? followUp.data.question : null,
  ]
    .filter((question): question is string => Boolean(question))
    .map(normalize);
  if (new Set(questions).size !== questions.length)
    blockingFailures.push('repetitive_probe: the same follow-up was asked again');

  const verdict = petrosTeachBackVerdictSchema.safeParse(candidate.verdict);
  if (!verdict.success) {
    blockingFailures.push(
      'verdict_schema: verdict is invalid, numeric, or changes official assessment',
    );
  } else {
    const evidenceLinks = [
      ...verdict.data.clear.map((item) => item.evidence),
      ...(verdict.data.mostImportantGap ? [verdict.data.mostImportantGap.evidence] : []),
    ];
    if (evidenceLinks.some((item) => !containsExcerpt(qualityCase.explanation, item.excerpt))) {
      blockingFailures.push('verdict_evidence: verdict cites unsupported student evidence');
    }
    if (qualityCase.speechRecognitionUncertain && !verdict.data.uncertaintyDisclosure) {
      blockingFailures.push(
        'verdict_uncertainty: STT-corrupted input lacks an uncertainty disclosure',
      );
    }
    if (/genius|gifted|brilliant mind|natural talent/i.test(JSON.stringify(verdict.data))) {
      blockingFailures.push('tone_flattery: verdict judges ability rather than the explanation');
    }
    evidence.push({
      dimension: 'verdict_evidence',
      note: `${evidenceLinks.length} student-visible evidence link(s) validated.`,
    });
  }

  return { blockingFailures, warnings, evidence };
}

export function idealTeachBackCandidate(
  qualityCase: TeachBackQualityCase,
): TeachBackQualityCandidate {
  const excerpt = qualityCase.explanation.slice(0, 180);
  const groundedIn = { segmentId: SEGMENT_ID, excerpt };
  const gap = qualityCase.expectedGap
    ? {
        type: qualityCase.expectedGap,
        description: `The explanation needs a clearer ${qualityCase.expectedGap.replaceAll('_', ' ')}.`,
        evidence: groundedIn,
        confidence: 0.88,
      }
    : null;
  const analysis: PetrosTeachBackAnalysis = {
    schemaVersion: PETROS_TEACH_BACK_ANALYSIS_VERSION,
    coverage: [
      {
        key: 'core',
        label: 'Explain the core idea',
        status: gap ? 'partial' : 'covered',
        evidence: [groundedIn],
      },
    ],
    claims: [
      {
        claim: excerpt,
        status: qualityCase.speechRecognitionUncertain
          ? 'unverifiable'
          : gap?.type === 'misconception'
            ? 'contradicted'
            : 'supported',
        evidence: groundedIn,
      },
    ],
    examples: [],
    primaryGap: qualityCase.speechRecognitionUncertain ? null : gap,
    completeEnough: !gap && !qualityCase.speechRecognitionUncertain,
    needsFollowUp: Boolean(gap) && !qualityCase.speechRecognitionUncertain,
    speechRecognitionUncertain: qualityCase.speechRecognitionUncertain,
    uncertaintyDisclosure: qualityCase.speechRecognitionUncertain
      ? 'The transcript may not reflect the spoken explanation; correct it before conceptual analysis.'
      : null,
  };
  const followUp: PetrosTeachBackFollowUp | null = gap
    ? {
        schemaVersion: PETROS_TEACH_BACK_FOLLOW_UP_VERSION,
        gapType: gap.type,
        question: questionFor(gap.type),
        groundedIn,
        probeNumber: 1,
        juniorTransition: 'I follow the words, but I lost one connection in the middle.',
        helpAfterCap: null,
        tone: 'curious',
      }
    : null;
  const verdict: PetrosTeachBackVerdict = {
    schemaVersion: PETROS_TEACH_BACK_VERDICT_VERSION,
    oneLine: gap
      ? 'The main idea is visible, with one important connection to repair.'
      : 'The explanation gives a junior a clear route through the idea.',
    clear: [
      {
        detail: 'The explanation names the central idea in the student’s own words.',
        evidence: groundedIn,
      },
    ],
    mostImportantGap: gap
      ? { type: gap.type, detail: gap.description, evidence: groundedIn }
      : null,
    suggestedImprovement: gap
      ? 'Add one plain-language bridge and a concrete example.'
      : 'Keep the same sequence and add one check-for-understanding question.',
    audienceFit: gap ? 'helpful_after_revision' : 'likely_helpful',
    audienceReason: gap
      ? 'A junior can follow the outline after the missing connection is supplied.'
      : 'The mechanism and example are ordered for a new learner.',
    uncertaintyDisclosure: qualityCase.speechRecognitionUncertain
      ? 'This verdict is limited because the transcript needs correction.'
      : null,
    recapProposal: {
      kind: 'note',
      title: `${qualityCase.topic} recap`,
      body: qualityCase.explanation,
    },
    officialAssessmentChanged: false,
  };
  return { analysis, followUp, priorQuestions: [], verdict };
}

function questionFor(gap: Exclude<ExpectedGap, null>) {
  const questions: Record<Exclude<ExpectedGap, null>, string> = {
    missing_causal_link: 'What makes the result happen after the circuit is complete?',
    undefined_term: 'What does that term mean in everyday words?',
    unhandled_exception: 'Would the same explanation work in the exception you mentioned?',
    weak_example: 'Could you show one concrete example so I can test the idea?',
    contradiction: 'How can those two statements both be true at the same time?',
    misconception: 'What observation would distinguish that idea from the alternative?',
    scope_gap: 'What is the first detail a beginner needs before that sentence makes sense?',
  };
  return questions[gap];
}

function containsExcerpt(source: string, excerpt: string) {
  return normalize(source).includes(normalize(excerpt));
}
function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
