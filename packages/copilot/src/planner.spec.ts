import { describe, expect, it } from 'vitest';
import { StubPlanner } from './planner';

const ALL = [
  'institutions.suspend',
  'institutions.activate',
  'feature.kill_switch',
  'billing.refund',
  'analysis.summarize',
];

const planner = new StubPlanner();

describe('StubPlanner', () => {
  it('maps a suspend intent + institution context to institutions.suspend', () => {
    const plan = planner.plan({
      prompt: 'Please suspend this institution for non-payment',
      context: { institutionId: 'inst-1' },
      availableTools: ALL,
    });
    expect(plan.toolCalls).toHaveLength(1);
    expect(plan.toolCalls[0]!.toolKey).toBe('institutions.suspend');
    expect(plan.toolCalls[0]!.args.institutionId).toBe('inst-1');
    expect(String(plan.toolCalls[0]!.args.reason)).toContain('Copilot');
  });

  it('maps a reactivate intent to institutions.activate', () => {
    const plan = planner.plan({
      prompt: 'reactivate the institution',
      context: { institutionId: 'inst-1' },
      availableTools: ALL,
    });
    expect(plan.toolCalls[0]!.toolKey).toBe('institutions.activate');
  });

  it('maps a kill-switch intent + feature key to feature.kill_switch', () => {
    const plan = planner.plan({
      prompt: 'hit the kill switch on this feature',
      context: { featureKey: 'ai_copilot' },
      availableTools: ALL,
    });
    expect(plan.toolCalls[0]!.toolKey).toBe('feature.kill_switch');
    expect(plan.toolCalls[0]!.args.enabled).toBe(true);
  });

  it('maps a refund intent + payment to billing.refund', () => {
    const plan = planner.plan({
      prompt: 'refund this payment',
      context: { paymentId: 'pay-1', amountMinor: 500 },
      availableTools: ALL,
    });
    expect(plan.toolCalls[0]!.toolKey).toBe('billing.refund');
    expect(plan.toolCalls[0]!.args.paymentId).toBe('pay-1');
  });

  it('falls back to a read-only analysis when no mutation intent matches', () => {
    const plan = planner.plan({
      prompt: 'how many active institutions are there?',
      context: {},
      availableTools: ALL,
    });
    expect(plan.toolCalls[0]!.toolKey).toBe('analysis.summarize');
  });

  it('never emits a tool that is not available', () => {
    const plan = planner.plan({
      prompt: 'suspend this institution',
      context: { institutionId: 'inst-1' },
      availableTools: ['analysis.summarize'],
    });
    expect(plan.toolCalls[0]!.toolKey).toBe('analysis.summarize');
  });

  it('is deterministic — same input yields the same plan', () => {
    const req = { prompt: 'suspend it', context: { institutionId: 'inst-1' }, availableTools: ALL };
    expect(planner.plan(req)).toEqual(planner.plan(req));
  });
});
