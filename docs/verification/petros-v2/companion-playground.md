# Petros V2 M0-P — fixture Companion Playground

9 October 2026, Asia/Kolkata. **Implemented and locally verified: the fixture-based current-art playground.** M0-R remains blocked for staging/production. No M1–M8 work or production V2 learning was enabled. The original full M0-P voice, revised layered-art, naturalness and real-device gates remain open.

## Working experience

The existing student application now has `/petros/companion-playground`. It uses the existing student design tokens, ActionButton, safe KaTeX renderer, target registry, authenticated app layout and study-partner persona version `petros.companion.mentor.v3`. The legacy portal mentor yields on this exact route; other V1 routes retain their behavior.

| Demonstration | Implemented behavior |
| --- | --- |
| Reading | An original public argument passage, progressive teaching notes, exact selected-passage highlights in the source preview, and selected-element questions. |
| Writing | Progressive text, safely rendered slope equations, checked coordinate substitution/subtraction, highlighted steps and a student-completed final value. The denominator must be nonzero. This is font reveal, not handwriting. |
| Drawing | Incremental semantic nodes and longer directional arrows, plain labels anchored to the connectors, selected targets, an expandable keyboard-accessible text version, node renaming/movement, and student-added connections. |
| Participation | Explicit allowed edit regions, stale revision checks, local drafts and reasoning, immutable local submission boundaries, and clearly labelled demonstration-only feedback. Submitted work remains visible through continuation. |
| Playback | Play, pause, finish-step, next-step, interruption, explicit resume and restart. One controller owns the semantic prefix, reveal cursor, cue target and cancellation epoch. No independent avatar/diagram progression loop. |
| Recovery | Owner/scenario-scoped device checkpoints replay validated actions and edits; partial presentation position and reasoning survive reload. Reload restores a paused scene. Interrupted formula writing and arrow construction do not duplicate content. |
| Companion | Existing neutral/listening/thinking/talking/directional PNG poses, target-dependent directional pointing on visible desktop targets, gentle acknowledgment, quiet waiting, text speech clouds and truthful local-source-check status. Missing/offscreen/mobile targets settle neutrally. |
| Accessibility | Viewport-contained scrolling, pinned playback controls, native labelled controls, focus outlines, live caption/status regions, diagram text alternatives, explicit text stepping, OS/app/user reduced-motion handling, and 360px responsive layout. |

Original educational fixtures are dedicated to CC0 and stored in `teaching-fixtures.ts`. Their arithmetic, references, edit bounds and authored relationships were locally checked. They are **not qualified production teaching-pack reviews**. The examples include argument analysis, dimensionless slope and a deliberately simplified cloud-service relationship; they do not certify source ingestion or subject coverage.

## Simulation and artwork limits

Free-form typed questions use the public preview adapter, selected canvas context and a bounded set of fixture replies. Replies and feedback are marked simulated/demonstration-only. There is no new chatbot, provider client, production memory or evaluator. An unfamiliar question reports the fixture limitation. Numeric/link matching does not evaluate the student's explanation; the UI says so. Conversation messages are tab-local; saved canvas work and reasoning have separate device checkpoints.

No approved local narration files were found in the inspected student public assets and docs. Voice and microphone controls are explicitly disabled. Captions and text controls are complete; this version makes no audible-playback, STT/TTS, lip-sync or natural-voice claim. Paid auditions remain outside this implementation.

The shipped `public/petros/v2/rig/manifest.json` inventories the **actual existing** PNG assets, dimensions and SHA-256 hashes. It admits static pose switches, directional pointing, whole-pose acknowledgment and clouds. Independent facial/eye controls, precise hand contact, articulated limbs, writing/drawing poses, handwriting, phoneme mouth control and walking remain unsupported. Those require reviewed layered/pose artwork, pivots/contact anchors and, for real handwriting, stroke data. No placeholder layered rig was fabricated. Current-image fades/nods are restrained whole-image transitions.

## Access locally

Use Node 24.21.x and pnpm 11.1.2. Use a legitimate tester on an **approved isolated local authentication API**, with an existing cookie session and `student.learn.use` (or `*`). The server independently checks cookie-authenticated `/v1/student/me` metadata and the explicit institutional student-ID allowlist. It does not forward development impersonation headers. Missing flag/allowlist, invalid sessions, missing permission, password setup or non-allowlisted identities fail closed. Authentication errors cannot admit the page.

From the workspace root, substitute the local API port and legitimate tester UUID:

```sh
PETROS_ISOLATED_VERIFICATION=1 \
PETROS_M0P_VERIFICATION=1 \
PETROS_V2_COMPANION_PLAYGROUND_ENABLED=true \
PETROS_V2_COMPANION_PLAYGROUND_TESTER_IDS='<local-test-student-uuid>' \
NEXT_PUBLIC_API_BASE_URL='http://localhost:<local-api-port>' \
NEXT_PUBLIC_DEV_STUDENT_EMAIL='' \
NEXT_PUBLIC_DEV_STUDENT_USER='' \
pnpm --filter @edrion/student-web exec next dev -H 127.0.0.1 -p 3011
```

