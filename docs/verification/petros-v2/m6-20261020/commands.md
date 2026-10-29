# M6 verification commands and evidence

Working directory `/Volumes/Chris/Edrion Labs`. Node v24.21.0; pnpm 11.1.2. Commands ran locally. Database runs used private Unix-socket PostgreSQL clusters, never configured application targets. Their harness rejects configured database/PG variables. PostgreSQL binaries were added to PATH from `/private/tmp/verdine-pg-tools-045/Postgres.app/Contents/Versions/17/bin`. New legacy evidence writers use `PETROS_VERIFICATION_EVIDENCE_DIR` under this M6 folder. No provider audition or paid model request was made.

## Final checks

- `pnpm --filter @edrion/api build` — `commands/api-build.log`; completed exit 0.
- `PETROS_ISOLATED_VERIFICATION=1 PETROS_M4_VERIFICATION=1 PETROS_STUDIO_INSTANCE=m6-build NEXT_PUBLIC_PETROS_M4_DEMO=1 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4983 pnpm --filter @edrion/student-web build` — latest `commands/student-build-target-final.log`; earlier successful production builds retained as `student-build-acceptance.log` / `student-build-final.log`.
- `pnpm --filter @edrion/api typecheck` — `commands/api-typecheck-final.log`, exit 0 after correcting test-only reference fields/kernel version. Earlier failing and redundant/cancelled checks remain in the commands directory.
- `pnpm --filter @edrion/student-web typecheck` — successful standalone `student-typecheck-post-format.log`; current production builds also run the TypeScript validity check.
- `pnpm --filter @edrion/schemas typecheck` — `schema-typecheck.log`, exit 0.
- Focused student ESLint over `src/features/petros-v2/companion`, the Studio shell, shared presentation controller, target registry/tests and changed allocation lab/tests — `ui-lint-acceptance.log` and `companion-lint-final.log`.
- Focused API ESLint over the cue builder/tests, session service and new recorder/benchmark scripts — `api-lint-complete.log`. Zero errors; five retained Nest runtime-DI import-type warnings. Earlier script global/unused-helper warnings were fixed; failed lint logs remain.
- `git diff --check` — `diff-check.log`, exit 0. This does not check unrelated untracked files.
- Prettier used `/tmp/petros-m6-prettier.json` with the repository's semi/singleQuote/trailingComma/100-column/2-space settings. The root formatter's missing `prettier-plugin-tailwindcss` was not installed; the initial failure is retained in `format.log`. Formatting is not a claim that the original root formatter passed.

## UI and shared contracts

Broad UI command: `pnpm --filter @edrion/student-web exec vitest run src/features/petros-v2 src/features/learning-studio src/components/petros/petros-mentor.spec.tsx src/components/app-shell --reporter=json --outputFile=../../docs/verification/petros-v2/m6-20261020/commands/ui-tests.json`.

Follow-ups use `--maxWorkers=2 --minWorkers=1 --reporter=json --outputFile=...`:

- Companion directory plus `playground/teaching-playground.spec.tsx` → `ui-final-focused.json` (retired PNG assertion corrected).
- Companion directory plus `target-registry.spec.tsx` → `companion-final.json`.
- Companion directory, registry, `use-studio-experience.spec.tsx`, `learning-stage.spec.tsx`, `canvas/session-teaching.spec.tsx` → `ui-acceptance.json`.
- Companion directory, registry, `canvas/resource-allocation-lab.spec.tsx` → `ui-final-last.json`.
- Companion directory → `rig-acceptance.json` and final `target-admission-final.json`.

The final summary replaces each file's earlier result with its latest complete run, rather than adding repeated runs together. `recovery-final.json` and `capability-final.json` retain diagnostic failures fixed by stable default capabilities, correct point-clip admission and reload/target scheduling changes. A new late-target test verifies admission waits for registered geometry and follows the ordered phase deadlines.

