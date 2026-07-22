# IMPLEMENTED-EDRION-LEARN.md

Edrion Learn — full implementation record (P1–P3).

## Build status

| Phase | Status | Notes |
|-------|--------|-------|
| P1.1 Migrations + schemas | Shipped | `0096`, `0097`, `packages/schemas/src/student/edrion-learn/*` |
| P1.2 Policy domain | Shipped | `resolveStudentTutorPolicy`, `StudentTutorPolicyService` |
| P1.3 Profiles / mastery / evidence | Shipped | AI profile generation, Elo mastery, atomic evidence |
| P1.4 Orchestrator + SSE | Shipped | LLM `learn_plan` + `learn_render`, session loop, interact/ask/commit routes |
| P1.5 Independent entry + Today | Shipped | Goal provider, Library teach, Petros handoff card |
| P1.6 Session UI | Shipped | Interactive blocks, artifact rail, completion overlay, policy notices |
| P1.7 Eval gate | Shipped | `packages/learn-evals` drives orchestrator when `LEARN_EVAL_AUTH_TOKEN` set |
| P2 Institutional entries | Shipped | Report cards, exams, assignment overlap, review queue |
| P3 Institution policy + visibility | Shipped | Settings UI, staff learn panel, transcript page, audit |

## Key API routes (`/student/learn`)

- `POST /sessions` — create (all entry points)
- `GET /sessions/:id/stream` — SSE with multi-block loop
- `POST .../blocks/:blockId/answer` — MCQ + graded short text
- `POST .../blocks/:blockId/interact` — worked example, probe, synthesis
- `POST /sessions/:id/ask` — in-session free questions (max 5)
- `POST /sessions/:id/commit-artifacts` — Library flashcard commit
- `POST /sessions/:id/pause|resume|end`

## Portal (`/portal/learn-policy`)

- Policy GET/PUT with audit
- Student aggregate / session list / transcript (policy-gated)

## Student entry points

- Learning path, revision queue, goal, free-chat handoff
- Library “Teach me this” with budget picker (10/15/25 min)
- Report cards (weak marks), exams (prep)
- Today `learn_goal` obligation

## Session completion

- Path items marked complete on successful close
- Revision freshness updated on review_queue session close
- Artifact cards commit to Library decks via `ArtifactCommitService`

## Eval harness

```bash
# Structural + optional live runs
LEARN_EVAL_AUTH_TOKEN="<session cookie>" pnpm --filter @edrion/learn-evals run
pnpm --filter @edrion/learn-evals run -- --suite full --baseline <run_id>
```

## Remaining polish (non-blocking)

- Canvas embed: persist to `visual_canvases` + live GraphCanvas in session
- Offline write queue in student-web
- BullMQ mastery backfill processor (replay from attempts)
- Expand eval topic fixtures from 4 → 30 canonical topics
- CI workflow path filter for learn-evals
