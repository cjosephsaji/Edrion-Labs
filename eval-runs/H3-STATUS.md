# Learn eval H3 — honest status (2026-07-27)

## What was verified without a live orchestrator run

| Check | Result |
|---|---|
| Topic fixture coverage (§1.2) | **PASS** — 30 topics; kt conceptual/procedural/factual/skill ≥ 6; native reps ≥ 4; high-prereq ≥ 8; high-misconception ≥ 6; heavy-math ≥ 5 |
| DEC-16 policy unit tests | **PASS** — 4 tests in `resolve-student-tutor-policy.spec.ts` |
| Fake green skeleton removed | **DONE** — deleted hardcoded dimension literals + `cli.spec.ts` |
| Judge fail-loud without key | **ENFORCED** in `judge.ts` (`JUDGE_UNAVAILABLE`) |

## Live run not executed

Reasons (binding program constraints + env):

1. Migration `0107` is **write-only** — agent must not apply it.
2. Running API process does not yet load H1/H2 code (restart required after apply).
3. `LEARN_EVAL_SECRET` / auth cookie not set in local `.env` for this session.

## Operator steps to complete H3

```bash
# 1. Apply migrations including 0107 (operator)
pnpm db:migrate

# 2. Ensure .env has:
# LEARN_EVAL_SECRET=<shared>
# LEARN_EVAL_STUDENT_EMAIL=<dev student>   # or LEARN_EVAL_AUTH_TOKEN
# LEARN_EVAL_JUDGE_API_KEY=…               # or OPENAI_API_KEY
# LEARN_EVAL_API_BASE=http://localhost:3001/v1/student

# 3. Restart API, then:
pnpm learn-evals:core    # 24 sessions
# pnpm learn-evals:full  # 180 sessions
```

## Expected first-run outcome

**Expect `gate=fail`.** That is success for H3's purpose: an honest harness, not a green-by-construction report. Capture the JSON/MD under `eval-runs/` and re-pin a baseline only after thresholds are met.
