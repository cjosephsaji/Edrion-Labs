export type StepAction =
  | { type: 'teach'; spineRef?: number; surfaceHint?: string }
  | { type: 'check' }
  | { type: 'repair'; misconceptionName: string }
  | { type: 'insert_checkpoint'; reason: string }
  | { type: 'advance_checkpoint'; announce?: string }
  | { type: 'probe' }
  | { type: 'consolidate' }
  | { type: 'close' };

export type StepState = {
  budgetExhausted: boolean;
  teachingBlocksInCheckpoint: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  checkpointTaught: boolean;
  checkDone: boolean;
  insertionsUsed: number;
  consecutiveProbes: number;
  probeChains: number;
  hitMisconceptionName?: string | null;
  shakyPrerequisite: boolean;
  roleAllowsProbe: boolean;
  unvisitedSpineRef?: number | null;
};

/**
 * Pure decision loop — no LLM, no I/O. First match wins.
 */
export function decideNextStep(state: StepState): StepAction {
  if (state.budgetExhausted) return { type: 'consolidate' };

  if (state.teachingBlocksInCheckpoint === 0) {
    return { type: 'teach', spineRef: state.unvisitedSpineRef ?? 0 };
  }

  if (state.consecutiveWrong >= 1 && state.hitMisconceptionName) {
    return { type: 'repair', misconceptionName: state.hitMisconceptionName };
  }

  if (
    state.consecutiveWrong >= 2 &&
    state.shakyPrerequisite &&
    state.insertionsUsed < 2
  ) {
    return { type: 'insert_checkpoint', reason: 'Shaky prerequisite — slowing down.' };
  }

  if (state.consecutiveWrong === 1 && !state.hitMisconceptionName) {
    return { type: 'teach', surfaceHint: 'different' };
  }

  if (state.consecutiveCorrect >= 2 && state.checkpointTaught) {
    return {
      type: 'advance_checkpoint',
      announce: "You've got the mechanics, so let's move on.",
    };
  }

  if (state.checkpointTaught && !state.checkDone) {
    return { type: 'check' };
  }

  if (
    state.roleAllowsProbe &&
    state.consecutiveProbes < 2 &&
    state.probeChains < 2
  ) {
    return { type: 'probe' };
  }

  if (state.unvisitedSpineRef != null) {
    return { type: 'teach', spineRef: state.unvisitedSpineRef };
  }

  return { type: 'consolidate' };
}
