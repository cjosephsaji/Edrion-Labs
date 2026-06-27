import { describe, expect, it, vi } from 'vitest';
import { AiActionStatus, AiCapability, AiGuardrailDecision, RiskLevel } from '@edrion/shared-types';
import { CopilotService } from './copilot.service';
import type { ActionContext } from '../../common/action-context';

const RUN_ID = 'run-1';
const READ_PERMISSION = 'platform.dashboard.view';
const SUSPEND_PERMISSION = 'institutions.suspend';

function makeCtx(keys: string[]): ActionContext {
  return {
    principalContext: {
      principal: {
        employeeId: 'emp-1',
        email: 'owner@edrion.dev',
        fullName: 'Owner',
        roleKeys: [],
        permissions: { keys: new Set(keys), hasWildcard: keys.includes('*') },
        mfaEnrolled: true,
        lastAuthAt: new Date(),
      },
    },
    request: { requestId: 'r', correlationId: 'c', ip: '127.0.0.1', userAgent: 'vitest', apiEndpoint: 'POST /copilot/runs' },
  } as ActionContext;
}

const passthroughIdem = {
  run: async (_k: string | undefined, _s: string, fn: () => Promise<Record<string, unknown>>) => ({ result: await fn(), replayed: false }),
};

function makeRepo(toolCalls: Record<string, unknown>[] = []) {
  return {
    insertRun: vi.fn(async (v: Record<string, unknown>) => ({ id: RUN_ID, riskLevel: null, expiresAt: null, ...v })),
    insertToolCall: vi.fn(async (v: Record<string, unknown>) => {
      const row = { id: `tc-${toolCalls.length}`, ...v };
      toolCalls.push(row);
      return row;
    }),
    updateRun: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
    updateToolCall: vi.fn(async () => undefined),
    findRun: vi.fn(async () => ({ id: RUN_ID, status: AiActionStatus.Executed, context: {}, startedAt: new Date(), riskLevel: RiskLevel.Low, employeeId: 'emp-1' })),
    toolCallsForRun: vi.fn(async () => toolCalls),
    confirmationsForRun: vi.fn(async () => []),
    approvalsForRun: vi.fn(async () => []),
    auditEventsForRun: vi.fn(async () => []),
    insertConfirmation: vi.fn(async () => ({})),
    insertApproval: vi.fn(async () => ({})),
    latestAuditEvent: vi.fn(async () => undefined),
  };
}

function allowTool(executeMock = vi.fn(async () => ({ ok: true }))) {
  return {
    key: 'analysis.summarize',
    capability: AiCapability.Analysis,
    requiredPermission: READ_PERMISSION,
    reversible: true,
    prepare: vi.fn(async () => ({
      summary: 's',
      targetType: 'analysis',
      targetId: null,
      dataChanges: null,
      billingImpactMinor: null,
      financialImpactMinor: 0,
      affectedUsers: 0,
      reversible: true,
      requiredPermission: READ_PERMISSION,
      riskLevel: RiskLevel.Low,
      auditPreview: { action: 'ai.analysis', module: 'copilot', entityType: 'analysis' },
      resolutionContext: {},
    })),
    execute: executeMock,
  };
}

function makeService(opts: {
  toolCalls?: Record<string, unknown>[];
  tool?: ReturnType<typeof allowTool>;
  plan?: { summary: string; toolCalls: { toolKey: string; args: Record<string, unknown>; explanation: string }[] };
  decision?: string;
  findRun?: () => unknown;
}) {
  const toolCalls = opts.toolCalls ?? [];
  const repo = makeRepo(toolCalls);
  if (opts.findRun) repo.findRun = vi.fn(opts.findRun);
  const tool = opts.tool ?? allowTool();
  const registry = { keys: () => [tool.key], get: vi.fn(() => tool) };
  const guardrail = () => ({
    decision: opts.decision ?? AiGuardrailDecision.Allow,
    layer: 'capability',
    reason: 'read-only',
    riskLevel: RiskLevel.Low,
  });
  const aiGov = {
    loadEvaluationContext: vi.fn(async () => ({ policies: [], rules: [] })),
    evaluateWith: vi.fn(() => guardrail()),
    evaluate: vi.fn(async () => guardrail()),
  };
  const planner = {
    plan: vi.fn(async () => opts.plan ?? { summary: 's', toolCalls: [{ toolKey: tool.key, args: {}, explanation: 'e' }] }),
  };
  const audit = { logAudit: vi.fn(async () => undefined) };
  const usage = { check: vi.fn(async () => undefined) };
  const service = new CopilotService(
    repo as never,
    registry as never,
    aiGov as never,
    passthroughIdem as never,
    usage as never,
    planner as never,
    audit as never,
  );
  return { service, repo, tool, registry, toolCalls, aiGov, usage };
}

