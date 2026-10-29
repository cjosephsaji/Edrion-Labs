# Petros Showcase — YC prototype

The local prototype runs inside the existing Edrion student app at **http://127.0.0.1:3021/prototype**. Read [CODEX_IMPLEMENTATION.md](CODEX_IMPLEMENTATION.md), [immersive World request](WORLD_REDESIGN.md), and current [World V2 specification](WORLD_V2.md) for the approved scope.

Classic retains its fast Outfit interface. **Enter Petros World** loads a separate full-viewport 3D study, followed by a portal, topic-aware arrival, source-book retrieval and spatial teaching. It shares the same lesson controller, answers, drafts, source references and completion state with Classic. World has an enclosed, textured interior, human-eye perspective cameras and student-paced teaching. The HUD, board and 3D labels share the actual self-hosted Outfit font used by Classic; no literal-name canvas fallback.

AI Modules 3/4 and EHS Modules 3/5 each have twelve source-linked checkpoints; the prepared AI and time-travel lessons have eight each. World uses progressive minimax/pruning, facts/rules/conclusions, a scaffold model, a river model, a tiny weighted network and computed clocks. Practice never certifies mastery. A fresh lesson consistently uses C=(1,4) in both modes, so its pruning pass examines four leaves and skips two. Mode changes never change the example or its correct answers. The legacy V2 ordering remains supported by the tree adapter for existing supplied states.

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

```sh
pnpm --filter @edrion/petros-showcase test
pnpm --filter @edrion/student-web exec tsc --noEmit
PETROS_ISOLATED_VERIFICATION=1 pnpm --filter @edrion/student-web exec next build
pnpm --filter @edrion/petros-showcase run verify:browser
pnpm --filter @edrion/petros-showcase run verify:edges
pnpm --filter @edrion/petros-showcase run verify:typography
node prototype/tests/upload-security.mjs
pnpm --filter @edrion/petros-showcase run record:world
```

Browser scripts use installed Brave and Playwright on this Mac. Set `SHOWCASE_TEST_URL` for another port. The browser script records two continuous 1440×900 silent minimax paths: correct responses with explicit continuation, and a struggling student who receives a different worked example and follow-up. It also checks all six lessons in both modes and 31-second unanswered holds. `tests/browser.mts`, `world-picking.mjs` and `record-walkthrough.mjs` are historical scripts for the superseded room; the current browser/edge commands exercise the shared student-paced controller. Earlier V2 autoplay recording, experiment and typography scripts are historical; they do not verify the corrected teaching loop.

Source preparation uses the existing M2 parser through `pnpm --filter @edrion/petros-showcase prepare:sources`. Original source documents and Petros assets are preserved.

## Demo boundaries

- Contextual explanations in both modes are retrieved from prepared source-linked responses and actual visible state. They are explicitly labelled prepared. They can clarify a mismatched node and resume the same checkpoint.
- General questions and arbitrary topic generation report model unavailability. Existing live tutor APIs write production conversation/academic state, so this isolated prototype does not call them. No fabricated live responses.
- The isolated World demonstration is text-led. Existing gated voice preview/unrelated narration fixtures are not substituted for matching approved lesson narration. Recordings are silent.
- Petros uses unchanged original static PNG poses. Anchor changes use fades; the independent book and camera animate. Walking, sitting, grabbing, blinking, lip sync and articulated motion require approved assets.
- Progress and uploads are held in browser memory. Mode changes and graphics retry preserve them; page reload clears them. No production assessments or database writes.
- The river is a qualitative teaching illustration, and construction examples are source-linked educational examples. They do not provide quantitative pollution predictions or professional certification.
- PDFs and extracted text are private demonstration inputs. Do not publish them in an unrestricted repository.

The active [teaching correction handoff](evidence/teaching-correction/HANDOFF.md) documents the shared controller, audit, recordings and current validation. The previous [World V2 handoff](evidence/v2/HANDOFF.md) contains exact files, actual test results, screenshots, recordings and deviations. [The initial handoff](evidence/HANDOFF.md) documents the earlier baseline; its old World visuals and live-context limitations are superseded by the redesign handoff.

## Imported room reference (29 October 2026)

The current World uses authored CC0 architecture, pine bookcases, leather-bound books, modeled furniture and PBR maps. The original Petros artwork and self-hosted Outfit font are retained. [Reference-room handoff](evidence/realism/HANDOFF.md) contains the three actual browser views, native recording, measured budgets and exact file inventory. [Asset credits and licenses](assets/realism/ASSETS.md) and [reproducible preparation](assets/realism/README.md) document the source files.

The room is awaiting the owner's mandatory visual approval under [Section 10](ASSET_QUALITY_REQUEST.md). The current construction scaffold remains the legacy procedural teaching model. Its realistic replacement and polishing of other lesson scenes must follow approval.
