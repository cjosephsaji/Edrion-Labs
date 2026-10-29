# M2 verification commands

The final API and disposable M2 commands below were run with these selections and report destinations. The schema/frontend/M1 commands reproduce the exact selections recorded in the final JSON receipts. Shell redirects wrote the adjacent `.log` files. Run from the stated working directories; use Node 24.21.0, not the unrelated Homebrew node symlink. No deployment or configured target is part of these commands.

## Extraction, contracts and API regressions

Working directory: `/Volumes/Chris/Edrion Labs/apps/api`.

```sh
/tmp/node-v24.21.0-darwin-arm64/bin/node node_modules/vitest/vitest.mjs run \
  src/modules/student/knowledge/knowledge-document-retrieval.spec.ts \
  src/modules/student/knowledge/knowledge-pdf-process.spec.ts \
  src/modules/student/knowledge/petros-content-edge-cases.spec.ts \
  src/modules/student/knowledge/petros-content-intelligence.spec.ts \
  src/modules/student/knowledge/petros-content-interpretation.spec.ts \
  src/modules/student/knowledge/petros-content-ocr.spec.ts \
  src/modules/portal/teaching/petros-teacher-guidance.service.spec.ts \
  --reporter=default --reporter=json \
  --outputFile=../../docs/verification/petros-v2/m2/native-and-model-tests.json
```

## m1-regression-tests

Working directory: `/Volumes/Chris/Edrion Labs/apps/api`.

The M1 test harness refreshes two historical generated evidence JSON files; see the preservation exception in the main report. This selection creates its own disposable cluster.

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$HOME" LC_ALL=C LANG=C NODE_ENV=test PETROS_M1_DB_TESTS=1 /tmp/node-v24.21.0-darwin-arm64/bin/node node_modules/vitest/vitest.mjs run \
  src/modules/integrations/petros-m1-foundations.integration.spec.ts \
  src/modules/student/knowledge/petros-assessment-boundaries.spec.ts \
  --reporter=default --reporter=json \
  --outputFile=../../docs/verification/petros-v2/m2/m1-regression-tests.json
```

## schema-regression-tests

Working directory: `/Volumes/Chris/Edrion Labs/packages/schemas`.

```sh
/tmp/node-v24.21.0-darwin-arm64/bin/node node_modules/vitest/vitest.mjs run \
  src/ai-governance.spec.ts \
  src/billing.spec.ts \
  src/copilot.spec.ts \
  src/curriculum-alignment.spec.ts \
  src/employees.spec.ts \
  src/independent-users.spec.ts \
  src/institution-users.spec.ts \
  src/institutions.spec.ts \
  src/integrations.spec.ts \
  src/obligations.spec.ts \
  src/onboarding-structure.spec.ts \
  src/petros-adaptive-policy.spec.ts \
  src/petros-ai-routing.spec.ts \
  src/petros-artifacts.spec.ts \
  src/petros-assessment.spec.ts \
  src/petros-companion.spec.ts \
  src/petros-compatibility.spec.ts \
  src/petros-context.spec.ts \
  src/petros-document-preparation.spec.ts \
  src/petros-document-retrieval.spec.ts \
  src/petros-document-source.spec.ts \
  src/petros-engine-models.spec.ts \
  src/petros-engine-phase6-cooling.spec.ts \
  src/petros-engine.spec.ts \
  src/petros-input-modes.spec.ts \
  src/petros-institutional.spec.ts \
  src/petros-knowledge-policy.spec.ts \
  src/petros-learning.spec.ts \
  src/petros-objective-evidence.spec.ts \
  src/petros-phase2-pack.spec.ts \
  src/petros-presentation.spec.ts \
  src/petros-projectile-binding.spec.ts \
  src/petros-projectile-model.spec.ts \
  src/petros-qualitative-review.spec.ts \
  src/petros-quality.spec.ts \
  src/petros-question-execution.spec.ts \
  src/petros-reflection.spec.ts \
  src/petros-release.spec.ts \
  src/petros-session-intent.spec.ts \
  src/petros-teach-back.spec.ts \
  src/petros-topic-profiles.spec.ts \
  src/petros-visual-program.spec.ts \
  src/plans.spec.ts \
  src/portal-config.spec.ts \
  src/pricing.spec.ts \
  src/provider-mapping.spec.ts \
  src/support-access.spec.ts \
  src/support-cases.spec.ts \
  src/attendance/forecaster.spec.ts \
  src/geo/geo.spec.ts \
  src/grading/compute.spec.ts \
  src/grading/term-aggregate.spec.ts \
  src/petros-v2/canvas-reducer.spec.ts \
  src/petros-v2/content.spec.ts \
  src/petros-v2/foundations.spec.ts \
  src/petros-v2/teaching-actions.spec.ts \
  src/petros-v2/timeline.spec.ts \
  src/request-types/request-types.spec.ts \
  src/security/step-up-actions.spec.ts \
  src/student/exam-questions.spec.ts \
  src/student/visual-ai-edge-label.spec.ts \
  src/student/visual-graph-contract.spec.ts \
  src/student/visual-graph-rules.spec.ts \
  src/student/visuals.spec.ts \
  src/timetable/resolver.spec.ts \
  src/library-fsrs/scheduler/fsrs.spec.ts \
  src/student/canvas-migrations/runner.spec.ts \
  src/student/edrion-learn/edrion-learn-contract.spec.ts \
  src/student/learn/edrion-learn.spec.ts \
  src/student/mock/skin-resolver.spec.ts \
  --reporter=default --reporter=json \
  --outputFile=../../docs/verification/petros-v2/m2/schema-regression-tests.json