`pnpm --filter @edrion/schemas exec vitest run src/petros-v2 src/petros-presentation.spec.ts --maxWorkers=2 --minWorkers=1 --reporter=json --outputFile=../../docs/verification/petros-v2/m6-20261020/commands/schema-tests.json` — 164 passed.

## Restricted API runs

All commands use `pnpm --filter @edrion/api exec vitest run`, `--maxWorkers=1 --minWorkers=1`, JSON reporter and their distinct output file. The initial non-opted run's skips are retained, not treated as passes.

- `PETROS_M4_DB_TESTS=1 PETROS_M5_DB_TESTS=1` with cue tests, M5 interactive/refinement, M4 assessment/privacy/boundaries/migration → `api-opted-in-tests.json`. This loaded run failed and the privacy setup could not complete.
- Same flags, `--testTimeout=30000 --hookTimeout=180000`, cue tests + M5 interactive/refinement + M4 privacy → `api-quiet-retry.json`: 231 passed, including 203 actual adversarial HTTP cases. Application/database safety limits were not loosened.
- M4 assessment and boundaries, `PETROS_M4_DB_TESTS=1 --testTimeout=30000` → `m4-final.json`: 27 passed / 1 failed. The failure is source preparation infrastructure, not relabelled as a pass.
- M1/M2/M3 source/private-review → `source-regression.json`: earlier overloaded failures retained.
- M1/M2 retry with `PETROS_M1_DB_TESTS=1 PETROS_M2_DB_TESTS=1 PETROS_TEST_REDIS_SERVER=/Users/macbook/.local/bin/redis-server --testTimeout=30000` → `source-final.json`: M1 passed; M2 has six failures and fourteen optional extension skips. The M1 fixture now compares final migration receipts to the current checked-in journal, while preserving its fixed 157-receipt baseline/rollback/V1 assertions. The M2 harness accepts an explicit existing Redis executable instead of requiring the unavailable hardcoded Homebrew path. No Redis installation was performed.
- M3 private review with `PETROS_M3_DB_TESTS=1 --testTimeout=30000` → `m3-review-retry.json`: 17 passed.
- Cue tests alone → `cue-complete.json`: 17 passed. Strict public contracts also reject character frames as commands/answers and arbitrary model/coordinate/code fields.

Latest per-file API union and every remaining failed case are recorded in `final-results.json`. It is not a full repository pass.

## Real browser recordings

Each recorder requires a new evidence directory and launches the existing Brave executable through `playwright-core`, headless. None mocks routes, injects lesson state, delays evaluation, edits video or fabricates participants. Read-only performance observers record DOM/frame timing only.

- `PETROS_M6_BROWSER_DIR=.../browser-1 PETROS_M6_BROWSER_API=http://127.0.0.1:4983 node apps/api/scripts/verify-petros-m6-browser.mjs` — 100 assertions; B had a reload timeout. Other complete takes are retained.
- Same recorder, `PETROS_M6_BROWSER_FLOW=B`, new `browser-B-retake` directory — 18/18 and zero errors; wait for DOM/controls rather than unrelated load completion.
- `PETROS_M6_SAMPLER_DIR=.../sampler-acceptance node apps/api/scripts/verify-petros-m6-sampler.mjs` — 14/14, zero errors.
- `PETROS_M6_BROWSER_DIR=.../evaluation-complete node apps/api/scripts/verify-petros-m6-evaluation.mjs` — 11/11, zero errors; all requested actual evaluation states in one continuous take plus accepted English construction.
- `PETROS_M6_BROWSER_DIR=.../long-interaction-take4 node apps/api/scripts/verify-petros-m6-long.mjs` — 74/74, zero errors, 17 cycles, 629,825ms. The recorder waits for the exact acknowledged attempt/count/observation before typing. Three prior failed diagnostic takes are preserved.
- `PETROS_M6_BROWSER_DIR=.../target-sequence node apps/api/scripts/verify-petros-m6-target.mjs` — final actual geometry/admission/phase verification; results and attention trace retained. The final per-file controller regression also covers delayed target registration.

