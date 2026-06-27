import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiActionStatus, AiGuardrailDecision, RiskLevel } from '@edrion/shared-types';
import { can } from '@edrion/permissions';
import {
  assertTransition,
  initialRunStatus,
  isTerminalStatus,
  redactSecrets,
  type AiResolutionContext,
  type CopilotPlanner,
  type GuardrailResult,
} from '@edrion/copilot';
import type {
  ApproveRunInput,
  ConfirmRunInput,
  CreateRunInput,
  ListRunsQuery,
  RejectRunInput,
} from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type { AiRun, AiToolCall } from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import { IdempotencyService } from '../../common/idempotency.service';
import { baseAudit, type ActionContext } from '../../common/action-context';
import {
  AiGovernanceService,
  type GuardrailEvaluationContext,
} from '../ai-governance/ai-governance.service';
import { CopilotRepository } from './copilot.repository';
import { CopilotToolRegistry, type ToolPreparation } from './tool-registry';
import { AiUsageLimiter } from './ai-usage-limiter.service';
import { COPILOT_PLANNER } from './copilot.tokens';

const MODULE = 'copilot';
const CONFIRMATION_TTL_MS = 15 * 60 * 1000;
const RISK_ORDER: RiskLevel[] = [RiskLevel.Low, RiskLevel.Medium, RiskLevel.High, RiskLevel.Critical];

