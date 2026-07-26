import { Injectable } from '@nestjs/common';
import type { CopilotPlan, CopilotPlanRequest, CopilotPlanner, PlannedToolCall } from '@edrion/copilot';

/**
 * Institution-portal Copilot planner (Phase 10). Deterministic + dependency-free — same prompt +
 * context always yields the same plan, so the lifecycle + confirmation contracts are testable without
 * a live model. It only PREPARES tool calls (never executes) and never surfaces chain-of-thought —
 * only a concise, user-facing explanation per action. A real Claude model (default Opus 4.8,
 * `claude-opus-4-8`) is wired behind this same `CopilotPlanner` seam later.
 */
@Injectable()
export class PortalCopilotPlanner implements CopilotPlanner {
  plan(req: CopilotPlanRequest): CopilotPlan {
    const prompt = req.prompt.toLowerCase();
    const ctx = req.context as Record<string, unknown>;
    const has = (key: string) => req.availableTools.includes(key);
    const calls: PlannedToolCall[] = [];

    if (/\b(publish|announce|notify|send)\b/.test(prompt) && ctx.announcementId && has('announcements.publish')) {
      calls.push({
        toolKey: 'announcements.publish',
        args: { announcementId: ctx.announcementId },
        explanation: 'Publish the announcement and notify its audience.',
      });
    } else if (/\b(announce|announcement|notice|draft|broadcast)\b/.test(prompt) && (ctx.title || /["“].+["”]/.test(req.prompt)) && has('announcements.draft')) {
      const title = typeof ctx.title === 'string' && ctx.title.trim() ? ctx.title : extractQuoted(req.prompt) ?? req.prompt.slice(0, 120);
      calls.push({
        toolKey: 'announcements.draft',
        args: { title, audience: ctx.audience ?? 'all', body: ctx.body },
        explanation: `Draft an announcement titled "${title}". It stays a draft until you publish it.`,
      });
    } else if (/\b(find|search|look ?up|list|show|which|who)\b.*\bstudent/.test(prompt) && has('students.search')) {
      calls.push({
        toolKey: 'students.search',
        args: { query: ctx.query ?? extractQuoted(req.prompt) ?? '' },
        explanation: 'Look up students. Read-only — no changes are made.',
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

function extractQuoted(text: string): string | undefined {
  const m = text.match(/["“]([^"”]+)["”]/);
  return m?.[1]?.trim() || undefined;
}
