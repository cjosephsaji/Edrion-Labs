import type { Intervention, LearningEvidence } from './learning-evidence';
import type { MiniExample } from './curriculum';
import type { ModelState, VisualRuntime, VisualSpec } from './visual-spec';
export type Mode = 'classic' | 'world';
export type Station = 'desk' | 'bookshelf' | 'board' | 'experiment';
export type Phase =
  | 'welcome'
  | 'introduce'
  | 'demonstrate'
  | 'interact'
  | 'explain'
  | 'recap';
export type LessonId =
  | 'ai3'
  | 'ai4'
  | 'ehs3'
  | 'ehs5'
  | 'open-ai'
  | 'time'
  | `topic-${string}`;
export interface TopicDiagram {
  heading: string;
  labels: string[];
  caption: string;
  area?: { slope: number; upper: number; slices: number };
  visual?: VisualSpec;
  runtime?: VisualRuntime;
}
export interface TopicTeaching {
  introduction: string;
  demonstration: string;
  simpler: string;
  example: string;
  diagram: TopicDiagram;
  followup: Pick<
    Question,
    'task' | 'options' | 'correct' | 'explanation' | 'optionFeedback' | 'visualSnapshot'
  >;
}
export type VisualState =
  | {
      kind: 'tree';
      treeOrder?: 'v2';
      reveal: number;
      pruneStep: number;
      allLeaves: boolean;
      selected: string;
      transfer: boolean;
      example?: MiniExample;
      opponents?: boolean;
    }
  | {
      kind: 'kb';
      facts: string[];
      derived: string[];
      query: string;
      direction: 'forward' | 'backward';
    }
  | {
      kind: 'hazards';
      selected: string;
      inspected: string[];
      safer: boolean;
      angle?: number;
    }
  | { kind: 'river'; selected: string; controls: string[]; angle?: number }
  | { kind: 'network'; input: number; weight: number; target: number }
  | { kind: 'clocks'; speed: number; earthYears: number }
  | ({ kind: 'topic' } & TopicDiagram);
export type ResponseType =
  | 'choice'
  | 'multi'
  | 'node'
  | 'number'
  | 'text'
  | 'action';
export interface Question {
  visualSnapshot?: ModelState;
  board?: { facts: string[]; rules: { premise: string; conclusion: string }[] };
  errorCategories?: Record<string, Intervention>;
  optionFeedback?: string[];
  teaching?: TopicTeaching;
  id: string;
  task: string;
  type: ResponseType;
  options: string[];
  correct: string[];
  pages: number[];
  phase: Phase;
  concept: string;
  explanation: string;
  misconception: string;
  hints: [string, string];
  retry: 'retry-worked-skip';
  next: string | 'recap';
}
export interface Lesson {
  references?: { title: string; url: string }[];
  experience?: {
    objectives: Record<string, string>;
    diagnostic: Question[];
    tests: Record<string, Question[]>;
    final: { conceptId: string; question: Question }[];
  };
  learningGoals?: string[];
  prerequisites?: string[];
  origin?: 'prepared' | 'generated';
  id: LessonId;
  subject: string;
  module: number | null;
  title: string;
  subtitle: string;
  filename?: string;
  chips: string[];
  introduction: string;
  steps: string[];
  questions: Question[];
  general?: boolean;
}
export interface Completion {
  response: string;
  attempts: number;
  outcome: 'explored' | 'worked' | 'recorded' | 'skipped';
  help: number;
}
export interface Receipt {
  id: string;
  filename: string;
  sha256: string;
  pageCount: number;
  extractedPages: number;
  recognized: LessonId | null;
  pages: { page: number; text: string }[];
}
export type TeachingStatus =
  | 'INTRODUCING'
  | 'DEMONSTRATING'
  | 'CHECKING_UNDERSTANDING'
  | 'AWAITING_RESPONSE'
  | 'RETEACHING'
  | 'READY_TO_CONTINUE'
  | 'INTERRUPTED'
  | 'RESUMING';
export interface TeachingCycle {
  status: TeachingStatus;
  variant: 'primary' | 'simpler' | 'second-example';
  followup: boolean;
  practiceCount: number;
}
export interface PracticeObservation {
  questionId: string;
  lessonId: LessonId;
  concept: string;
  responses: {
    questionId: string;
    response: string;
    task?: string;
    validation: 'correct' | 'incorrect' | 'partial' | 'unclear' | 'unverified';
    misconception: string | null;
    variant: TeachingCycle['variant'];
  }[];
  assistance: string[];
  explanationVariants: string[];
  retries: number;
  skipped: boolean;
  explicitContinuation: boolean;
  continuation:
    | 'validated'
    | 'self-reported'
    | 'skipped'
    | 'reviewed-navigation'
    | null;
}
export interface ShowcaseState {
  learning?: {
    stage: 'learn' | 'apply' | 'test';
    activity: 'lesson' | 'diagnostic' | 'final';
    item: number;
    taskId: string | null;
    assisted: boolean;
    fresh: boolean;
    helpUsed?: string[];
    introduction?: string;
  };
  evidence?: LearningEvidence;
  teaching: TeachingCycle;
  observations: Record<string, PracticeObservation>;
  sessionId: string;
  mode: Mode;
  inputOrigin:
    | 'seeded_pdf'
    | 'uploaded_pdf'
    | 'curated_open_topic'
    | 'live_open_topic';
  sourceId: string | null;
  sourceHash: string | null;
  sourcePages: number[];
  moduleId: number | null;
  lessonId: LessonId | null;
  topicLesson?: Lesson;
  phase: Phase;
  stepId: number;
  highlightTargetId: string | null;
  sceneStation: Station;
  visualState: VisualState;
  visualStepHistory: (VisualState | null)[];
  questionId: string | null;
  questionAttempt: number;
  studentResponse: string;
  completion: Record<string, Completion>;
  lastFeedback: string;
  misconceptionCategory: string | null;
  permittedHintLevel: number;
  questionBankRoute?: string;
  conversationHistory: {
    role: 'user' | 'assistant';
    text: string;
    label: string;
  }[];
  pendingRequest: string | null;
  interruptionCheckpoint: {
    questionId: string | null;
    stepId: number;
    highlight: string | null;
    teaching: TeachingCycle;
    visual: VisualState;
    sceneStation: Station;
  } | null;
  welcomeCueShown: boolean;
  speechState: 'captions';
  saveStatus: 'memory-only' | 'session';
  modeSwitchInProgress: boolean;
  paused: boolean;
  askDraft: string;
  receipts: Receipt[];
  cue: {
    text: string;
    kind: 'speech' | 'thought' | 'notice';
    requested?: boolean;
  } | null;
}

export type Patch = (
  p: Partial<ShowcaseState> | ((s: ShowcaseState) => ShowcaseState),
) => void;
