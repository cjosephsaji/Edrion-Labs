import {
  PETROS_INFLATION_PILOT,
  PETROS_PILOT_SCENES,
  petrosPilotStateSchema,
  petrosPilotSceneProgressSchema,
  type PetrosPilotAction,
  type PetrosPilotState,
  type PetrosAnswerEvaluation,
  type PetrosPilotSceneId,
} from '@edrion/schemas';

export function initialPilotState(): PetrosPilotState {
  return {
    experience: PETROS_INFLATION_PILOT,
    scene: 0,
    unlocked: 0,
    mode: null,
    finished: false,
    scenes: Object.fromEntries(
      PETROS_PILOT_SCENES.map((scene) => [
        scene.id,
        petrosPilotSceneProgressSchema.parse({}),
      ]),
    ),
    commands: [],
  };
}

export const PILOT_RUBRICS: Record<
  PetrosPilotSceneId,
  { correctChoiceId: string | null; rubric: string }
> = {
  basket: {
    correctChoiceId: 'no',
    rubric:
      'A single relative price rise is insufficient evidence of a general price-level rise.',
  },
  definition: {
    correctChoiceId: null,
    rubric:
      'Require a causal explanation: broadly higher prices mean the same fixed nominal money/income buys fewer goods/services, reducing purchasing power. Accept equivalent wording and relevant examples. Merely repeating that inflation is prices rising is partial, not correct. Contradictions about money buying more are incorrect.',
  },
  demand: {
    correctChoiceId: 'up',
    rubric:
      'Demand outpacing productive capacity creates upward pressure on the general price level, other things equal.',
  },
  costs: {
    correctChoiceId: null,
    rubric:
      'Require both: higher energy/input costs can be passed into selling prices or constrain aggregate supply, and this differs from demand-pull pressure originating in increased aggregate spending. Do not require costs to be passed through fully or claim prices must rise. Defining one term without comparing mechanisms is partial.',
  },
  consequences: {
    correctChoiceId: 'slower',
    rubric:
      '115.5/110 - 1 = 5%: the price level rose while inflation slowed from 10% to 5%.',
  },
  transfer: {
    correctChoiceId: null,
    rubric:
      'Require all three: imported energy costs create cost-push/supply pressure rather than increased demand; broad prices rising with fixed nominal salaries reduce purchasing power; slower but positive inflation means prices continue rising, not return to their earlier level. Accept sound qualifications on pass-through. Omission is partial; reverse causal claims are incorrect. Restating the question is not an explanation.',
  },
};

export function transitionPilot(
  original: PetrosPilotState,
  action: PetrosPilotAction,
  evaluated?: PetrosAnswerEvaluation,
  reply?: string,
): PetrosPilotState {
  const state = petrosPilotStateSchema.parse(original);
  if (state.commands.includes(action.idempotencyKey)) return state;
  if (state.finished)
    throw new Error('This pilot is finished. Start a new lesson to try again.');
  const scene = PETROS_PILOT_SCENES[state.scene]!;
  const progress = state.scenes[scene.id]!;
  switch (action.action) {
    case 'mode':
      state.mode = action.mode;
      break;
    case 'save':
      if (action.scene !== scene.id)
        throw new Error('The scene changed. Reload before saving.');
      progress.draft = action.draft;
      progress.value = action.value;
      break;
    case 'help':
      if (progress.help !== 'example') progress.help = action.kind;
      break;
    case 'navigate':
      if (action.scene > state.unlocked)
        throw new Error('Explore the current scene before opening that one.');
      state.scene = action.scene;
      break;
    case 'ask':
      if (!reply) throw new Error('Petros could not answer. Please try again.');
      progress.question = action.question;
      progress.reply = reply;
      if (progress.help === 'none') progress.help = 'hint';
      break;
    case 'answer': {
      if (!evaluated)
        throw new Error(
          'Your answer has not been evaluated. Please try again.',
        );
      if (progress.attempts.length >= 60)
        throw new Error(
          'You have reached the attempt limit for this scene. Move on and revisit in a new lesson.',
        );
      if (
        scene.responseType === 'choice' &&
        !scene.choices.some((choice) => choice.id === action.answer)
      )
        throw new Error('Choose one of the displayed answers.');
      const supported =
        progress.help !== 'none' || progress.attempts.length > 0;
      progress.draft = action.answer;
      progress.attempts.push({
        answer: action.answer,
        correctness: evaluated.correctness,
        feedback: evaluated.feedback,
        hint: evaluated.safeNextHint ?? scene.hint,
        supported,
        at: new Date().toISOString(),
      });
      progress.outcome =
        evaluated.correctness === 'correct'
          ? supported
            ? 'supported'
            : 'independent'
          : 'unresolved';
      break;
    }
    case 'advance':
      if (
        !['independent', 'supported'].includes(progress.outcome) ||
        progress.attempts.at(-1)?.answer !== progress.draft
      ) {
        if (!action.skip)
          throw new Error(
            'Check your understanding or choose “Move on and revisit”.',
          );
        progress.outcome = 'unresolved';
      }
      if (state.scene === PETROS_PILOT_SCENES.length - 1) state.finished = true;
      else {
        state.scene += 1;
        state.unlocked = Math.max(state.unlocked, state.scene);
      }
      break;
  }
  // Old retries still fail the version check, even after the bounded ledger rolls over.
  state.commands = [...state.commands.slice(-1999), action.idempotencyKey];
  return state;
}
