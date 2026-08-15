# Petros Stage 5 handoff

Date: 2026-08-09  
Branch: `new-student-UI`  
Status: **Stage 5 complete**

The quality harness, protected fixture baseline, live gateway execution, independent judge,
metering, reports, dashboard, exports, permissions, and audit controls are implemented. The live
persona driver now feeds deterministic policy observations through the production-like loop. The
production Stage 3 recovery policy exercises hint → missing step → worked solution → reworded
success, and PLAN receives the resulting answer/confidence/question evidence without receiving the
persona label. A post-fix 16-session fixture smoke passed, and a focused provider-backed live run
cleared the repeated-struggle blocker with `stuck_recovery=5/5`.

## Post-fix acceptance evidence

- Fixture run: `petros-stage5-postfix-fixture-v1`
  - Matrix: four cases × four personas = 16 completed sessions
  - Result: `gate=pass`, no blocking failures, no warnings, zero provider cost
  - JSON: `packages/learn-evals/eval-runs/petros-quality/petros-stage5-postfix-fixture-v1.json`
- Focused live run: `petros-stage5-postfix-live-focus-v1`
  - Case/persona: Integration by Parts × `repeated_struggle`
  - Provider/model: `openai-live-eval` / `gpt-5-mini-2025-08-07`
  - Result: `gate=warn`, mean `4.12/5`, no blocking failures
  - Critical result: `stuck_recovery=5/5`; exact hint → missing step → worked solution →
    reworded success sequence, followed by a correct evidence-linked observation
  - Non-blocking warnings: no artifact proposal and weak guess-first evidence in this narrow session
  - Usage: 93,721 input tokens, 6,871 output tokens, 122,830 ms, 26,345 micro-USD
  - Isolation: `syntheticOnly=true`, `productionWrites=0`, `source=environment=evaluation`
  - Imported run ID: `879ba2e0-eb52-4dab-a0a2-885444cd763d`
  - JSON: `packages/learn-evals/eval-runs/petros-quality/petros-stage5-postfix-live-focus-v1.json`
  - Human report: `packages/learn-evals/eval-runs/petros-quality/petros-stage5-postfix-live-focus-v1.md`
  - CSV: `packages/learn-evals/eval-runs/petros-quality/petros-stage5-postfix-live-focus-v1.csv`

The earlier full live run remains immutable failure evidence. Its other 12 sessions had no blocking
failure. The post-fix full fixture matrix verifies the new driver across all four repeated-struggle
cases, while the focused live candidate proves the repaired path through the configured gateway and
judge without paying to repeat unaffected live cells.

## Earlier full live smoke evidence

- Run: `petros-stage5-live-smoke-v1`
- Matrix: four cases × four personas = 16 completed sessions
- Provider/model: `openai-live-eval` / `gpt-5-mini-2025-08-07`
- Result: `gate=fail`, mean `4.39/5`, four blocking repeated-struggle sessions
- Main-run usage: 1,423,199 input tokens, 101,697 output tokens, 1,109,607 ms, 303,288 micro-USD
- Function reconciliation:
  - `teaching.next_action.select`: 48 successful requests, 141,454 micro-USD
  - `teaching.block.render`: 48 successful requests, 80,200 micro-USD
  - `evaluation.teaching_quality.judge`: 16 successful requests, 81,634 micro-USD
- Isolation: `syntheticOnly=true`, `productionWrites=0`, `analyticsSource=evaluation`
- Imported run ID: `392e146e-92d3-486c-a4f3-efa54a628127`
- JSON: `packages/learn-evals/eval-runs/petros-quality/petros-stage5-live-smoke-v1.json`
- Human report: `packages/learn-evals/eval-runs/petros-quality/petros-stage5-live-smoke-v1.md`
- CSV: `packages/learn-evals/eval-runs/petros-quality/petros-stage5-live-smoke-v1.csv`

The immutable fixture baseline was not replaced. Promotion of the failing live run returns
`409 PETROS_BASELINE_PROMOTION_FORBIDDEN` and is disabled in the dashboard. The one-session focused
candidate was imported for review but deliberately not promoted over the trustworthy 16-session
fixture baseline.

## Spend ceiling

