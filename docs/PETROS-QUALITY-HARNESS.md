# Petros Stage 5 quality harness

## Scope and safety contract

The harness evaluates PLAN → RENDER → OBSERVE sessions, not chat eloquence. Its frozen corpus is
`petros-quality-corpus.v1`: 30 Edrion-authored CC0 synthetic cases spanning four knowledge types,
five representations, four goals, grade bands, mathematical/nonmathematical subjects, prerequisite
and misconception density, and one Hinglish case. Eight deterministic policies model interaction
behavior: fast/confident, slow/careful, confidently wrong, disengaged/skipping, weak prerequisites,
relevant detour, unsure/correct, and repeated struggle.

Every transcript has `source=environment=evaluation`, `synthetic=true`, and no student foreign key.
Fixture mode makes no network calls and costs $0. Live mode requires `--confirm-live`, uses only the
Petros gateway, emits evaluation metadata/correlation IDs, and is constrained by the CLI limits plus
AI Routing function/provider budgets. Never put production student exports, provider credentials,
or copyrighted textbook passages into a case.

## Developer commands

```bash
# Deterministic smoke: 4 topics × 4 high-signal personas = 16 sessions
pnpm --filter @edrion/learn-evals run:smoke

# All eight personas on the canonical four topics
pnpm --filter @edrion/learn-evals run:core

# Full 30 × 8 corpus (fixture mode, still $0)
pnpm --filter @edrion/learn-evals run:full

# Cost preview only; makes no model calls
pnpm --filter @edrion/learn-evals exec tsx src/cli.ts estimate \
  --suite smoke --mode live --max-cost-micros 500000 --max-tokens 100000

# Deliberate, metered live subset after reviewing the preview
PETROS_QUALITY_API_BASE=http://localhost:3001/v1 \
PETROS_QUALITY_EMPLOYEE_EMAIL='owner@edrion.dev' \
pnpm --filter @edrion/learn-evals exec tsx src/cli.ts run \
  --suite smoke --mode live --confirm-live \
  --max-cost-micros 500000 --max-tokens 100000 --max-duration-ms 900000

# Compare candidate against an immutable selected report
pnpm --filter @edrion/learn-evals exec tsx src/cli.ts run \
  --suite smoke --mode fixture --baseline eval-runs/petros-quality/BASELINE.json

# Resume the exact run after an interruption
pnpm --filter @edrion/learn-evals exec tsx src/cli.ts run \
  --suite smoke --mode fixture --run-id RUN_ID --resume

# Safe deliberate defect; fixture mode only
pnpm --filter @edrion/learn-evals exec tsx src/cli.ts run \
  --suite smoke --mode fixture --mutation repetitive_moves \
  --allow-deliberate-regression --baseline eval-runs/petros-quality/BASELINE.json
```

`PETROS_QUALITY_EMPLOYEE_EMAIL` is accepted only when the API development identity header is
explicitly enabled. Deployed evaluation workers instead set `PETROS_QUALITY_SESSION_COOKIE` to an
Edrion API session-cookie value and may override its default name with
`PETROS_QUALITY_SESSION_COOKIE_NAME`. Neither path accepts provider keys or arbitrary bearer tokens.

Reports are written as JSON, Markdown, CSV, and a resumable state file under
`eval-runs/petros-quality/`. The state file is not a baseline. A baseline changes only through the
explicit CLI `promote` command or Super Admin confirmation; both require a reason and create audit
metadata. Imported run IDs are immutable.

## Manual QA and dashboard acceptance

Apply migrations `0190_petros_quality_harness` and `0191_petros_quality_seed_bigint`, start API and Super Admin, and sign in with `ai.view`
for inspection and `ai.configure` for import, rerun, judge, and baseline promotion. Students and
institution roles have neither permission and must receive 403.