@Injectable()
export class CopilotService {
  constructor(
    private readonly repo: CopilotRepository,
    private readonly registry: CopilotToolRegistry,
    private readonly aiGov: AiGovernanceService,
    private readonly idempotency: IdempotencyService,
    private readonly usage: AiUsageLimiter,
    @Inject(COPILOT_PLANNER) private readonly planner: CopilotPlanner,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // --- Reads --------------------------------------------------------------------------------

  listRuns(q: ListRunsQuery) {
    return this.repo.listRuns(q);
  }

  /** Full run detail: prepared tool calls, confirmations, approvals + the linked audit events. */
  async getRunDetail(id: string) {
    const run = await this.repo.findRun(id);
    if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Run not found' });
    const [toolCalls, confirmations, approvals, auditEvents] = await Promise.all([
      this.repo.toolCallsForRun(id),
      this.repo.confirmationsForRun(id),
      this.repo.approvalsForRun(id),
      this.repo.auditEventsForRun(id),
    ]);
    return { run, toolCalls, confirmations, approvals, auditEvents };
  }

  // --- Create (understand → gather → prepare → show exact impact) ----------------------------

  async createRun(input: CreateRunInput, ctx: ActionContext) {
    const startedAt = Date.now();
    const context = input.context as AiResolutionContext & Record<string, unknown>;
    // AI usage limits (per-employee + per-policy-scope daily ceilings) — 429 before any work.
    await this.usage.check(ctx.principalContext.principal.employeeId, context);
    const plan = await this.planner.plan({
      prompt: input.prompt,
      context: (input.context ?? {}) as Record<string, unknown>,
      availableTools: this.registry.keys(),
    });

    const run = await this.repo.insertRun({
      employeeId: ctx.principalContext.principal.employeeId,
      employeeName: ctx.principalContext.principal.fullName,
      // Redact secrets before they land in an AI-run record surfaced by AI Audit.
      prompt: redactSecrets(input.prompt),
      context: redactSecrets(context) as Record<string, unknown>,
      contextSources: Object.keys(input.context ?? {}),
      status: AiActionStatus.Proposed,
      summary: plan.summary,
      model: 'stub-planner',
      promptVersion: 'v1',
      startedAt: new Date(startedAt),
    });

    let anyNeedsConfirmation = false;
    let anyExecutable = false;
    let maxRisk: RiskLevel = RiskLevel.Low;

    // Load the guardrail policy/rule set once for the whole run, not per tool call.
    const guardrailCtx = await this.aiGov.loadEvaluationContext();

    for (const call of plan.toolCalls) {
      const tool = this.registry.get(call.toolKey);
      if (!tool) continue;

      let prep: ToolPreparation;
      try {
        prep = await tool.prepare(call.args, ctx);
      } catch (e) {
        await this.repo.insertToolCall({
          runId: run.id,
          toolKey: call.toolKey,
          capability: tool.capability,
          args: redactSecrets(call.args),
          explanation: call.explanation,
          requiredPermission: tool.requiredPermission,
          decision: AiGuardrailDecision.Blocked,
          decisionLayer: 'preparation_error',
          decisionReason: e instanceof Error ? e.message : 'Could not prepare this action',
          reversible: tool.reversible,
          status: AiActionStatus.Failed,
          errorDetail: e instanceof Error ? e.message : 'prepare failed',
        });
        continue;
      }

      const guardrail = this.aiGov.evaluateWith(guardrailCtx, {
        proposed: {
          capability: tool.capability,
          action: tool.key,
          requiredPermission: tool.requiredPermission,
          financialImpactMinor: prep.financialImpactMinor,
          affectedUsers: prep.affectedUsers,
          riskLevel: prep.riskLevel,
          reversible: tool.reversible,
        },
        context: { ...context, ...prep.resolutionContext } as Record<string, never>,
      });

      maxRisk = maxOf(maxRisk, guardrail.riskLevel);
      let decision = guardrail.decision;
      let decisionLayer: string = guardrail.layer;
      let decisionReason = guardrail.reason;
      let status: AiActionStatus;
      let result: Record<string, unknown> | undefined;
      let executedAt: Date | undefined;

      // The AI never gets a wider reach than the employee: even an auto-runnable (ALLOW)
      // read tool requires the underlying permission, exactly as the human path does. Without
      // this, an employee lacking the read permission could obtain data through the Copilot.
      const lacksPermission =
        !!tool.requiredPermission &&
        !can(ctx.principalContext.principal.permissions, tool.requiredPermission);

      if (lacksPermission) {
        decision = AiGuardrailDecision.Blocked;
        decisionLayer = 'permission';
        decisionReason = `Employee lacks the required permission: ${tool.requiredPermission}`;
        status = AiActionStatus.Rejected;
      } else if (decision === AiGuardrailDecision.Blocked) {
        status = AiActionStatus.Rejected;
      } else if (decision === AiGuardrailDecision.Allow) {
        // Read-only / allowed — no confirmation needed; execute immediately.
        try {
          result = await tool.execute(call.args, { ...ctx, ai: { aiRunId: run.id } });
          status = AiActionStatus.Executed;
          executedAt = new Date();
          anyExecutable = true;
        } catch (e) {
          status = AiActionStatus.Failed;
          result = { error: e instanceof Error ? e.message : 'execution failed' };
        }
      } else {
        status = AiActionStatus.AwaitingConfirmation;
        anyNeedsConfirmation = true;
      }

      await this.repo.insertToolCall({
        runId: run.id,
        toolKey: tool.key,
        capability: tool.capability,
        args: redactSecrets(call.args),
        explanation: call.explanation,
        requiredPermission: tool.requiredPermission,
        decision,
        decisionLayer,
        decisionReason,
        riskLevel: guardrail.riskLevel,
        reversible: prep.reversible,
        financialImpactMinor: prep.financialImpactMinor,
        affectedUsers: prep.affectedUsers,
        impactPreview: prep as unknown as Record<string, unknown>,
        status,
        result: result ? redactSecrets(result) : null,
        executedAt: executedAt ?? null,
      });
    }

    const status = initialRunStatus({ anyNeedsConfirmation, anyExecutable });
    const terminal = isTerminalStatus(status);
    const updated = await this.repo.updateRun(run.id, {
      status,
      riskLevel: maxRisk,
      durationMs: Date.now() - startedAt,
      completedAt: terminal ? new Date() : null,
      expiresAt: status === AiActionStatus.AwaitingConfirmation ? new Date(Date.now() + CONFIRMATION_TTL_MS) : null,
    });

    await this.writeRunAudit(ctx, run.id, 'ai.run_created', RiskLevel.Low, {
      prompt: input.prompt,
      status: updated?.status,
      toolCount: plan.toolCalls.length,
    });

    return this.getRunDetail(run.id);
  }

  // --- Confirm (CONFIRM → execute → result → audit) -----------------------------------------

  async confirm(runId: string, input: ConfirmRunInput, ctx: ActionContext) {
    const run = await this.requireRun(runId);
    if (run.status !== AiActionStatus.AwaitingConfirmation) {
      throw new ConflictException({
        code: 'NOT_AWAITING_CONFIRMATION',
        message: `Run is ${run.status}; only an awaiting_confirmation run can be confirmed.`,
      });
    }
    if (this.isExpired(run)) {
      await this.repo.updateRun(runId, { status: AiActionStatus.Expired, completedAt: new Date() });
      throw new ConflictException({ code: 'RUN_EXPIRED', message: 'This confirmation has expired. Start a new run.' });
    }

    const toolCalls = await this.repo.toolCallsForRun(runId);
    const executable = toolCalls.filter((t) => t.status === AiActionStatus.AwaitingConfirmation);

    // The AI cannot bypass the permission boundary — the confirming employee must hold each
    // underlying permission, exactly as the human path requires.
    for (const t of executable) {
      if (t.requiredPermission && !can(ctx.principalContext.principal.permissions, t.requiredPermission)) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: `Missing required permission: ${t.requiredPermission}`,
        });
      }
    }

    // Second-approver gate for high-risk actions.
    const needsSecond = executable.some((t) => t.decision === AiGuardrailDecision.NeedsSecondApprover);
    if (needsSecond) {
      const approvals = await this.repo.approvalsForRun(runId);
      const valid = approvals.find((a) => a.approved && a.approverId !== run.employeeId);
      if (!valid) {
        throw new ConflictException({
          code: 'SECOND_APPROVER_REQUIRED',
          message: 'This run requires a second approver before it can be confirmed.',
        });
      }
    }

    // Typed confirmation for critical-risk runs.
    if (run.riskLevel === RiskLevel.Critical && !input.confirmationText?.trim()) {
      throw new ConflictException({
        code: 'TYPED_CONFIRMATION_REQUIRED',
        message: 'Type the confirmation phrase to authorise this critical action.',
      });
    }

    assertTransition(run.status as AiActionStatus, AiActionStatus.Confirmed);
    await this.repo.updateRun(runId, { status: AiActionStatus.Confirmed });
    await this.repo.insertConfirmation({
      runId,
      employeeId: ctx.principalContext.principal.employeeId,
      employeeName: ctx.principalContext.principal.fullName,
      method: input.confirmationText ? 'typed' : 'recent_auth',
      confirmationText: input.confirmationText ?? null,
      reason: input.reason,
    });

    const aiCtx: ActionContext = { ...ctx, ai: { aiRunId: runId } };
    let anyFailed = false;

    // Load the guardrail set once for the re-evaluation of every executable tool call.
    const guardrailCtx = await this.aiGov.loadEvaluationContext();

    for (const t of executable) {
      const tool = this.registry.get(t.toolKey);
      if (!tool) {
        anyFailed = true;
        await this.repo.updateToolCall(t.id, { status: AiActionStatus.Failed, errorDetail: 'Tool no longer registered' });
        continue;
      }

      // Re-evaluate guardrails server-side at execution time — never trust the prepared decision.
      const reeval = this.reevaluate(t, run.context as AiResolutionContext, guardrailCtx);
      if (reeval.decision === AiGuardrailDecision.Blocked) {
        anyFailed = true;
        await this.repo.updateToolCall(t.id, {
          status: AiActionStatus.Failed,
          errorDetail: `Blocked at execution: ${reeval.reason}`,
        });
        continue;
      }

      const idemKey = `ai-run:${runId}:${t.id}`;
      const auditAction = this.auditActionFor(t);
      try {
        const { result } = await this.idempotency.run(idemKey, 'copilot.execute', () =>
          tool.execute(t.args as Record<string, unknown>, aiCtx),
        );
        const auditEvent = auditAction ? await this.repo.latestAuditEvent(runId, auditAction) : undefined;
        await this.repo.updateToolCall(t.id, {
          status: AiActionStatus.Executed,
          result: redactSecrets(result),
          auditEventId: auditEvent?.id ?? null,
          executedAt: new Date(),
        });
      } catch (e) {
        anyFailed = true;
        await this.repo.updateToolCall(t.id, {
          status: AiActionStatus.Failed,
          errorDetail: e instanceof Error ? e.message : 'execution failed',
        });
      }
    }

    const finalStatus = anyFailed ? AiActionStatus.Failed : AiActionStatus.Executed;
    assertTransition(AiActionStatus.Confirmed, finalStatus);
    await this.repo.updateRun(runId, {
      status: finalStatus,
      completedAt: new Date(),
      durationMs: Date.now() - run.startedAt.getTime(),
      errorDetail: anyFailed ? 'One or more actions failed during execution' : null,
    });

    await this.writeRunAudit(ctx, runId, 'ai.run_confirmed', run.riskLevel as RiskLevel, {
      reason: input.reason,
      executed: executable.length,
      result: finalStatus,
    });

    return this.getRunDetail(runId);
  }

  // --- Reject / approve ---------------------------------------------------------------------

  async reject(runId: string, input: RejectRunInput, ctx: ActionContext) {
    const run = await this.requireRun(runId);
    if (isTerminalStatus(run.status as AiActionStatus)) {
      throw new ConflictException({ code: 'RUN_TERMINAL', message: `Run is already ${run.status}.` });
    }
    assertTransition(run.status as AiActionStatus, AiActionStatus.Rejected);
    await this.repo.updateRun(runId, { status: AiActionStatus.Rejected, completedAt: new Date() });
    const toolCalls = await this.repo.toolCallsForRun(runId);
    for (const t of toolCalls) {
      if (t.status === AiActionStatus.AwaitingConfirmation) {
        await this.repo.updateToolCall(t.id, { status: AiActionStatus.Rejected });
      }
    }
    await this.writeRunAudit(ctx, runId, 'ai.run_rejected', RiskLevel.Low, { reason: input.reason });
    return this.getRunDetail(runId);
  }

  async approve(runId: string, input: ApproveRunInput, ctx: ActionContext) {
    const run = await this.requireRun(runId);
    if (run.status !== AiActionStatus.AwaitingConfirmation) {
      throw new ConflictException({
        code: 'NOT_AWAITING_CONFIRMATION',
        message: `Run is ${run.status}; only an awaiting_confirmation run can be approved.`,
      });
    }
    if (ctx.principalContext.principal.employeeId === run.employeeId) {
      throw new ForbiddenException({
        code: 'SELF_APPROVAL_FORBIDDEN',
        message: 'A second approver must be different from the employee who initiated the run.',
      });
    }
    await this.repo.insertApproval({
      runId,
      approverId: ctx.principalContext.principal.employeeId,
      approverName: ctx.principalContext.principal.fullName,
      approved: input.approved,
      reason: input.reason,
    });
    await this.writeRunAudit(ctx, runId, 'ai.run_approved', RiskLevel.High, {
      reason: input.reason,
      approved: input.approved,
    });
    return this.getRunDetail(runId);
  }

  // --- Helpers ------------------------------------------------------------------------------

  private async requireRun(id: string): Promise<AiRun> {
    const run = await this.repo.findRun(id);
    if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Run not found' });
    return run;
  }

  private isExpired(run: AiRun): boolean {
    return !!run.expiresAt && run.expiresAt.getTime() < Date.now();
  }

  private reevaluate(
    t: AiToolCall,
    context: AiResolutionContext,
    loaded: GuardrailEvaluationContext,
  ): GuardrailResult {
    return this.aiGov.evaluateWith(loaded, {
      proposed: {
        capability: t.capability as never,
        action: t.toolKey,
        requiredPermission: t.requiredPermission ?? undefined,
        financialImpactMinor: t.financialImpactMinor ?? 0,
        affectedUsers: t.affectedUsers ?? 0,
        riskLevel: (t.riskLevel ?? undefined) as never,
      },
      context: (context ?? {}) as Record<string, never>,
    });
  }

  private auditActionFor(t: AiToolCall): string | undefined {
    const preview = t.impactPreview as { auditPreview?: { action?: string } } | null;
    return preview?.auditPreview?.action;
  }

  private async writeRunAudit(
    ctx: ActionContext,
    runId: string,
    action: string,
    riskLevel: RiskLevel,
    detail: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.logAudit({
      ...baseAudit({ ...ctx, ai: { aiRunId: runId } }),
      action,
      module: MODULE,
      entityType: 'ai_run',
      entityId: runId,
      riskLevel,
      newState: detail,
    } as Parameters<AuditWriter['logAudit']>[0]);
  }
}

function maxOf(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER.indexOf(b) > RISK_ORDER.indexOf(a) ? b : a;
}