The earlier full live run metered 303,288 micro-USD. Provider-wide metered spend including
connectivity and preflight calls was 363,975 micro-USD before the fix. The post-fix focused run added
26,345 micro-USD, bringing provider-wide metered spend to 390,320 micro-USD. The focused run's CLI
cap was 30,000 micro-USD and it stayed below that limit.

Eight preflight/main attempts were historically recorded with zero usage when a provider response
failed local validation. The gateway now preserves tokens and estimated cost on validation and
post-response cost failures. The completed report remains immutable, so those old rows are not
rewritten. A conservative bound using all eight calls at the configured 32,000 input / 1,800 output
maximum and the pinned model rates adds at most 92,800 micro-USD. Including the post-fix run, the
conservative upper bound is 483,120 micro-USD—still below the user-approved 500,000 micro-USD
ceiling. No full replacement live matrix was purchased because it would have exceeded that ceiling.

## Manual acceptance completed

1. The owner opened `/ai/petros-quality` and verified the imported live run, `fail` gate, 16/16
   sessions, $0.3033 cost, versions, comparison regressions, diagnostics, JSON/CSV links, and
   disabled promotion.
2. Gate=`fail` and mode=`live` reduced the run list to the live smoke. Persona=`repeated_struggle`,
   function=`evaluation.teaching_quality.judge`, provider=`openai-live-eval`, and
   model=`gpt-5-mini-2025-08-07` produced the expected four matrix rows.
3. The Integration by Parts repeated-struggle cell showed three typed moves, evidence-linked scores,
   uncertainty, judge rationale, and the blocking incomplete-ladder diagnostic.
4. `/ai/petros-routing` showed one ready provider, three configured functions, $0.364 total cost,
   eight failed attempts, and the function split: PLAN $0.1804, RENDER $0.0957, judge $0.0879.
5. A zero-spend provider-pause drill initially exposed a generic 500. After the gateway fix it
   returned `502 PETROS_NO_CAPABLE_ROUTE` with `failureType=infrastructure` and
   `routingCode=NO_CAPABLE_ROUTE`. The provider was restored healthy/unpaused and spend did not move.
6. Access checks returned 401 for unauthenticated and ordinary-student identities and 200 for the
   platform owner. The failing-run promotion guard returned 409.
7. Export checks returned the immutable 16-session JSON and a 241-record CSV (header plus 240
   dimension rows).
8. The post-fix focused live report was imported as run
   `879ba2e0-eb52-4dab-a0a2-885444cd763d`. Its transcript contains seven typed moves, including the
   complete four-rung recovery ladder; `stuck_recovery=5/5`, blocking failures are empty, and the
   final reworded observation is correct.
9. AI Routing reconciled the cumulative period to 390,320 micro-USD: PLAN 193,296, RENDER 101,410,
   and evaluator 95,614 micro-USD. The focused report itself reconciles to 26,345 micro-USD.

## Human QA runbook

