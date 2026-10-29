# Functional continuation commands — 21 October

All commands ran in the shared workspace on macOS, Node 24.21.0 and pnpm 11.1.2. No configured database, deployment, paid provider or user account data was used. PostgreSQL/Redis fixtures used private disposable Unix sockets. New evidence writers were redirected here with `PETROS_VERIFICATION_EVIDENCE_DIR`.

API workspace: `/Volumes/Chris/Edrion Labs/apps/api`.

Database commands prepend the existing PostgreSQL path:

```sh
PATH=/private/tmp/verdine-pg-tools-045/Postgres.app/Contents/Versions/17/bin:$PATH
```

Configured OCR verification uses this explicit pair (no global `.env` changes):

```sh
PETROS_LOCAL_OCR_MANIFEST='/Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m6-functional-20261021/ocr-runtime-manifest.json'
PETROS_LOCAL_OCR_MANIFEST_SHA256=991d40ffb97cc45fff08c0d8d1c3e70c4fe4cf2345164f4c406e2593b7fbb51a
```

| Check | Invocation / evidence | Outcome |
|---|---|---|
| Original intermittent assessment failure | `PETROS_M4_DB_TESTS=1 pnpm exec vitest run src/modules/student/petros-v2/petros-v2-assessment.integration.spec.ts --maxWorkers=1 --minWorkers=1 --testTimeout=30000 --hookTimeout=180000` | 21 passed; `assessment-reproduction.json` |
| Real bounded OCR | `pnpm exec vitest run src/modules/student/knowledge/petros-content-ocr.spec.ts --maxWorkers=1 --minWorkers=1` with explicit OCR pins | 3 passed; `ocr-initial.json` |
| Runtime admission and actual OS denial probe | `pnpm exec vitest run src/modules/student/knowledge/petros-ocr-runtime.spec.ts --maxWorkers=1 --minWorkers=1` | 7 passed; `ocr-runtime-security-final.json` |
| Base source/queue regression | `PETROS_M2_DB_TESTS=1 PETROS_TEST_REDIS_SERVER=/Users/macbook/.local/bin/redis-server pnpm exec vitest run src/modules/integrations/petros-m2-document-understanding.integration.spec.ts --maxWorkers=1 --minWorkers=1 --testTimeout=30000 --hookTimeout=180000` with OCR pins | 9 passed, 14 optional skips; `source-verified.json` |
| Companion, M5, assessment, boundaries and HTTP privacy | `PETROS_M4_DB_TESTS=1 PETROS_M5_DB_TESTS=1 pnpm exec vitest run src/modules/student/petros-v2/petros-companion-cues.spec.ts src/modules/student/petros-v2/petros-m5-interactive.integration.spec.ts src/modules/student/petros-v2/petros-m5-refinement.integration.spec.ts src/modules/student/petros-v2/petros-v2-assessment.integration.spec.ts src/modules/student/petros-v2/petros-v2-boundaries.integration.spec.ts src/modules/student/petros-v2/petros-v2-privacy.integration.spec.ts --maxWorkers=1 --minWorkers=1 --testTimeout=30000 --hookTimeout=180000` with OCR pins | 259 passed, one M5 timeout; retained in `functional-final.json` |
| Complete quiet M5 refinement rerun | Same flags, only `src/modules/student/petros-v2/petros-m5-refinement.integration.spec.ts` | 3 passed; `m5-quiet.json`. Original 120-second case limit unchanged; formerly timed-out case finished in 63,513ms. |
| API typecheck/build | `pnpm typecheck`; `pnpm build` | Both exit 0; logs in `commands/` |
| Focused lint | ESLint over new/changed OCR/runtime, worker, source service/integration fixture and recorder/pin scripts | Exit 0; `complete-lint.log` and `source-lint.log` |
| Pin reproducibility | `node scripts/pin-petros-local-ocr-runtime.mjs /private/tmp/petros-m6-ocr-runtime …/ocr-runtime-manifest-reproduced.json 5.5.1` | Same manifest SHA-256; 35 private dylibs |
| Continuous learning recording | `PETROS_M6_BROWSER_DIR=…/original-long-interaction pnpm exec node scripts/verify-petros-original-long.mjs` | 71 checks, 661,525ms, 15 cycles, zero page errors |
| Actual result-state recording | `PETROS_M6_BROWSER_DIR=…/original-evaluation pnpm exec node scripts/verify-petros-original-evaluation.mjs` | 14 checks, zero page errors |
| Refreshed API/preview smoke | `PETROS_ORIGINAL_EVIDENCE_DIR=…/current-preview-smoke pnpm exec node scripts/verify-petros-original-artwork.mjs` | 51 checks, zero page errors |

JSON reporters wrote separate new files; failed diagnostics were retained. Current selected per-file union: **279 passed, zero failed, 14 skipped**. Reruns are not added together. The broader latest-record summary also incorporates unchanged prior selected suites, and is explicitly not one full-repository invocation.

The source fixture's former 15–30 second wall deadlines expired while legitimate work continued. Budgets now cover one or two existing 55-second preparation jobs plus fixture queries. Background completion polling allows 60 seconds. Production worker limits, rollback/authority/immutability assertions and enqueue p95 ≤500ms are unchanged. The actual source queue p95 is recorded in the source fixture evidence.

`ocr-final.json` retains an unsuccessful shell-script sandbox probe. A compiled native probe exercises the same boundary as the actual engine and passed; shell execution was not relaxed to accommodate the probe. The three failed source diagnostics are retained as `source-regression.json`, `source-final.json` and `source-complete.json`. No failure is omitted from its original file or counted as a pass.

The current disposable demo was restarted from current source, with the pinned OCR pair, `PETROS_M5_EVIDENCE_DIR=…/demo-current`, API 4983 and existing web 4984. Other demo instances were untouched. New evidence gallery: `python3 -m http.server 4986 --bind 127.0.0.1 --directory …/m6-functional-20261021`.

`command-completions.json` contains actual observed exit codes. `preservation.json` checks all 37 original assets and 3,692 historical files. `implementation-inventory.json` records final source hashes. No M7 or production release work was started.
