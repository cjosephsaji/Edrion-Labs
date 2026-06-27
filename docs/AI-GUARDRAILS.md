# AI guardrails

## The non-negotiable rule

The Copilot performs **no state-changing action without explicit human confirmation** — even
when the employee has permission. It may understand, search, analyse, draft and **prepare**
actions, but a mutation only runs after a human confirms it.

## Mandatory flow

```
understand → gather → explain → prepare → show exact impact → CONFIRM → execute → result → audit
```

The AI must never silently: suspend an institution, disable a user, change a plan, issue a
refund, change permissions, enter a portal, enable a feature, delete/archive data, send an
announcement, modify billing or export sensitive data.

## Lifecycle (enforced by the model + DB)

`ai_runs` / `ai_tool_calls` / `ai_confirmations` / `ai_approvals`. A prepared action is an
`AiActionStatus`: `proposed → awaiting_confirmation → confirmed → executed` (or
`rejected/expired/failed`). The execution path is the **same audited service** a human uses —
the AI cannot bypass `PermissionsGuard`, recent-auth or the `AuditWriter`. Audit events from
AI-confirmed actions carry `aiInvolved: true` + the `aiRunId`.

## Confirmation screen shows

proposed action · target · reason · exact data changes · billing impact · affected users ·
reversibility · required permission · risk level · the audit record that will be written.
High-risk actions escalate: typed confirmation, recent auth, MFA, second approver, approval
expiry.

## Guardrail configuration (AI Control Centre)

Global on/off + per plan/institution/campus/independent/employee-role; per-capability enable
(search/analysis/drafting/recommendations/report/record-create/record-edit/billing/user/
permission/institution-access/feature/communications); modes `disabled | read_only |
draft_only | full`; confirmation + two-person requirements; max financial impact; max affected
users; data-access boundaries + PII redaction; rate/usage limits; model + fallback; prompt
version; tool permissions; logging level; retention; **emergency kill switch** (`ai.disable`).

## Logging

Every execution records employee, prompt, context sources, scope, model, prompt version,
tools requested vs executed, data accessed, proposed action, confirmation, final action,
result, errors, duration, token usage and risk classification. Searchable from AI Audit.
Internal chain-of-thought is never surfaced — only concise explanations, sources, proposed
actions and results.

## Data-access boundaries + PII redaction (Phase 9b)

Before any AI-run field is persisted to `ai_runs` / `ai_tool_calls` (and therefore before it
reaches the AI Audit UI), prompt, gathered context, tool arguments and tool results pass
through `redactSecrets` (`packages/copilot/src/redact.ts`). It masks (a) object entries whose
key names a credential (token, password, secret, api_key, authorization, …) and (b)
high-confidence secret shapes in free text (Bearer tokens, JWTs, `sk-…` / AWS / GitHub /
Slack keys, and inline `key = value` credential assignments). It is a pure, cycle-safe
function and is deliberately conservative so it never mangles ordinary prose. Chain-of-thought
remains excluded entirely.

## Lifecycle + endpoints (implemented)

`copilot` module (`apps/api/src/modules/copilot`), surfaced under `/v1/copilot` (Swagger tag
`copilot`):

| Step | Endpoint | Permission | Effect |
|------|----------|-----------|--------|
| propose | `POST /runs` | `platform.dashboard.view` | plan → prepare each tool (read-only) → evaluate guardrails → store `proposed`; read-only ALLOW tools auto-run if permitted |
| confirm | `POST /runs/:id/confirm` | `platform.dashboard.view` + recent auth | re-assert per-tool `can()`, re-evaluate, dispatch through the audited human service |
| reject | `POST /runs/:id/reject` | `platform.dashboard.view` | terminal `rejected` |
| approve | `POST /runs/:id/approve` | `ai.approve_sensitive_action` + recent auth | second-approver sign-off (distinct employee) |
| read | `GET /runs`, `GET /runs/:id` | `ai.view` / `platform.dashboard.view` | cursor list + full run detail |

