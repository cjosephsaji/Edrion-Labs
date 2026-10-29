# Reproduction and command record

Run from `/Volumes/Chris/Edrion Labs` unless the API workspace is specified. Node 24.21.0, pnpm 11.1.2, existing dependencies. No installations or configured database migrations. `final-results.json` records completion statuses and latest-per-file counts; original failed runs remain in their own JSON/log files.

## Frontend

```sh
pnpm --filter @edrion/student-web exec vitest run src/features/petros-v2 src/features/learning-studio/target-registry.spec.tsx src/features/learning-studio/use-teaching-playback.spec.tsx src/components/petros/petros-avatar.spec.tsx src/components/petros/petros-mentor.spec.tsx src/components/petros/petros-compatibility-surfaces.spec.tsx --maxWorkers=2 --minWorkers=1 --reporter=json --outputFile=<NEW-ABSOLUTE-JSON-PATH>
pnpm --filter @edrion/student-web exec vitest run src/features/petros-v2/companion src/features/petros-v2/use-petros-session.spec.tsx src/features/learning-studio/target-registry.spec.tsx --maxWorkers=1 --minWorkers=1 --reporter=json --outputFile=<NEW-ABSOLUTE-JSON-PATH>
pnpm --filter @edrion/student-web typecheck
pnpm --filter @edrion/api typecheck
```

The broad run is `ui-final.json`; subsequent complete focused files replace, rather than add to, its same-file counts. `ui-final-geometry.json` covers the final rounded-target policy. Initial focused and diagnostic outputs remain available. Final student/API typecheck logs and completion statuses are separate.

Final complete-file replacements: `ui-strict-mode.json` (102 passes), then `ui-pause-final.json` (five passes across the registry and new paused-shell files). Latest frontend union: 342 passes. The paused-shell run is reproduced with `vitest run src/features/petros-v2/petros-session-shell.spec.tsx src/features/learning-studio/target-registry.spec.tsx --maxWorkers=1 --minWorkers=1 --reporter=json --outputFile=<NEW-ABSOLUTE-JSON-PATH>`.

## API unit/integration

```sh
pnpm --filter @edrion/api exec vitest run src/modules/student/petros-v2/petros-companion-cues.spec.ts src/modules/student/petros-v2/petros-performance.spec.ts --maxWorkers=1 --minWorkers=1 --reporter=json --outputFile=<NEW-ABSOLUTE-JSON-PATH>
```

API workspace: `/Volumes/Chris/Edrion Labs/apps/api`. Integration additionally uses:

```sh
PATH=/private/tmp/verdine-pg-tools-045/Postgres.app/Contents/Versions/17/bin:$PATH
PETROS_M4_DB_TESTS=1
PETROS_M5_DB_TESTS=1
PETROS_LOCAL_OCR_MANIFEST='/Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m6-functional-20261021/ocr-runtime-manifest.json'
PETROS_LOCAL_OCR_MANIFEST_SHA256=991d40ffb97cc45fff08c0d8d1c3e70c4fe4cf2345164f4c406e2593b7fbb51a
PETROS_VERIFICATION_EVIDENCE_DIR=<NEW-ABSOLUTE-EVIDENCE-DIRECTORY>
pnpm exec vitest run src/modules/student/petros-v2/petros-v2-privacy.integration.spec.ts src/modules/student/petros-v2/petros-v2-boundaries.integration.spec.ts src/modules/student/petros-v2/petros-m5-interactive.integration.spec.ts src/modules/student/petros-v2/petros-m5-refinement.integration.spec.ts src/modules/student/petros-v2/petros-v2-assessment.integration.spec.ts src/modules/student/petros-v2/petros-v2-reliability.integration.spec.ts --maxWorkers=1 --minWorkers=1 --testTimeout=30000 --hookTimeout=180000 --reporter=json --outputFile=<NEW-ABSOLUTE-JSON-PATH>
```

These are environment variables on that invocation, not global shell or application `.env` changes. The private fixture creates/migrates only its allocated PostgreSQL cluster. The existing explicit OCR pins are reused; no provider is invoked.