```

## frontend-regression-tests

Working directory: `/Volumes/Chris/Edrion Labs/apps/student-web`.

```sh
/tmp/node-v24.21.0-darwin-arm64/bin/node node_modules/vitest/vitest.mjs run \
  src/components/petros/material-preparation-status.spec.tsx \
  src/components/petros/petros-document-door.spec.tsx \
  src/components/petros/petros-document-study.spec.tsx \
  src/features/learning-studio/integrals-teaching-studio.spec.tsx \
  src/features/learning-studio/presentation-adapter.spec.ts \
  src/features/learning-studio/use-teaching-playback.spec.tsx \
  src/features/petros-v2/canvas/diagram-routing.spec.ts \
  src/features/petros-v2/companion/companion-cloud.spec.tsx \
  src/features/petros-v2/companion/companion-controller.spec.ts \
  src/features/petros-v2/companion/companion-naturalness.spec.tsx \
  src/features/petros-v2/playground/narration-playback.spec.ts \
  src/features/petros-v2/playground/playback-refinement.spec.ts \
  src/features/petros-v2/playground/practice-history.spec.ts \
  src/features/petros-v2/playground/teaching-playground.spec.tsx \
  src/features/petros-v2/playground/workspace-scroll.spec.ts \
  src/features/petros-v2/voice/teaching-voice-controls.spec.tsx \
  src/features/petros-v2/voice/voice-preview-audio.spec.ts \
  src/features/petros-v2/voice/voice-preview.spec.tsx \
  src/features/petros-v2/voice/voice-service-status.spec.ts \
  'src/app/(app)/petros/companion-playground/page.spec.tsx' \
  --reporter=default --reporter=json \
  --outputFile=../../docs/verification/petros-v2/m2/frontend-regression-tests.json
```

## Disposable producer and measurements

Working directory: `/Volumes/Chris/Edrion Labs`.

```sh
/tmp/node-v24.21.0-darwin-arm64/bin/node apps/api/scripts/verify-petros-m2.mjs
/tmp/node-v24.21.0-darwin-arm64/bin/node apps/api/scripts/benchmark-petros-m2.mjs
/tmp/node-v24.21.0-darwin-arm64/bin/node apps/api/scripts/inspect-petros-m2.mjs --serve
```

The verifier accepts no target arguments and strips configured DB/provider environment. The inspector binds to localhost and processes only the fixed CC0 corpus. `--reuse --serve` serves saved inspector evidence without reparsing.

## Type check and compilation

Working directory: `/Volumes/Chris/Edrion Labs/apps/api`.

```sh
/tmp/node-v24.21.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc --noEmit
/tmp/node-v24.21.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p tsconfig.build.json --outDir /tmp/petros-m2-api-build
```

The build output is disposable; the usual repository `dist` is not overwritten. Worker `.cjs` files were copied into the temporary output at the relative paths selected by the existing build asset glob. A smoke driver loaded the actual compiled `PdfContentAdapter`/`KnowledgePdfProcess`, checked `design:paramtypes`, extracted the actual `cloud-reference.pdf`, and produced `built-adapter-smoke.json`. The first temporary driver lacked an absolute reflect-metadata resolution and was corrected before the successful run.

Actual successful smoke command, API working directory:

```sh
env -i PATH=/usr/bin:/bin NODE_ENV=test /tmp/node-v24.21.0-darwin-arm64/bin/node -r ./node_modules/ts-node/register/transpile-only -r ./node_modules/tsconfig-paths/register /tmp/petros-m2-build-smoke.cjs
```

## Selected lint

Working directory: `/Volumes/Chris/Edrion Labs`.

```sh
/tmp/node-v24.21.0-darwin-arm64/bin/node node_modules/eslint/bin/eslint.js \
  apps/api/src/modules/student/knowledge/knowledge-pdf-process.ts \
  apps/api/src/modules/student/knowledge/petros-content-intelligence.service.ts \
  apps/api/src/modules/student/knowledge/petros-content-intelligence.jobs.ts \
  apps/api/src/modules/student/knowledge/petros-content-interpretation.ts \
  apps/api/src/modules/student/knowledge/petros-content-ocr.ts \
  apps/api/src/modules/student/knowledge/adapters/content-adapter.ts \
  apps/api/src/modules/student/knowledge/adapters/pdf-content.adapter.ts \
  apps/api/src/modules/student/knowledge/adapters/pptx-content.adapter.ts \
  apps/api/src/modules/integrations/petros-m2-document-understanding.integration.spec.ts \
  apps/api/scripts/inspect-petros-m2.ts \
  apps/api/scripts/benchmark-petros-m2.ts
```

## Browser QA

Actual UI actions used Codex `cua_repl` in-app browser, not a mocked browser. Observations and screenshots are in `browser-qa.json` and `screenshots/`. No full cross-browser/accessibility suite ran.
