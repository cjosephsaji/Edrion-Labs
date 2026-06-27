import { AiActionStatus } from '@edrion/shared-types';

/**
 * Allowed transitions for an AI run / prepared action (docs/AI-GUARDRAILS.md):
 *
 *   proposed → awaiting_confirmation → confirmed → executed
 *            ↘ executed (read-only, nothing to confirm)
 *   any non-terminal → rejected | expired
 *   confirmed → failed (execution error)
 *
 * Pure + exhaustively unit-tested so the lifecycle can never silently skip the confirmation gate.
 */
const ALLOWED: Record<AiActionStatus, AiActionStatus[]> = {
  [AiActionStatus.Proposed]: [
    AiActionStatus.AwaitingConfirmation,
    AiActionStatus.Executed, // read-only run — no mutation to confirm
    AiActionStatus.Rejected,
    AiActionStatus.Expired,
  ],
  [AiActionStatus.AwaitingConfirmation]: [
    AiActionStatus.Confirmed,
    AiActionStatus.Rejected,
    AiActionStatus.Expired,
  ],
  [AiActionStatus.Confirmed]: [AiActionStatus.Executed, AiActionStatus.Failed],
  [AiActionStatus.Executed]: [],
  [AiActionStatus.Rejected]: [],
  [AiActionStatus.Expired]: [],
  [AiActionStatus.Failed]: [],
};

const TERMINAL: ReadonlySet<AiActionStatus> = new Set([
  AiActionStatus.Executed,
  AiActionStatus.Rejected,
  AiActionStatus.Expired,
  AiActionStatus.Failed,
]);

export function isTerminalStatus(status: AiActionStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransition(from: AiActionStatus, to: AiActionStatus): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

/** Throwing guard for service code. Returns `to` so it composes in an assignment. */
export function assertTransition(from: AiActionStatus, to: AiActionStatus): AiActionStatus {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal AI run transition: ${from} → ${to}`);
  }
  return to;
}

/**
 * The state a run lands in immediately after planning + guardrail evaluation.
 * If any prepared action needs confirmation/second-approver → awaiting_confirmation;
 * if everything is read-only/allowed → executed; if everything is blocked → rejected.
 */
export function initialRunStatus(decisions: {
  anyNeedsConfirmation: boolean;
  anyExecutable: boolean;
}): AiActionStatus {
  if (decisions.anyNeedsConfirmation) return AiActionStatus.AwaitingConfirmation;
  if (decisions.anyExecutable) return AiActionStatus.Executed;
  return AiActionStatus.Proposed;
}