describe('CopilotService.createRun — per-tool permission on the auto-run (ALLOW) path', () => {
  it('executes an allowed read tool when the employee holds the permission', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const { service, toolCalls } = makeService({ tool: allowTool(execute) });
    await service.createRun({ prompt: 'summarise', context: {} } as never, makeCtx([READ_PERMISSION]));
    expect(execute).toHaveBeenCalledOnce();
    expect(toolCalls[0]).toMatchObject({ status: AiActionStatus.Executed, decision: AiGuardrailDecision.Allow });
  });

  it('refuses to auto-run an allowed tool when the employee lacks the permission (no AI bypass)', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const { service, toolCalls } = makeService({ tool: allowTool(execute) });
    await service.createRun({ prompt: 'summarise', context: {} } as never, makeCtx([]));
    expect(execute).not.toHaveBeenCalled();
    expect(toolCalls[0]).toMatchObject({
      status: AiActionStatus.Rejected,
      decision: AiGuardrailDecision.Blocked,
      decisionLayer: 'permission',
    });
  });

  it('redacts secrets out of the persisted prompt', async () => {
    const { service, repo } = makeService({});
    await service.createRun(
      { prompt: 'rotate using sk-ABCDEFGHIJKLMNOP1234 now', context: {} } as never,
      makeCtx([READ_PERMISSION]),
    );
    const persistedPrompt = repo.insertRun.mock.calls[0]![0].prompt as string;
    expect(persistedPrompt).not.toContain('sk-ABCDEFGHIJKLMNOP1234');
    expect(persistedPrompt).toContain('[REDACTED]');
  });

  it('loads the guardrail set once per run (no per-tool N+1)', async () => {
    const { service, aiGov } = makeService({});
    await service.createRun({ prompt: 'summarise', context: {} } as never, makeCtx([READ_PERMISSION]));
    expect(aiGov.loadEvaluationContext).toHaveBeenCalledOnce();
    expect(aiGov.evaluateWith).toHaveBeenCalledOnce();
  });
});

describe('CopilotService.confirm — execution-time permission boundary', () => {
  const awaitingRun = (over: Record<string, unknown> = {}) => ({
    id: RUN_ID,
    status: AiActionStatus.AwaitingConfirmation,
    expiresAt: new Date(Date.now() + 60_000),
    riskLevel: RiskLevel.High,
    employeeId: 'someone-else',
    context: {},
    startedAt: new Date(),
    ...over,
  });

  const suspendCall = {
    id: 'tc-1',
    status: AiActionStatus.AwaitingConfirmation,
    requiredPermission: SUSPEND_PERMISSION,
    decision: AiGuardrailDecision.NeedsConfirmation,
    toolKey: 'institutions.suspend',
    capability: AiCapability.InstitutionAccess,
    args: {},
  };

  it('rejects confirmation when the confirming employee lacks the underlying permission', async () => {
    const execute = vi.fn();
    const { service } = makeService({
      toolCalls: [{ ...suspendCall }],
      tool: { ...allowTool(execute as never), key: 'institutions.suspend' } as never,
      findRun: () => awaitingRun(),
    });
    await expect(
      service.confirm(RUN_ID, { reason: 'go' } as never, makeCtx([])),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects an expired confirmation and marks the run expired', async () => {
    const { service, repo } = makeService({
      toolCalls: [{ ...suspendCall }],
      findRun: () => awaitingRun({ expiresAt: new Date(Date.now() - 1000) }),
    });
    await expect(
      service.confirm(RUN_ID, { reason: 'go' } as never, makeCtx([SUSPEND_PERMISSION])),
    ).rejects.toMatchObject({ response: { code: 'RUN_EXPIRED' } });
    expect(repo.updateRun).toHaveBeenCalledWith(RUN_ID, expect.objectContaining({ status: AiActionStatus.Expired }));
  });

  it('rolls the run to failed when a confirmed tool execution throws', async () => {
    const execute = vi.fn(async () => {
      throw new Error('downstream service exploded');
    });
    const { service, repo } = makeService({
      toolCalls: [{ ...suspendCall, riskLevel: RiskLevel.Medium }],
      tool: { ...allowTool(execute), key: 'institutions.suspend', requiredPermission: SUSPEND_PERMISSION } as never,
      findRun: () => awaitingRun({ riskLevel: RiskLevel.Medium }),
    });
    await service.confirm(RUN_ID, { reason: 'do it' } as never, makeCtx([SUSPEND_PERMISSION]));
    expect(execute).toHaveBeenCalledOnce();
    expect(repo.updateRun).toHaveBeenCalledWith(RUN_ID, expect.objectContaining({ status: AiActionStatus.Failed }));
    expect(repo.updateToolCall).toHaveBeenCalledWith('tc-1', expect.objectContaining({ status: AiActionStatus.Failed }));
  });
});

describe('CopilotService.reject', () => {
  it('rejects an awaiting run and marks awaiting tool calls rejected', async () => {
    const { service, repo } = makeService({
      toolCalls: [{ id: 'tc-1', status: AiActionStatus.AwaitingConfirmation }],
      findRun: () => ({ id: RUN_ID, status: AiActionStatus.AwaitingConfirmation, context: {}, startedAt: new Date(), riskLevel: RiskLevel.Low }),
    });
    await service.reject(RUN_ID, { reason: 'not now' } as never, makeCtx([]));
    expect(repo.updateRun).toHaveBeenCalledWith(RUN_ID, expect.objectContaining({ status: AiActionStatus.Rejected }));
    expect(repo.updateToolCall).toHaveBeenCalledWith('tc-1', { status: AiActionStatus.Rejected });
  });

  it('refuses to reject a terminal run', async () => {
    const { service } = makeService({
      findRun: () => ({ id: RUN_ID, status: AiActionStatus.Executed, context: {}, startedAt: new Date(), riskLevel: RiskLevel.Low }),
    });
    await expect(
      service.reject(RUN_ID, { reason: 'too late' } as never, makeCtx([])),
    ).rejects.toMatchObject({ response: { code: 'RUN_TERMINAL' } });
  });
});

describe('CopilotService.approve', () => {
  it('forbids self-approval by the initiating employee', async () => {
    const { service } = makeService({
      findRun: () => ({ id: RUN_ID, status: AiActionStatus.AwaitingConfirmation, employeeId: 'emp-1', context: {}, startedAt: new Date(), riskLevel: RiskLevel.High }),
    });
    await expect(
      service.approve(RUN_ID, { approved: true, reason: 'looks fine' } as never, makeCtx(['ai.approve_sensitive_action'])),
    ).rejects.toMatchObject({ response: { code: 'SELF_APPROVAL_FORBIDDEN' } });
  });
});
