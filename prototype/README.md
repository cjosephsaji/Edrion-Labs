# Petros Showcase — YC prototype

The [visual teaching engine](VISUAL_LEARNING.md) replaces generated label cards with validated SVG models shared by Classic, World and Focus Board. **Tectonic plates** opens the complete prepared geological investigation; new generated topics plan visuals and task snapshots alongside their content. The report documents supported types, actual live/provider-fixture checks and remaining limits.

The current [Learn / Apply / Test experience](LEARNING_EXPERIENCE.md) adds a complete offline diagnostic, reasoning-board interaction, independent verification and mixed knowledge check for **How an AI Reasons with Knowledge**. Other lessons retain their existing teaching and now distinguish visited concepts from learning evidence. [Acceptance evidence](evidence/learning-experience/HANDOFF.md) records scope, actual browser results and limitations.

The local prototype runs inside the existing Edrion student app at **http://127.0.0.1:3021/prototype**. Read [CODEX_IMPLEMENTATION.md](CODEX_IMPLEMENTATION.md), [immersive World request](WORLD_REDESIGN.md), and current [World V2 specification](WORLD_V2.md) for the approved scope.

Classic retains its fast Outfit interface. **Enter Petros World** loads a separate full-viewport 3D study, followed by a portal, topic-aware arrival, source-book retrieval and spatial teaching. It shares the same lesson controller, answers, drafts, source references and completion state with Classic. World has an enclosed, textured interior, human-eye perspective cameras and student-paced teaching. The HUD, board and 3D labels share the actual self-hosted Outfit font used by Classic; no literal-name canvas fallback.

AI Modules 3/4 and EHS Modules 3/5 each have twelve source-linked practice tasks; the prepared AI and time-travel lessons have eight each. The current [interactive learning handoff](evidence/learning-redesign/HANDOFF.md) documents the diagram-first workspace, shared response-aware loop, fresh MAX/MIN checks, contextual help and refresh recovery. Minimax has eight learning concepts, distinct from its twelve prepared tasks. New lessons use A=(3,5), B=(2,9), C=(4,1) in both modes: the root is 3, and left-to-right pruning examines five leaves and skips B's 9. Practice never certifies mastery.

## Run locally

For another computer, follow [device setup](DEVICE_SETUP.md). Private PDFs and extracted page text are restored separately; optimized room assets and original Petros artwork travel with the repository.

From the repository root with Node 24 / pnpm 11:

```sh
pnpm install --frozen-lockfile --ignore-scripts
PETROS_SHOWCASE_ENABLED=1 PETROS_SHOWCASE_LOCAL_ONLY=1 PETROS_ISOLATED_VERIFICATION=1 pnpm --filter @edrion/student-web exec next dev --hostname 127.0.0.1 -p 3021
```

Keep the server bound to loopback for local operator access. The isolation flag uses the existing separate development build directory and suppresses public impersonation variables. Normal student authentication remains intact.

The feature is disabled unless `PETROS_SHOWCASE_ENABLED=1`. Outside explicit local development, its page and APIs require a cookie validated through read-only `/v1/student/me`. Enrolled-student production access has not been tested. There is no public deployment.

## Verify and record

The [topic workflow setup](TOPIC_SETUP.md) documents the complete model-directed lesson blueprint, diagrams, practice/retry loop, contextual questions and refresh recovery. The local key is optional; **How do integrals work?** now opens a prepared six-concept lesson with an interactive area model in both modes. Other new topics use the isolated server connector once configured. Run `verify:topics` to check the real offline path and labelled provider-contract fixtures.

The current [World motion handoff](evidence/world-motion/HANDOFF.md) contains the camera, board, model and interruption changes, actual before/after recordings, and measured performance limits. Run `verify:motion` for the three desktop sizes and `verify:motion-interactions` for pause/resume, rapid requests and reduced motion. These checks use the same browser and origin settings described below.

```sh
pnpm --filter @edrion/petros-showcase test
pnpm --filter @edrion/student-web exec tsc --noEmit
PETROS_ISOLATED_VERIFICATION=1 pnpm --filter @edrion/student-web exec next build
pnpm --filter @edrion/petros-showcase run verify:learning
pnpm --filter @edrion/petros-showcase run verify:learning-world
pnpm --filter @edrion/petros-showcase exec tsx tests/learning-accessibility-browser.mts
node prototype/tests/upload-security.mjs
```

The current browser checks discover an installed Chromium browser; `PETROS_BROWSER` can provide an explicit executable. Set `SHOWCASE_TEST_URL` to the running showcase origin (the new scripts default to port 3022). They record real silent minimax correct/remediation/interruption paths, complete all 64 Classic tasks, test five tasks per subject in World, and verify all four requested viewport sizes. Earlier `teaching-*`, V2, autoplay and room recording scripts describe historical controls and are not the current learning-redesign acceptance suite.

Source preparation uses the existing M2 parser through `pnpm --filter @edrion/petros-showcase prepare:sources`. Original source documents and Petros assets are preserved.

## Demo boundaries

- Source-module explanations remain prepared and source-linked, using the actual visible state. Topic help uses an honestly labelled saved explanation when offline or the isolated contextual model connector when configured. Both resume the same checkpoint; a model reply cannot grade a response or advance a concept.
- New topic generation and contextual questions use a separate server-only model connector when configured; they report an inline connection message while the key is blank. Prepared AI, time-travel and integrals lessons work locally. Existing production tutor APIs are not called, and no production conversation or academic state is written. Uploaded PDFs are not automatically sent to this topic connector. See [topic setup](TOPIC_SETUP.md).
- The isolated World demonstration is text-led. Existing gated voice preview/unrelated narration fixtures are not substituted for matching approved lesson narration. Recordings are silent.
- Petros uses unchanged original static PNG poses. Anchor changes use fades; the independent book and camera animate. Walking, sitting, grabbing, blinking, lip sync and articulated motion require approved assets.
- Active lesson progress and conversation context recover from tab-scoped session storage after refresh. Upload contents/receipts remain memory-only and are excluded from serialization. Storage denial is disclosed in the footer. No production assessments or database writes.
- The river is a qualitative teaching illustration, and construction examples are source-linked educational examples. They do not provide quantitative pollution predictions or professional certification.
- PDFs and extracted text are private demonstration inputs. Do not publish them in an unrestricted repository.

The active [teaching correction handoff](evidence/teaching-correction/HANDOFF.md) documents the shared controller, audit, recordings and current validation. The previous [World V2 handoff](evidence/v2/HANDOFF.md) contains exact files, actual test results, screenshots, recordings and deviations. [The initial handoff](evidence/HANDOFF.md) documents the earlier baseline; its old World visuals and live-context limitations are superseded by the redesign handoff.

## Imported room reference (29 October 2026)

The current World uses authored CC0 architecture, pine bookcases, leather-bound books, modeled furniture and PBR maps. The original Petros artwork and self-hosted Outfit font are retained. [Reference-room handoff](evidence/realism/HANDOFF.md) contains the three actual browser views, native recording, measured budgets and exact file inventory. [Asset credits and licenses](assets/realism/ASSETS.md) and [reproducible preparation](assets/realism/README.md) document the source files.

The room is awaiting the owner's mandatory visual approval under [Section 10](ASSET_QUALITY_REQUEST.md). The current construction scaffold remains the legacy procedural teaching model. Its realistic replacement and polishing of other lesson scenes must follow approval.
