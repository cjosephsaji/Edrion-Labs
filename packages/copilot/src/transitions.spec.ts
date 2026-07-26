import { describe, expect, it } from 'vitest';
import { AiActionStatus } from '@edrion/shared-types';
import {
  assertTransition,
  canTransition,
  initialRunStatus,
  isTerminalStatus,
} from './transitions';

describe('lifecycle transitions', () => {
  it('allows the happy path proposed → awaiting_confirmation → confirmed → executed', () => {
    expect(canTransition(AiActionStatus.Proposed, AiActionStatus.AwaitingConfirmation)).toBe(true);
    expect(canTransition(AiActionStatus.AwaitingConfirmation, AiActionStatus.Confirmed)).toBe(true);
    expect(canTransition(AiActionStatus.Confirmed, AiActionStatus.Executed)).toBe(true);
  });

  it('allows a read-only run to go straight proposed → executed', () => {
    expect(canTransition(AiActionStatus.Proposed, AiActionStatus.Executed)).toBe(true);
  });

  it('NEVER allows skipping confirmation (awaiting_confirmation → executed)', () => {
    expect(canTransition(AiActionStatus.AwaitingConfirmation, AiActionStatus.Executed)).toBe(false);
  });

  it('never lets a mutation jump proposed → confirmed', () => {
    expect(canTransition(AiActionStatus.Proposed, AiActionStatus.Confirmed)).toBe(false);
  });

  it('allows rejection/expiry from non-terminal states', () => {
    expect(canTransition(AiActionStatus.Proposed, AiActionStatus.Rejected)).toBe(true);
    expect(canTransition(AiActionStatus.AwaitingConfirmation, AiActionStatus.Expired)).toBe(true);
  });

  it('allows confirmed → failed on execution error', () => {
    expect(canTransition(AiActionStatus.Confirmed, AiActionStatus.Failed)).toBe(true);
  });

  it('treats executed/rejected/expired/failed as terminal', () => {
    for (const s of [AiActionStatus.Executed, AiActionStatus.Rejected, AiActionStatus.Expired, AiActionStatus.Failed]) {
      expect(isTerminalStatus(s)).toBe(true);
      expect(canTransition(s, AiActionStatus.Confirmed)).toBe(false);
    }
  });

  it('assertTransition throws on an illegal move and returns the target on a legal one', () => {
    expect(() => assertTransition(AiActionStatus.Executed, AiActionStatus.Confirmed)).toThrow();
    expect(assertTransition(AiActionStatus.Confirmed, AiActionStatus.Executed)).toBe(AiActionStatus.Executed);
  });
});

describe('initialRunStatus', () => {
  it('awaiting_confirmation when any action needs confirmation', () => {
    expect(initialRunStatus({ anyNeedsConfirmation: true, anyExecutable: true })).toBe(
      AiActionStatus.AwaitingConfirmation,
    );
  });
  it('executed when everything is read-only/allowed', () => {
    expect(initialRunStatus({ anyNeedsConfirmation: false, anyExecutable: true })).toBe(
      AiActionStatus.Executed,
    );
  });
  it('proposed when nothing is executable (all blocked / no actions)', () => {
    expect(initialRunStatus({ anyNeedsConfirmation: false, anyExecutable: false })).toBe(
      AiActionStatus.Proposed,
    );
  });
});
