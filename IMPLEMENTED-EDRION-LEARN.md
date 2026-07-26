# Edrion Learn — Implementation Record

Execution against `PLAN-EDRION-LEARN.md` (Tier 2 Track A).

## Tier 3 program gate

| Check | Status |
|---|---|
| Required for Debate / Tier 3 Track A | **YES** |
| Plan acceptance P1.1–P1.7 (+ P2/P3 behind flags) | **YES — Tier 2 Learn closed** |

## Migrations

| File | Phase |
|---|---|
| `0097_edrion_learn_orchestrator.sql` | P1.1 |
| `0100_learn_student_tutor_policy.sql` | P1.2 |

## Phases

| Phase | Status |
|---|---|
| P1.1 | Done |
| P1.2 | Done |
| P1.3 | Done — mastery engine, evidence writer, repository |
| P1.4 | Done — orchestrator API, SSE, answers, end |
| P1.5 | Done — Today study_block, indie entry UI |
| P1.6 | Done — `OrchestratorSessionDocument` + orchestrator session route |
| P1.7 | Done — `@edrion/learn-evals` core + full 180 deterministic suite |
| P2 | Done — context entry points via `session_context` + institutional hooks (flag-gated) |
| P3 | Done — `student_tutor` policy domain + institution resolver (UI optional) |

Legacy `/student/learn/sessions` retained for Petros/quick parity only; new teaching uses `/student/edrion-learn/sessions` behind `learn.orchestrator`.

## Tests

```bash
pnpm --filter @edrion/schemas test src/student/edrion-learn/
pnpm --filter @edrion/copilot test
pnpm --filter @edrion/api test src/modules/student/edrion-learn/
pnpm learn-evals run --suite full
```
