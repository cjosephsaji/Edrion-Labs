/**
 * Planner seam. The lifecycle + tool-dispatch contracts are built against this interface; a
 * deterministic StubPlanner backs the Phase-8 slice so no live LLM call is needed. A real model
 * (default: latest Claude — Opus 4.8 `claude-opus-4-8`) is wired behind the same seam later.
 *
 * IMPORTANT (docs/AI-GUARDRAILS.md): the planner only ever PREPARES actions. It never executes
 * and never surfaces chain-of-thought — only a concise, user-facing explanation per action.
 */

export interface PlannerContext {
  institutionId?: string;
  featureKey?: string;
  paymentId?: string;
  amountMinor?: number;
  [k: string]: unknown;
}

export interface PlannedToolCall {
  toolKey: string;
  args: Record<string, unknown>;
  /** Concise, user-facing explanation. NEVER internal reasoning / chain-of-thought. */
  explanation: string;
}

export interface CopilotPlanRequest {
  prompt: string;
  context: PlannerContext;
  /** Tool keys the registry exposes; the planner must only emit these. */
  availableTools: string[];
}

export interface CopilotPlan {
  /** Short, user-facing summary of what the assistant intends to do. */
  summary: string;
  toolCalls: PlannedToolCall[];
}

export interface CopilotPlanner {
  plan(req: CopilotPlanRequest): Promise<CopilotPlan> | CopilotPlan;
}

/**
 * Deterministic, dependency-free planner. Maps an intent in the prompt to a prepared tool call,
 * filling arguments from the provided context. Same input → same plan, so the lifecycle and the
 * confirmation contracts are unit-testable without a model.
 */
export class StubPlanner implements CopilotPlanner {
  plan(req: CopilotPlanRequest): CopilotPlan {
    const prompt = req.prompt.toLowerCase();
    const has = (key: string) => req.availableTools.includes(key);
    const reason = `Requested via Copilot: ${req.prompt.trim().slice(0, 200)}`;
    const calls: PlannedToolCall[] = [];

    if (/\b(suspend|suspension)\b/.test(prompt) && req.context.institutionId && has('institutions.suspend')) {
      calls.push({
        toolKey: 'institutions.suspend',
        args: { institutionId: req.context.institutionId, reason },
        explanation: 'Suspend the institution, blocking its access until reactivated.',
      });
    } else if (
      /\b(reactivate|re-activate|activate|restore|unsuspend)\b/.test(prompt) &&
      req.context.institutionId &&
      has('institutions.activate')
    ) {
      calls.push({
        toolKey: 'institutions.activate',
        args: { institutionId: req.context.institutionId, reason },
        explanation: 'Reactivate the institution, restoring its access.',
      });
    } else if (/(kill\s*switch|disable (the )?feature|turn off (the )?feature)/.test(prompt) && req.context.featureKey && has('feature.kill_switch')) {
      calls.push({
        toolKey: 'feature.kill_switch',
        args: { featureKey: req.context.featureKey, enabled: true, reason },
        explanation: `Activate the kill switch for "${req.context.featureKey}", forcing it OFF everywhere.`,
      });
    } else if (/\brefund\b/.test(prompt) && req.context.paymentId && has('billing.refund')) {
      calls.push({
        toolKey: 'billing.refund',
        args: { paymentId: req.context.paymentId, amountMinor: req.context.amountMinor, reason },
        explanation: 'Issue a refund against the payment.',
      });
    } else if (has('analysis.summarize')) {
      calls.push({
        toolKey: 'analysis.summarize',
        args: { prompt: req.prompt },
        explanation: 'Summarise the relevant data. Read-only — no changes are made.',
      });
    }

    return {
      summary:
        calls.length === 0
          ? 'I could not map this request to an available action.'
          : calls.length === 1
            ? calls[0]!.explanation
            : `Prepared ${calls.length} actions for your review.`,
      toolCalls: calls,
    };
  }
}
