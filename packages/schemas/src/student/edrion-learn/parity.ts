import { learnEntryPointSchema, learnOrchestratorStatusSchema } from './state';

/** Must stay aligned with `learn_sessions_entry_point_ck` in 0097_edrion_learn_orchestrator.sql */
export const LEARN_ENTRY_POINTS = [
  'learning_path',
  'free_chat_handoff',
  'library_document',
  'review_queue',
  'goal',
  'prep_countdown',
  'bad_result',
  'upcoming_exam',
] as const;

/** Must stay aligned with `learn_sessions_orchestrator_status_ck` in 0097_edrion_learn_orchestrator.sql */
export const LEARN_ORCHESTRATOR_STATUSES = [
  'created',
  'active',
  'awaiting_response',
  'paused',
  'closing',
  'closed',
] as const;

export function assertLearnEntryPointParity(): void {
  for (const value of LEARN_ENTRY_POINTS) {
    if (!learnEntryPointSchema.safeParse(value).success) {
      throw new Error(`LEARN_ENTRY_POINTS out of sync with Zod schema: ${value}`);
    }
  }
}

export function assertLearnOrchestratorStatusParity(): void {
  for (const value of LEARN_ORCHESTRATOR_STATUSES) {
    if (!learnOrchestratorStatusSchema.safeParse(value).success) {
      throw new Error(`LEARN_ORCHESTRATOR_STATUSES out of sync with Zod schema: ${value}`);
    }
  }
}