The six-file integration run recorded one existing 120000ms test timeout. With the same environment and unchanged test limit, the complete `src/modules/student/petros-v2/petros-m5-refinement.integration.spec.ts` file passed 3/3 in `integration-quiet.json`. The latest API union, including the twenty unit tests, is 1265 passes. Original failed outputs are not overwritten.

## Actual browser recorders

API workspace; set `PETROS_M6_BROWSER_API=http://127.0.0.1:4993`. Every output directory must be new.

```sh
PETROS_M6_BROWSER_DIR=<NEW-DIR> pnpm exec node scripts/verify-petros-original-long.mjs
PETROS_M6_BROWSER_DIR=<NEW-DIR> pnpm exec node scripts/verify-petros-original-evaluation.mjs
PETROS_M6_BROWSER_DIR=<NEW-DIR> pnpm exec node scripts/verify-petros-original-target.mjs
PETROS_M6_BROWSER_WEB=http://127.0.0.1:4994 PETROS_M6_SAMPLER_WEB=http://127.0.0.1:4984 PETROS_M6_BROWSER_FLOW=A,E,G PETROS_M6_BROWSER_DIR=<NEW-DIR> pnpm exec node scripts/verify-petros-m6-refinement.mjs
PETROS_M5_BROWSER_API=http://127.0.0.1:4993 PETROS_M5_BROWSER_FLOW=A,E,F PETROS_M5_FINAL_BROWSER_DIR=<NEW-DIR> pnpm exec node scripts/verify-petros-m5-vm-final.mjs
PETROS_M6_PERF_OUTPUT=<NEW-JSON> pnpm exec node scripts/benchmark-petros-m6-path.mjs
```

Run same-actor scenarios sequentially. The spatial and target recorders both use the disposable `companion` actor. The HTTP benchmark uses `cloud-a`, the full Cloud recorder `cloud-b`, mobile VM `mobile`, English editing `argument-preview`, independent English results `english`, and long behavior `reduced`. A canceled simultaneous target take is preserved and not selected.

The final private API is started with a minimal credential-free environment, `PETROS_M6_TIMING=1`, `PETROS_M5_API_PORT=4993`, `PETROS_M5_WEB_PORT=4994`, the existing Redis executable and OCR pins, and a new `PETROS_M5_EVIDENCE_DIR`. `pnpm exec ts-node -r tsconfig-paths/register --transpile-only scripts/serve-petros-m5.ts` creates the disposable fixture. The new student instance uses isolated Next output (`PETROS_ISOLATED_VERIFICATION=1`, `PETROS_M4_VERIFICATION=1`, `PETROS_STUDIO_INSTANCE=m6-original-animation`, `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4993`) and loopback port 4994. Its sampler route deliberately retains its verification gate; the existing qualified isolated sampler at 4984 is used for art review. No gate is removed.

Raw browser recordings are copied without editing. Scripts do not inject application state, mock HTTP, choose a correctness cue, force an evaluator result, delay evaluation or splice video. Read-only DOM/performance observers are identified in their sources. Actual browser error screenshots and first takes remain alongside accepted takes.

Final current takes: `PETROS_M6_BROWSER_FLOW=E` from the refinement recorder → `spatial-pause-accepted` (26 checks); then the original-target recorder → `target-current` (ten checks), sequentially on the companion actor. `python3 <EVIDENCE>/package-evidence.py` derives the test union, timing summaries, exact raw-copy media hashes, original/preservation audit and review HTML from saved outputs. The gallery is served only on loopback with `python3 -m http.server 4995 --bind 127.0.0.1 --directory <EVIDENCE>`.

## Formatting/lint

The root formatter initially failed because its configured Tailwind plugin is unavailable. No dependency was installed. `format-config.json` copies the same base formatting options with no plugin; it was explicitly supplied via `pnpm exec prettier --config <EVIDENCE>/format-config.json --write <SCOPED-FILES>`. Scoped files are in `lint-files.json`; final ESLint uses that list. Nest constructor type imports are deliberately retained for runtime injection metadata. Final lint has no errors and records its warnings.