| Check | Navigation / command and fixture | Expected frontend | Expected backend/report | Failure criteria | Evidence to save |
|---|---|---|---|---|---|
| Fixture smoke/resume | `pnpm --filter @edrion/learn-evals run:smoke`; interrupt once, rerun with the emitted `--resume` run ID | Dashboard eventually shows 16/16 and a non-live mode | State file resumes idempotently; `productionWrites=0`; JSON/MD/CSV exist | Duplicate sessions, production IDs, or different output for the same seed | Run ID plus JSON/MD/CSV |
| Live cost preview | `pnpm --filter @edrion/learn-evals estimate:live`; then an explicitly confirmed small `run --mode live --confirm-live` | Run cost and live badge are visible | Requested maximums precede provider calls; source/environment are `evaluation` | Provider call before confirmation, missing cap, or production usage | Estimate output, report limits, routing usage row |
| Baseline comparison | Open the fixture baseline and deliberate repetition candidate in `/ai/petros-quality` | Totals, topic/persona cells, regressions and low-sample markers agree with the reports | Baseline ID is immutable; comparison deltas reproduce | Silent baseline replacement or sign-reversed delta | Candidate JSON and one improvement/regression cell |
| Deliberate bad prompt | Run the safe `repetitive_moves` mutation, then restore the normal prompt | `Deliberate repetition regression` is `fail` | Repetition/product regression is blocking and fixture prompt is restored | Candidate passes or mutation remains active | Mutation report and restored version ID |
| Variety review | Open the four smoke topics in the matrix | Typed move sequences differ visibly across math, science, history, and code | Variety score evidence cites the displayed move IDs | Same template sequence across topics or unlinked score | Four session IDs and move-type sequences |
| Stuck review | Open fixture baseline × `repeated_struggle` | Transcript shows hint → missing step → solution → reworded success | Stuck rubric cites those exact moves and ends in success | Missing rung, no success, or fabricated evidence ID | Session JSON and dashboard drill-down |
| Judge review | Open several score cards in a live or fixture run | Rationale and uncertainty are shown; hidden reasoning/provider secrets are absent | Exactly 15 schema-valid dimensions with evidence IDs | Unexplained number, missing dimension, or credential/provider leakage | Session score export |
| Failure/retry | Pause the judge provider through the authorized routing API, call `/v1/petros-quality/judge`, restore in a guaranteed cleanup | Failed/incomplete diagnostic is infrastructure/judge, not product | 502 classified route failure; pause/restore audit; no spend for no-call failure | Generic 500, false product regression, provider left paused, or spend increase | Error envelope, two audit rows, provider health/cost snapshot |
| Quality dashboard | `/ai/petros-quality`; exercise gate/mode/version/topic/persona/function/provider/model filters and exports | Filters, matrix, transcript, versions, costs, latency, diagnostics, exports, and promotion controls work | Detail/export APIs match the selected immutable run | Filter mismatch, missing evidence, or promotable failing run | DOM capture plus JSON/CSV |
| AI Routing reconciliation | `/ai/petros-routing` → `Usage & budgets` and query usage by report request IDs | Total and function split match within display rounding | Request IDs reconcile to PLAN/RENDER/judge totals and `evaluation` metadata | Unattributed usage, mixed production source, or cost mismatch | SQL aggregate and routing page values |
| Access control | Request run detail/export/promotion unauthenticated, as an institution/student identity, and as an authorized owner | Only an authorized platform employee can see the surface or controls | 401/403 for unauthorized identities; 200 for owner; audited mutation attempts | Synthetic transcript visible outside Super Admin | Status matrix and audit lookup |

## Verification

- `pnpm --filter @edrion/api test` — 51 files, 324 tests passed.
- `pnpm --filter @edrion/api typecheck` — passed.
- Targeted Petros quality/loop/observation suite — 3 files, 28 tests passed.
- Targeted routing/gateway/validator suite — 3 files, 12 tests passed.
- `pnpm --filter @edrion/api build` — passed.
- `pnpm --filter @edrion/learn-evals test` — 17 tests passed.
- `pnpm --filter @edrion/learn-evals typecheck` — passed.
- `pnpm --filter @edrion/learn-evals check-fixtures` — corpus coverage passed.
- `pnpm --filter @edrion/schemas exec vitest run src/petros-quality.spec.ts` — 2 tests passed.
- `pnpm --filter @edrion/schemas typecheck` — passed.
- `pnpm --filter @edrion/super-admin-web typecheck` — passed.
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:3007 pnpm --filter @edrion/super-admin-web build` — passed, including Next build lint/type validation and 31/31 static pages.
- `petros-stage5-postfix-fixture-v1` — 16/16 passed, `gate=pass`, cost 0.
- `petros-stage5-postfix-live-focus-v1` — 1/1 completed, `gate=warn`, blocking 0,
  `stuck_recovery=5/5`, cost 26,345 micro-USD.
- The repository-wide schema suite currently has 307 passing tests and two unrelated existing
  failures in `student/exam-questions.spec.ts`; neither touches the Petros quality contract.
- Standalone API lint is blocked because the workspace cannot resolve an `eslint` binary.
- Standalone `next lint` opens Next.js's first-time configuration prompt; it was cancelled rather
  than mutating repository lint configuration. The production Next build's lint/type phase passed.

## Stage 6 entry prerequisites

1. Keep the selected 16-session fixture baseline immutable unless a full, deliberately reviewed
   non-failing candidate is promoted with an audit reason.
2. Run Stage 5 comparisons for Stage 6 learner-model changes and block any correctness,
   stuck-recovery, safety, provider-leakage, tenant-isolation, schema, or Socratic-cap regression.
3. Preserve synthetic evaluation isolation; do not write persona assumptions into production
   learner models.

All Stage 6 entry blockers from the failed live smoke are cleared.

**Stage 5 complete.**
