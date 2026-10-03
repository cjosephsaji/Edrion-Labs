# Final frozen-build commands

All commands ran from `/Volumes/Chris/Edrion Labs` against the freeze recorded in this directory.

## Shared contracts

```bash
NODE_OPTIONS='--experimental-strip-types' pnpm --filter @edrion/schemas exec vitest run \
  src/petros-document-source.spec.ts \
  src/petros-document-preparation.spec.ts \
  src/petros-document-retrieval.spec.ts \
  src/petros-session-intent.spec.ts \
  src/petros-question-execution.spec.ts \
  src/petros-visual-program.spec.ts \
  src/petros-assessment.spec.ts \
  src/petros-knowledge-policy.spec.ts \
  src/provider-mapping.spec.ts \
  src/curriculum-alignment.spec.ts \
  src/petros-compatibility.spec.ts
```

## API and disposable production boundary

```bash
PETROS_LOCAL_DB_TESTS=1 NODE_OPTIONS='--experimental-strip-types --max-old-space-size=8192' \
  pnpm --filter @edrion/api exec vitest run \
  src/modules/student/petros-session-intent \
  src/modules/student/materials \
  src/modules/student/knowledge \
  src/modules/student/petros-loop \
  src/modules/student/petros-input-modes \
  src/modules/student/petros-companion \
  src/modules/student/petros-artifacts \
  src/modules/petros-ai-routing \
  src/modules/petros-learner-model \
  src/modules/petros-institutional \
  src/modules/integrations \
  src/modules/federation \
  src/modules/portal/courses \
  src/modules/student/courses \
  src/common \
  --pool=forks --poolOptions.forks.singleFork=true
```

## Student web

```bash
pnpm --filter @edrion/student-web exec vitest run \
  'src/app/(app)/materials/page.spec.tsx' \
  'src/app/(app)/courses/[id]/page.spec.tsx' \
  src/components/materials/document-viewer.spec.tsx \
  src/components/petros/material-preparation-status.spec.tsx \
  src/components/petros/petros-document-door.spec.tsx \
  src/components/petros/petros-repair-session.spec.tsx \
  src/components/petros/petros-visual-explorer.spec.tsx \
  src/components/petros/use-document-question.spec.tsx \
  src/components/petros/petros-input-modes.spec.tsx \
  src/components/petros/petros-compatibility-surfaces.spec.tsx
```

## Typecheck, build, and lint

```bash
pnpm --filter @edrion/schemas exec tsc --noEmit
pnpm --filter @edrion/database exec tsc --noEmit
pnpm --filter @edrion/config exec tsc --noEmit
pnpm --filter @edrion/permissions exec tsc --noEmit
pnpm --filter @edrion/api exec tsc --noEmit
pnpm --filter @edrion/institution-web exec tsc --noEmit
pnpm --filter @edrion/student-web exec tsc --noEmit
pnpm --filter @edrion/api build
pnpm --filter @edrion/institution-web build
pnpm --filter @edrion/student-web build
pnpm --filter @edrion/schemas lint
pnpm --filter @edrion/database lint
pnpm --filter @edrion/config lint
pnpm --filter @edrion/permissions lint
pnpm --filter @edrion/api lint
pnpm --filter @edrion/institution-web lint
pnpm --filter @edrion/student-web lint
```

## Controlled Chromium

```bash
node apps/student-web/scripts/petros-preparation-browser-check.mjs
node apps/student-web/scripts/petros-visual-browser-check.mjs
node apps/student-web/scripts/petros-question-browser-check.mjs
node apps/student-web/scripts/petros-compatibility-browser-check.mjs
```