Only selected successful continuous takes are in `recordings/A.webm`–`I.webm`. `media-audit.json` verifies source-copy hashes and original browser-context video identity. `media-metadata.json` comes from actual browser video metadata. The ten-minute take is scripted engineering interaction, with zero human participants.

## Performance and serving

- `PETROS_M6_PERF_OUTPUT=.../subsystem-performance.json pnpm --filter @edrion/api exec ts-node -r tsconfig-paths/register --transpile-only scripts/benchmark-petros-m6.ts` — read-only 2,000 cue builds/admissions from an actual public snapshot.
- `PETROS_M6_BROWSER_PERF_OUTPUT=.../input-frame-performance.json node apps/api/scripts/benchmark-petros-m6-browser.mjs` — twelve real desktop/360px controlled-field inputs, no POSTs, neutral verification face.
- Actual stop-to-closed-mouth observation is in `stop-performance.json`; network and public-cue-to-frame timing are retained alongside the actual browser takes and summarized in `final-results.json`.
- Final disposable demo: `PETROS_M5_EVIDENCE_DIR=.../demo-final PETROS_M5_API_PORT=4983 PETROS_M5_WEB_PORT=4984 pnpm --filter @edrion/api exec ts-node -r tsconfig-paths/register --transpile-only scripts/serve-petros-m5.ts` with the private PostgreSQL binary path above. Existing M5 fixture services are reused, not a second tutor/backend.
- Web: `PETROS_ISOLATED_VERIFICATION=1 PETROS_M4_VERIFICATION=1 PETROS_STUDIO_INSTANCE=m6 NEXT_PUBLIC_PETROS_M4_DEMO=1 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4983 NEXT_PUBLIC_API_URL=http://127.0.0.1:4983 pnpm --filter @edrion/student-web exec next dev --hostname 127.0.0.1 -p 4984`.
- Gallery: `python3 -m http.server 4985 --bind 127.0.0.1 --directory docs/verification/petros-v2/m6-20261020`.

The final API was restarted from current source into a new disposable fixture directory after recordings completed. Recorded public snapshots remain preserved. Bootstrap URLs establish each synthetic actor's new cookie. Old 4964/4974 review instances were not reset.

## Original artwork restoration — 21 October

User decision: reject the new artwork and continue using originals. Current results are in `original-artwork-restoration.json`; prior engineering results and failed diagnostics are retained separately.

- Student workspace: `pnpm exec vitest run src/features/petros-v2/companion src/features/petros-v2/playground src/features/petros-v2/studio src/components/petros/petros-avatar.spec.tsx --reporter=json --outputFile=../../docs/verification/petros-v2/m6-20261020/original-artwork-tests-final.json` — exit 0, 167 passed.
- Student workspace: `pnpm typecheck` — exit 0, log `commands/original-artwork-typecheck.log`.
- Focused student ESLint — exit 0, log `commands/original-artwork-lint-final.log`.
- API workspace: `PETROS_ORIGINAL_EVIDENCE_DIR=…/original-artwork-browser-accepted pnpm exec node scripts/verify-petros-original-artwork.mjs` — exit 0, 51 checks, no page errors.
- API workspace: `PETROS_M6_BROWSER_DIR=…/original-target-browser pnpm exec node scripts/verify-petros-original-target.mjs` — exit 0, 10 checks, no page errors.
- Post-restoration SHA-256 preservation audit — 37 original assets and 3,692 historical evidence files unchanged.
- Earlier `original-artwork-tests.json` captured three outdated artwork expectations, then updated to match the user-selected original renderer. Both JSONs remain. Earlier browser directories preserve hydration/access-gate diagnostic failures; only the accepted retake is counted.