Run status (`AiActionStatus`): `proposed → awaiting_confirmation → confirmed → executed`, with
`rejected | expired | failed` as the off-ramps. `awaiting_confirmation` runs carry a 15-minute
`expiresAt`; critical runs additionally require typed confirmation, and second-approver runs a
prior approval. Status transitions are validated by `assertTransition` (`packages/copilot`).

## Tool registry

Each Copilot tool maps to an existing audited service — the AI reuses the human path
(`apps/api/src/modules/copilot/tool-registry.ts`):

| Tool key | Capability | Required permission | Risk | Reuses |
|----------|-----------|---------------------|------|--------|
| `institutions.suspend` | `institution_access` | `institutions.suspend` | High | `InstitutionsService.suspend` |
| `institutions.activate` | `institution_access` | `institutions.activate` | Medium | `InstitutionsService.activate` |
| `feature.kill_switch` | `feature` | `features.manage_global` | Critical | `FeatureControlsService.setKillSwitch` |
| `analysis.summarize` | `analysis` | `platform.dashboard.view` | Low | read-only (no state change) |

`prepare(args)` is read-only and builds the exact-impact preview (target, before/after, billing
impact, affected users, reversibility, the audit record that will be written). `execute(args,
ctx)` runs with `ctx.ai.aiRunId` set, so the reused service's own audit event carries
`aiInvolved: true` + the run id — there is no separate AI write path.

## Permission boundary (no AI bypass)

The Copilot never reaches further than the employee. The underlying permission is asserted
with `can()` on **every** path, not only at confirmation:

- **auto-run (ALLOW / read-only)** — `CopilotService.createRun` checks `tool.requiredPermission`
  before executing an allowed tool; a missing permission records the call as `rejected` /
  `blocked` (`decisionLayer: 'permission'`) and nothing runs.
- **confirm → execute** — `CopilotService.confirm` re-asserts each executable tool's permission
  for the confirming employee, re-evaluates guardrails server-side, and dispatches through the
  same audited service a human uses (idempotency-keyed `ai-run:<runId>:<toolCallId>`).

## Idempotency model

Financial replay protection is split by write shape and both forms are covered:

- **append-only money rows** (billing: invoices, payments, refunds, credits; AI tool execution)
  require an `Idempotency-Key` enforced by `IdempotencyService`.
- **versioned row updates** (subscriptions: credit, override-pricing, add-ons, …) are guarded
  by optimistic concurrency — a replay carries a now-stale `version` and is rejected with
  `VERSION_CONFLICT`, and any append (e.g. add-on insert) happens only after the version claim
  succeeds. No additional key is needed.

## Rate / usage limits (Phase 10b — enforced)

Per-employee and per-scope AI usage limits are enforced by `AiUsageLimiter`
(`apps/api/src/modules/copilot/ai-usage-limiter.service.ts`), checked at the top of
`CopilotService.createRun` before any planning or DB write. Two daily counters live in Redis —
one keyed on the employee, one on the resolved policy scope. Limits come from the effective
`ai_policies` row (`maxRunsPerEmployeePerDay` / `maxRunsPerDay`, migration 0010) and fall back
to the env defaults `AI_MAX_RUNS_PER_EMPLOYEE_PER_DAY` / `AI_MAX_RUNS_PER_SCOPE_PER_DAY`. A
breach is a `429 AI_RATE_LIMITED` — the AI cannot create a run past its budget, and a human
hitting the same path is throttled identically. Fail-open if Redis is unavailable
(`AI_RATE_LIMIT_ENABLED=false` disables it). Request body size is also bounded globally
(`512kb`, `apps/api/src/main.ts`) as a payload-flood guard.

> Status: rule, lifecycle and guardrail model are defined here and in `@edrion/shared-types`
> (`AiActionStatus`, `AiMode`). The `copilot` + `ai-governance` modules are implemented in
> Phase 8 on top of the existing audited service layer.