Sign in through the existing student login, then open [the local playground](http://localhost:3011/petros/companion-playground). The isolation switch prevents loading workspace-root public environment settings. The M0-P verification switch selects a separate Next output directory, preserving existing dev/build artifacts. The feature flag defaults to false; the tester allowlist defaults empty. Neither switch enables production learning. Use the contained browser harness below when an approved local API/session is unavailable.

### Existing local dev-server access correction

The normal server on port 3011 initially returned the intentional not-found gate because neither the preview flag nor its tester allowlist was configured. Earlier UI screenshots were captured by the separate, disposable browser-verification server; they did not configure the normal dev server.

After the user identified their local student account, its UUID, active student role, completed password setup and learning permission were checked using authentication metadata only against the existing loopback API/database. The selected UUID and preview flag were added to the Git-ignored `apps/student-web/.env.development.local`. This file is loaded only in development. Stale public development impersonation settings were cleared in that same local override, so the preview uses the existing signed-in cookie. The workspace-root `.env`, production defaults, roles, authentication implementation and database contents were unchanged.

Next reloaded the settings without restarting the API or other applications. The normal port-3011 route now redirects requests without cookies to login instead of the disabled-feature not-found gate. An invalid student-session cookie still fails closed and never renders the playground. The user's already signed-in browser needs a refresh; its authenticated view was not independently verified during this correction because native browser control was interrupted by user activity.

## Verification and reproduction

[Machine-readable results](companion-playground/verification-results.json), [browser results](companion-playground/browser-results.json), and [preservation audit](companion-playground/preservation-audit.json) accompany this report.

| Check | Result |
| --- | --- |
| Relevant frontend/route/V1 compatibility suites | **44 passed, 0 failed**, seven files. Includes six server-admission cases and interruptions during actual equation/arrow construction. |
| Shared schema/reducer/timeline and existing engine/presentation/compatibility suites | **48 passed, 0 failed**, seven files. Covers strict public contracts, unsupported/injected fields, checked transformations, dangling references, stale edits, ownership and checkpoint barriers. |
| Student frontend, schemas and config typechecks | **PASS** on Node 24.21.0. |
| Isolated Next production build | **PASS**, dynamic playground route, 18.4 kB route size / 583 kB first-load bundle including existing shared dependencies. |
| Targeted lint and diff whitespace checks | **PASS**. Workspace-root lint emits an existing Next pages-directory discovery warning. |
| Chromium desktop and 360px browser walkthrough | **PASS**: real assets, target/cue correspondence, paused reveal, typed detour/resume, saved equation reasoning, diagram rename/move/connect, local submission, reload, stable IDs, reduced motion, and no horizontal page overflow. |
| Contained scrolling follow-up | **PASS**: desktop workspace scrolling, mobile single content scrollport, pinned playback, wheel/keyboard and focus reachability, clip-aware avatar targets, and no outer-page overflow at 320, 360, 768, 999, 1000, 1280 and 1440px widths, including a 600px-high desktop viewport. |
| Network isolation | Only disposable `/v1/student/me` GETs. Zero production services, provider calls, task submissions, assessment/evidence writes, or legacy mentor requests. Browser runtime errors: zero. |
| Broader student frontend suite | **263 passed / 4 failed** at the time of the broader run. All four are in the unchanged `src/app/(auth)/login/page.spec.tsx`, whose API mock lacks `StudentApiError`. Running that file alone reproduces all four failures. Existing mentor tests also log a Motion `addListener` mock warning while passing. |

Relevant commands from the workspace root:

```sh
pnpm --filter @edrion/student-web exec vitest run src/features/petros-v2 \
  'src/app/(app)/petros/companion-playground/page.spec.tsx' \
  src/components/app-shell/app-shell.spec.tsx \
  src/components/petros/petros-companion.spec.tsx \
  src/components/petros/petros-compatibility-surfaces.spec.tsx \
  src/features/learning-studio/integrals-teaching-studio.spec.tsx
pnpm --filter @edrion/schemas exec vitest run src/petros-v2 \
  src/petros-engine.spec.ts src/petros-engine-models.spec.ts \
  src/petros-presentation.spec.ts src/petros-compatibility.spec.ts
pnpm --filter @edrion/student-web typecheck
pnpm --filter @edrion/schemas typecheck
pnpm --filter @edrion/config typecheck
```

The committed browser harness starts the real student Next app on loopback against a disposable authentication-metadata fixture service. It uses no database, Redis, provider credentials or workspace `.env`; it does not alter application authentication. Its synthetic HTTP-only cookie exists only in the temporary test browser. Both servers and the browser stop after verification. Ports default to 3041/3042 and can be overridden by `PETROS_QA_WEB_PORT`/`PETROS_QA_API_PORT`.

```sh
npm install --prefix /tmp/petros-m0p-browser --ignore-scripts --no-audit --no-fund playwright@1.64.0
node /tmp/petros-m0p-browser/node_modules/playwright/cli.js install chromium
PETROS_PLAYWRIGHT_MODULE=/tmp/petros-m0p-browser/node_modules/playwright \
node docs/verification/petros-v2/verify-companion-playground.mjs
```

An existing compatible Chromium executable can be supplied with `PETROS_CHROMIUM_PATH`; verification used the already-installed Chromium cache instead of downloading a browser. A Playwright package was installed only under `/tmp`, leaving dependency manifests/lockfile unchanged.

## Visual evidence

[Active teaching and pointing](companion-playground/desktop-teaching.png), [reading/source highlight](companion-playground/desktop-reading.png), [equation and response](companion-playground/desktop-equation.png), [edited diagram](companion-playground/desktop-diagram.png), and [360px diagram/controls](companion-playground/mobile-diagram.png). These are real screenshots from the existing student app with disposable fixture authentication. Desktop/mobile images were visually inspected; arrowheads, labels, source preview and response controls are rendered.

Follow-up diagram repair: “connects” and “provides” are plain text directly above longer connectors. The renderer spaces nodes farther apart without changing saved canvas coordinates, keeps labels anchored when nodes move, and routes student connections around an intervening node. Narrow canvases reflow vertically with labels beside the connector. The duplicated links and loose relationship sentences below the drawing were replaced by a collapsed “Text version” disclosure; opening it shows clean selectable relationship rows. [Diagram detail](companion-playground/diagram-detail.png) and [expanded text version](companion-playground/desktop-diagram-text.png) show the final UI. The browser harness passed 18 checks, the 44 relevant frontend tests passed again, and the student typecheck and targeted lint passed.

Follow-up scrolling repair: the playground shell uses the dynamic viewport height. On desktop, the teaching workspace scrolls while its heading and playback bar remain visible; the companion has its own bounded area. Phone/tablet and short-window layouts use one main content scrollport above the bottom navigation. Body containment is scoped to this route, including safe-area padding and viewport resizing. Native wheel and Page Up scrolling, response submission, keyboard focus on the question form, and interruption focus were verified. The diagram no longer expands with screen width indefinitely. Container-scroll events refresh the shared target registry, and V2 pointing also checks ancestor clipping bounds. All 44 relevant frontend/V1 tests, the student typecheck and targeted lint passed; the browser harness passed 18 checks with zero runtime errors. The production-build result above is from the initial implementation; it was not repeated for these layout follow-ups.

The extended browser check also caught a local restart cleanup bug: the old controller could rewrite the deleted checkpoint during effect cleanup. Restart now detaches its save callback before disposing it and removing the checkpoint; a fresh diagram was verified through actual UI controls.

Additional screenshots: [scrolled response](companion-playground/desktop-response-scroll.png), [scrolled conversation](companion-playground/desktop-conversation-scroll.png), [phone conversation and keyboard focus](companion-playground/mobile-conversation-scroll.png), and [short desktop window](companion-playground/short-viewport-scroll.png).

## Exact files and preservation

The complete created/modified path and SHA-256 inventory is [change-manifest.json](companion-playground/change-manifest.json). Existing files modified by this task:

```text
.gitignore
apps/student-web/next.config.mjs
apps/student-web/tsconfig.json
apps/student-web/src/components/app-shell/app-shell.tsx
apps/student-web/src/features/learning-studio/target-registry.tsx
packages/config/src/index.ts
packages/schemas/src/index.ts
```

The two already-dirty shared index/config files were extended with narrow additions. Removing only those additions recovers their exact starting hashes. Of 304 starting uncommitted file records, 302 remain byte-identical, those two are intentionally extended, and none are missing. Existing plan/readiness documents, API changes, migrations, roles, database schema, lockfile, artwork and V1 rig/component edits were preserved. Generated Next files use the separate ignored M0-P output directories.

## Remaining limits and stopping point

This implementation proves public fixture delivery, editable shared work and interruption-safe current-art coordination. It is not a production learner session, private evaluator, adaptive teaching engine, revised-art acceptance, voice audition, ten-minute human naturalness study, or real-device performance/accessibility certification. The existing login-test failures remain unresolved outside this task. No production role/database/RLS/migration changes or provider routes were made. Work stops at the requested fixture playground and verification.

## 11 October expressive-companion follow-up

The current supported-art implementation is documented in [the expressive companion report](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m0p-expressive/report.md>). It adds restrained action-bound poses, real-media playback preparation, quiet student states, stable larger avatar/bubble placement and the final status/control corrections. Current artwork remains whole PNG poses; independent face/limb layers and natural voice remain dependencies. The historical results above remain the baseline; the new report contains the current verification and visual evidence. Work stops at M0-P for human review.
