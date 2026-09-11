import {
  PETROS_DOCUMENT_TEACHING_EXPERIENCE,
  petrosDocumentTeachingActionSchema,
  petrosDocumentTeachingPlanSchema,
  petrosDocumentTeachingProgressSchema,
  petrosDocumentTeachingStateSchema,
  type PetrosDocumentTeachingAction,
  type PetrosDocumentTeachingEvaluation,
  type PetrosDocumentTeachingPlan,
  type PetrosDocumentTeachingState,
} from '@edrion/schemas';

export function initialDocumentTeachingState(
  plan: PetrosDocumentTeachingPlan,
  level: PetrosDocumentTeachingState['level'] = 'balanced',
): PetrosDocumentTeachingState {
  const parsed = petrosDocumentTeachingPlanSchema.parse(plan);
  return {
    experience: PETROS_DOCUMENT_TEACHING_EXPERIENCE,
    plan: parsed,
    scene: 0,
    unlocked: 0,
    mode: null,
    level,
    diagnosticComplete: false,
    scenes: Object.fromEntries(
      parsed.scenes.map((scene) => [
        scene.id,
        petrosDocumentTeachingProgressSchema.parse({}),
      ]),
    ),
    commands: [],
  };
}

export function transitionDocumentTeaching(
  original: PetrosDocumentTeachingState,
  action: PetrosDocumentTeachingAction,
  evaluated?: PetrosDocumentTeachingEvaluation,
  reply?: string,
): PetrosDocumentTeachingState {
  const state = petrosDocumentTeachingStateSchema.parse(original);
  const parsedAction = petrosDocumentTeachingActionSchema.parse(action);
  if (state.commands.includes(parsedAction.idempotencyKey)) return state;
  const scene = state.plan.scenes[state.scene]!;
  const progress = state.scenes[scene.id]!;

  switch (parsedAction.action) {
    case 'explore':
      if (parsedAction.scene !== state.scene)
        throw new Error('The scene changed. Reload before exploring.');
      progress.exploration = { ...progress.exploration, ...parsedAction.values };
      break;
    case 'mode':
      state.mode = parsedAction.mode;
      break;
    case 'save':
      if (parsedAction.scene !== state.scene)
        throw new Error('The scene changed. Reload before saving.');
      progress.draft = parsedAction.draft;
      break;
    case 'help':
      progress.help = parsedAction.kind;
      progress.supportExposed = true;
      if (parsedAction.kind === 'simpler') state.level = 'foundations';
      if (parsedAction.kind === 'deeper') state.level = 'stretch';
      if (reply) progress.reply = reply;
      break;
    case 'complete':
      if (parsedAction.scene !== state.scene)
        throw new Error('The scene changed. Reload before continuing.');
      progress.completed = true;
      if (progress.outcome === 'unseen') progress.outcome = 'explored';
      if (state.scene < state.plan.scenes.length - 1) {
        state.scene += 1;
        state.unlocked = Math.max(state.unlocked, state.scene);
      }
      break;
    case 'diagnostic':
      if (!evaluated) throw new Error('The diagnostic has not been evaluated.');
      state.diagnosticComplete = true;
      state.diagnosticAnswer = parsedAction.answer;
      if (!parsedAction.answer.trim()) {
        state.level = 'balanced';
        break;
      }
      state.level =
        evaluated.correctness === 'correct'
          ? 'stretch'
          : evaluated.correctness === 'partial'
            ? 'balanced'
            : 'foundations';
      {
        const phase = evaluated.correctness === 'correct'
          ? 'independent_check'
          : evaluated.correctness === 'partial'
            ? 'visual_explanation'
            : 'concrete_opening';
        const routeIndex = state.plan.scenes.findIndex((candidate) => candidate.phase === phase);
        if (routeIndex >= 0) {
          state.scene = routeIndex;
          state.unlocked = Math.max(state.unlocked, routeIndex);
        }
      }
      break;
    case 'ask':
      if (!reply) throw new Error('Petros could not answer. Please try again.');
      progress.question = parsedAction.question;
      progress.reply = reply;
      if (progress.help === 'none') progress.help = 'hint';
      break;
    case 'navigate':
      if (
        parsedAction.scene > state.unlocked ||
        parsedAction.scene >= state.plan.scenes.length
      )
        throw new Error('That lesson idea is not unlocked yet.');
      state.scene = parsedAction.scene;
      break;
    case 'answer':
      if (!evaluated)
        throw new Error(
          'Your answer has not been evaluated. Please try again.',
        );
      if (parsedAction.scene !== state.scene)
        throw new Error('The scene changed. Reload before checking.');
      progress.draft = parsedAction.answer;
      progress.attempts.push({
        answer: parsedAction.answer,
        correctness: evaluated.correctness,
        feedback: evaluated.feedback,
        at: new Date().toISOString(),
        supported: progress.help !== 'none' || progress.attempts.length > 0,
      });
      progress.outcome =
        evaluated.correctness === 'correct'
          ? progress.attempts.at(-1)!.supported
            ? 'supported'
            : 'independent'
          : 'unresolved';
      progress.completed = progress.outcome === 'independent' || progress.outcome === 'supported';
      if (evaluated.correctness === 'incorrect') {
        state.level = 'foundations';
        progress.help = 'simpler';
        progress.reply = evaluated.safeNextHint;
      }
      else if (evaluated.correctness === 'partial') {
        state.level = 'balanced';
        progress.help = 'hint';
        progress.reply = evaluated.safeNextHint;
      }
      else {
        const priorIndependent = Object.values(state.scenes).some(
          (candidate) => candidate !== progress && candidate.outcome === 'independent',
        );
        state.level = priorIndependent && progress.outcome === 'independent' ? 'stretch' : 'balanced';
      }
      break;
    case 'advance':
      if (
        !['independent', 'supported'].includes(progress.outcome) &&
        !parsedAction.skip
      ) {
        throw new Error(
          'Check your understanding or choose “Move on and revisit”.',
        );
      }
      if (parsedAction.skip) progress.outcome = 'skipped';
      progress.completed = true;
      if (state.scene < state.plan.scenes.length - 1) {
        state.scene += 1;
        state.unlocked = Math.max(state.unlocked, state.scene);
      }
      break;
  }
  state.commands = [
    ...state.commands.slice(-1999),
    parsedAction.idempotencyKey,
  ];
  return petrosDocumentTeachingStateSchema.parse(state);
}
