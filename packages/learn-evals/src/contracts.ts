export const PETROS_QUALITY_CORPUS_VERSION = 'petros-quality-corpus.v1';
export const PETROS_QUALITY_RUBRIC_VERSION = 'petros-quality-rubric.v1';
export const PETROS_QUALITY_SCHEMA_VERSION = 'petros-quality-report.v1';
export const PETROS_QUALITY_RUNNER_VERSION = 'petros-quality-runner.v1';
export const PETROS_QUALITY_JUDGE_FUNCTION_KEY = 'evaluation.teaching_quality.judge';

export const QUALITY_DIMENSIONS = [
  'correctness',
  'structural_variety',
  'move_appropriateness',
  'prerequisite_handling',
  'guess_confidence',
  'stuck_recovery',
  'socratic_cap',
  'pacing',
  'explainability',
  'detour_return',
  'repetition',
  'artifact_quality',
  'safety_boundaries',
  'language_register',
  'operational_efficiency',
] as const;

export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];
export type EvaluationMode = 'fixture' | 'live';
export type SessionGoal = 'learn' | 'revise' | 'repair' | 'doubt';
export type FailureClass = 'product' | 'judge' | 'infrastructure';

export type EvidenceRef = {
  moveId: string;
  blockId?: string;
  observationId?: string;
  note: string;
};

export type QualityScore = {
  dimension: QualityDimension;
  score: number;
  maxScore: 5;
  evidence: EvidenceRef[];
  rationale: string;
  uncertainty: number;
  evaluator: 'deterministic' | 'gateway_judge';
};

export type QualityMove = {
  id: string;
  blockId: string;
  type: string;
  phase: 'opening' | 'explaining' | 'active' | 'closing' | 'detour';
  title: string;
  content: string;
  studentSafeReason: string;
  decisionFactors: string[];
  expectedEvidence: string;
  startedAtMs: number;
  firstContentAtMs: number;
  completedAtMs: number;
  artifactProposed?: boolean;
  studentConsentRequired?: boolean;
  sourceAnchors?: string[];
};

export type QualityObservation = {
  id: string;
  moveId: string;
  type: 'answer' | 'confidence' | 'skip' | 'question' | 'hint' | 'override' | 'complete';
  correctness?: 'correct' | 'partial' | 'incorrect';
  confidence?: 'sure' | 'think_so' | 'guessing';
  responseTimeMs: number;
  summary: string;
};

export type QualityUsage = {
  source: 'evaluation';
  functionKey: string;
  requestId: string;
  providerKey: string | null;
  modelKey: string | null;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  latencyMs: number;
  retries: number;
  fallbacks: number;
  validationFailures: number;
  cacheHit: boolean;
};

export type QualityTranscript = {
  id: string;
  runId: string;
  caseId: string;
  topicKey: string;
  topicTitle: string;
  subject: string;
  personaId: string;
  goal: SessionGoal;
  seed: number;
  environment: 'evaluation';
  synthetic: true;
  versions: {
    corpus: string;
    rubric: string;
    runner: string;
    prompt: string;
    schema: string;
    profile: string;
    routing: string;
    code: string;
  };
  moves: QualityMove[];
  observations: QualityObservation[];
  usage: QualityUsage[];
  errors: Array<{ class: FailureClass; code: string; message: string }>;
  ended: 'goal_met' | 'time_up' | 'max_moves' | 'failed';
  resumed: boolean;
  productionWrites: number;
};

export type QualitySessionResult = {
  transcript: QualityTranscript;
  scores: QualityScore[];
  totalScore: number;
  blockingFailures: string[];
  warnings: string[];
};

export type QualityThresholds = {
  blockingDimensionFloor: number;
  warningDimensionFloor: number;
  blockingRegressionDelta: number;
  warningRegressionDelta: number;
  costIncreaseWarningRatio: number;
  latencyIncreaseWarningRatio: number;
  lowSampleSize: number;
};

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  blockingDimensionFloor: 3,
  warningDimensionFloor: 3.5,
  blockingRegressionDelta: -0.5,
  warningRegressionDelta: -0.25,
  costIncreaseWarningRatio: 0.2,
  latencyIncreaseWarningRatio: 0.25,
  lowSampleSize: 5,
};

export type QualityRunReport = {
  schemaVersion: string;
  runId: string;
  label: string;
  status: 'completed' | 'failed' | 'cancelled';
  mode: EvaluationMode;
  source: 'evaluation';
  suite: string;
  seed: number;
  createdAt: string;
  completedAt: string;
  versions: QualityTranscript['versions'];
  selection: { caseIds: string[]; personaIds: string[]; functionKeys: string[] };
  limits: { maxCostMicros: number; maxTokens: number; maxDurationMs: number; concurrency: number };
  totals: {
    sessions: number;
    completed: number;
    failed: number;
    score: number;
    costMicros: number;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  };
  dimensions: Record<QualityDimension, { mean: number; count: number }>;
  sessions: QualitySessionResult[];
  comparison: QualityComparison | null;
  gate: 'pass' | 'warn' | 'fail';
  blockingFailures: string[];
  warnings: string[];
  resume: { supported: true; stateFile: string | null; resumedSessions: number };
  isolation: { syntheticOnly: true; productionWrites: number; analyticsSource: 'evaluation' };
};

export type QualityComparison = {
  baselineRunId: string;
  candidateRunId: string;
  overallDelta: number;
  dimensionDeltas: Record<QualityDimension, number>;
  topicDeltas: Record<string, number>;
  personaDeltas: Record<string, number>;
  functionDeltas: Record<string, number>;
  failureTypeDeltas: Record<string, number>;
  regressions: Array<{ scope: string; key: string; delta: number; severity: 'blocking' | 'warning'; noisy: boolean }>;
  improvements: Array<{ scope: string; key: string; delta: number; noisy: boolean }>;
};