| Check | Navigation / command and fixture | Expected frontend | Expected backend / report | Failure criteria | Evidence to save |
|---|---|---|---|---|---|
| 1. Smoke, resume, isolation | Run `run:smoke`; interrupt a second named run after a batch and rerun with `--resume` | `/ai/petros-quality` lists an imported run with 16 matrix cells; typed moves, not chat bubbles | JSON/MD/CSV/state exist; resumed count is nonzero; `productionWrites=0`; no student FK/table changes | Missing report, duplicate sessions, nondeterministic replay, or any production learner write | CLI output, report hash, run detail screenshot, DB counts before/after |
| 2. Live cost preview | Run `estimate --suite smoke --mode live --max-cost-micros 500000 --max-tokens 100000`, then explicitly confirmed live run | Preview states maximum $0.50 before execution; run shows spend and live mode | Every teaching/evaluator usage event carries source/environment `evaluation`, run correlation ID, independent function key, and respects route budgets | Calls begin before confirmation; run exceeds token/cost/time cap; missing evaluation source | Preview JSON, AI Routing usage filtered by correlation ID, run totals |
| 3. Baseline comparison | Open a candidate with `--baseline` | Summary shows total/dimension deltas, improvements, regressions, and low-sample badges; matrix cells drill down | `comparison.baselineRunId` and candidate ID match; deltas reconcile to raw session scores | False precision on low samples, mismatched totals, missing evidence | One improvement and one regression calculation with move IDs |
| 4. Deliberate bad prompt | Run fixture mutation `repetitive_moves` or `factual_defect` with the explicit safe flag; do not change production prompts | Candidate gate visibly fails/warns and identifies repetition/correctness | Regression points to exact move/block evidence; baseline file is unchanged | Defect passes, baseline mutates, or test content reaches a learner | Candidate report, baseline checksum before/after, diagnostic screenshot |
| 5. Four-topic variety | Core run; filter integration by parts, photosynthesis, French Revolution, Python loops | Typed sequences visibly differ (symbolic procedure, visual misconception, causal story, coding procedure) | Structural-variety scores and expected-move coverage align with sequences | Identical/template-rhyming sequences or diversity contradicts visible moves | Four transcript screenshots and dimension evidence |
| 6. Repeated struggle | Filter persona `repeated_struggle` | Exact sequence shows hint → missing step → worked solution → reworded success | Final observation is correct and score evidence links all four move IDs | Missing rung, ending in failure, or unlinked score | Transcript and `stuck_recovery` evidence JSON |
| 7. Judge review | Open several live rubric cells | Score, concise rationale, uncertainty, evaluator, and evidence IDs appear; no chain-of-thought | 15 unique dimensions validate; evaluator usage uses `evaluation.teaching_quality.judge`; disagreements remain visible | Single unexplained number, duplicate/missing dimension, hidden reasoning/credential | Judge responses, usage IDs, dashboard detail |
| 8. Judge failure/retry | Pause the evaluator primary route or configure a temporary malformed-output test route, then run one live case; restore route afterward | Run diagnostics label judge failure separately, while deterministic product scores remain | Gateway retries/fallbacks/validation failures are metered; no false product regression | Judge outage becomes a product failure, invalid JSON is accepted, or failure is hidden | Route audit, usage attempts, run diagnostics |
| 9. Quality dashboard | `/ai/petros-quality`; exercise gate/mode/version/topic/persona/function/provider/model filters, session drill-down, JSON/CSV exports, rerun, promotion confirmation | Runs, versions, spend, dimension bars, comparison, matrix, typed transcript, errors and controls are keyboard reachable | Exports match stored report; rerun creates audit intent only; promotion retires prior selection and writes audit | Filter mismatch, unauthorized mutation, silent promotion, inaccessible controls | Desktop/mobile screenshots, exported JSON/CSV, audit rows |
| 10. AI Routing reconciliation | `/ai/petros-routing` → Usage & budgets; filter function/correlation ID used by live run | Teaching and evaluator functions/costs appear separately | Sum request IDs/tokens/costs against quality run; provider/model stays internal only | Unmetered judge/teaching call or totals cannot be traced | Usage export plus reconciliation worksheet |
| 11. Access control | Request list/detail/export as a student, institution user, `ai.view`, and `ai.configure` role | Student/institution: no nav and 403; view role reads only; configure role sees audited mutations | Global permission guard enforces `ai.view`/`ai.configure`; denied access creates normal security/audit evidence | Synthetic transcript or baseline controls exposed outside platform AI roles | 403 responses, role matrix, audit/security logs |

## Regression policy

Correctness, stuck recovery, safety/provider leakage, tenant isolation, schema validity, and the
two-probe cap are blocking. Variety, pacing, artifact ownership, language, explainability, cost, and
latency are warnings unless a configured threshold promotes them. Comparisons aggregate by total,
dimension, topic, persona, function, and failure class. Fewer than five comparable samples is marked
noisy rather than treated as statistically certain.

## Stage 6 entry gate

Before structured learner modeling, select and audit a trustworthy Stage 5 baseline; complete the
manual access, live-cost, judge-failure, four-topic variety, and repeated-struggle checks; reconcile
all live usage; and prove a deliberate personalization regression is detected. Stage 5 stores only
synthetic evaluation data and must not be repurposed as a learner model.
