# Petros Showcase handoff — 27 October 2026

The working local application is **http://127.0.0.1:3021/prototype**. The development process is left running, bound to loopback. Nothing was deployed publicly. Run and feature-flag instructions are in [the prototype README](</Volumes/Chris/Edrion Labs/prototype/README.md>).

## Implementation status

| Experience | Implemented behavior | Authored checkpoints |
| --- | --- | ---: |
| AI Module 3 | Minimax tree, MAX/MIN layer highlights, leaf/branch selection, computed backup values, manual visual steps/backtracking, actual alpha–beta traversal and counters, changed-tree transfer experiment, explanation and sourced recap | 12 |
| AI Module 4 | Facts / Rules / What follows, idempotent TELL, explicit substitution and derivation, ASK support paths, unknown versus false, forward/backward views, Rio transfer example | 12 |
| EHS Module 3 | Five visible selectable hazards and keyboard alternatives, explanations, geometry-changing safer comparison, excavation transfer scene | 12 |
| EHS Module 5 | Four independently selectable pollution pathways, matching controls, actual diagram changes, qualitative source-control states and conservation questions | 12 |
| How does AI work? | Input × adjustable connection weight, computed prediction and absolute error, assumptions and explanation | 8 |
| Is time travel possible? | Two observer clocks, tested relativity formula with years and v/c, speed comparison, stated frame/constant-speed assumptions and evidence versus speculation | 8 |

Classic uses the approved Outfit/sage/cream identity, original Petros artwork, speech/thought/notice clouds, accessible DOM/SVG activities, source reader and a separate explanation reader. Hints, retries, worked steps, skip, manual presentation steps, pause, repeat, another example and recap are functional. Skips do not inflate explored progress. Free explanations are recorded without an automatic grade.

World is a lazy client-only Three.js / React Three Fiber canvas. The 12×8 room contains mesh walls/floor, a desk/chair/notebook, bookshelf/four labeled module books, whiteboard and source-dependent experiment table. Mesh picking and the DOM station alternatives work. Book preview requires an explicit Open this module before starting a different lesson. Orthographic wide/teaching/interaction presets use finite transitions and demand rendering. DOM activities remain the input surface; interaction focus reduces the companion rail. Escape / Back to room, Back to Classic, context-loss retry/fallback and reduced motion are implemented.

Both modes operate on one session/controller. Academic question, attempt, completion, help exposure, source identity, diagram state, text drafts and bounded conversation survive a mode switch. A request settles once even if the mode changes. A source switch is an explicit new lesson. Resume appears only for a real current session. Reload deliberately clears memory; no durable save is claimed.

## Prepared, computed and live matrix

| Capability | Actual implementation |
| --- | --- |
| Four module lesson scripts and feedback | Prepared from the supplied contract and verified source pages; not live generated |
| Minimax / alpha–beta | Computed: A=3, B=2, C=1, root=3; fixed traversal evaluates 4 leaves and skips 9 and 4 |
| KB support | Deterministic small demonstrator for the stated rule; CanFly is not entailed, never automatically false |
| Hazards and pollution | Authored illustrations and explanations with real local selection/control state; no engineering sign-off or scientific water-quality metrics |
| Topic models | Computed toy multiplication and Δτ=Δt√(1−v²/c²); explicitly simplified |
| PDF extraction | Genuine existing M2 PDF.js parser, isolated adapter, hash association and page receipts |
| Arbitrary new PDFs | Actual extracted page inventory; no prepared lesson is assigned unless the content hash matches |
| Live contextual AI questions | **Unavailable in this isolated showcase.** A bounded contextual request is built and sent to the showcase endpoint, which returns an explicit 503 and preserves the lesson |
| Arbitrary live topic generation | **Unavailable**, with the typed prompt retained and an explicit explanation |
| Free prose evaluation | **Not performed.** Saved as “Recorded — not automatically evaluated” |
| Voice | **Unavailable.** Captions/text controls work; no prerecorded audio is represented as live speech |
| Progress storage | Browser memory only; no production academic or conversation writes |

The workspace `.env` has `PETROS_AI_MODE=live`. This does not mean the showcase has an authorized read-only provider path. Inspected companion-turn and V2 command/session APIs persist production conversation or academic state. Reusing them would violate the showcase isolation boundary. No credentials were printed, copied to the client or added to this folder. A future live connector must retain existing principal/provider/spend admission while avoiding production lesson mutations.

## Source receipts

All actual bytes matched `assets/source-manifest.json`, then were extracted with the existing `apps/api/src/modules/student/knowledge/pdf-extract.cjs` and PDF.js 4.10.38. The production parser was not edited or copied. Full receipts are in `assets/source-receipts.json`; page inventories are in `assets/extracted-sources.json`.

| PDF | Total pages | Pages with extracted text | SHA-256 |
| --- | ---: | ---: | --- |
| AI_Module_3.pdf | 38 | 38 | `7575fe98e7b69c4da8f5994964e7b9f3776ee3d68de620dcd4474f171b4894f9` |
| AI_Module_4.pdf | 30 | 28 | `9a86e9ac718bfc77ad6c6bfbe39f40152870bfa56b4d8e2444cc00a802ee96ab` |
| EHS_Module_3.pdf | 188 | 158 | `c72a6df16651166ecc96e546de30309ce784ad1339d53ce059f3f412d9dcb660` |
| EHS_Module_5.pdf | 54 | 54 | `16d5da2b78c32489419afaa7322869dfae7b21fec11b3eaec23cb22183c599e1` |

No text layer on a page is not described as successful OCR. The source reader links to the original PDF for image/diagram context. Course files and extracted text stay private demonstration inputs and should not be published in an unrestricted repository.

Uploads are bounded to 20 MB/file, four retained receipts, 200 pages and 20 seconds for receipt ingestion/extraction stages. The request body is bounded before FormData parsing. Bytes go to the existing parser over stdin; the child has a 128 MB heap limit, restricted filesystem reads and an environment without app credentials. Parsed user files are not written to disk, public directories, shared upload caches or production state. PDF text remains data, not operational instructions. Progress is indeterminate during extraction and only reports completion after the real receipt arrives. Removal drops the uploaded receipt/text from the current session.

## Observed verification

- Preparatory existing student production build passed; initial existing suite passed 87 files / 630 tests. Pre-existing Motion matchMedia warnings appeared in that baseline.
- Final prototype unit tests: **26 passed**, including all bank sizes/provenance, minimax and pruning, KB semantics, toy/clock calculations, hash association, mode/interruption/cue state and access gates.
- Focused existing production regressions: **33 passed** across Classic presentation, original artwork hashes, companion, VM activity and V2 session controller.
- Complete real-browser run: **64 checkpoints completed**, all six genuine recaps reached, four source PDFs uploaded and recognized. No page errors or production mutation requests were observed.
- Viewports: **1440×900, 1366×768, 390×844, 360×800** passed home/Classic/World overflow checks, reduced-motion rendering and context-loss return to Classic. This is not a formal accessibility certification.
- Upload/privacy integration cases: **8 passed**: renamed known bytes, a novel valid PDF with a familiar filename and hostile instruction text remaining source data, malformed PDF, >20 MB, 201 pages, cross-origin rejection, source allowlist and private/no-store PDF serving.
- Real canvas picks selected **all four actual stations**, independently of DOM alternatives. `world-picking.json` records the hit coordinates and resulting station IDs.
- Lazy-load evidence: the Classic page requested **no World chunk**; the World JS/CSS chunks were requested only after mode selection. Production Petros routes do not import the new scene.
- Feature flag disabled: the production page rendered the existing unavailable-page UI; source/upload APIs returned **404**. Next's existing root streaming/loading boundary returns HTTP **200** for that unavailable HTML response. No showcase UI or source bytes are admitted; the page metadata is noindex. This distinction is recorded in `disabled-route-results.json`.
- Student production build and strict TypeScript checking passed. The build reports approximately **121 kB** first-load JS for `/prototype`, with 3D code deferred.

Exact machine-readable outputs are `browser-results.json`, `upload-security-results.json`, `world-picking.json`, `disabled-route-results.json`, `lazy-loading-results.json`, `final-unit-tests.txt`, `production-regression-tests.txt`, `final-typecheck.txt` and `final-build.txt`.

The room measurements in `world-picking.json` show roughly 38–61 FPS during finite camera transitions on this Mac, 80 draw calls and approximately 4,342 triangles in the AI scene. Earlier single-browser runs measured about 33–60 FPS. These are observed desktop samples, not a midrange-mobile performance guarantee. Demand rendering becomes idle after transitions.

## Character fidelity and missing capabilities

The exact original asset is `apps/student-web/public/petros/states/petros-idle.png`, SHA-256 `26fa3a0d8f831d19388a40aa6bb3a22d42e11535e18e5fff1d30236ce0584ec6`. The existing approved manifest also contains listening, thinking, static talking and four cardinal pointing PNGs. Classic uses neutral/thinking/listening as appropriate; World uses the unchanged neutral image as a camera-facing sprite.

No original artwork was regenerated or modified. No rejected alternate rig is imported. Station changes fade out the sprite, switch anchors while hidden, then fade it in around the camera transition. These are scene transitions, never walking. Walking, sitting, natural blinking, lip sync, independent gaze/head/face control and articulated gestures remain unavailable without an owner-approved faithful rig.

## Scope and exact files

All showcase implementation, lesson banks, state, parser adapter, scene, tests, source inventory and evidence live in root `prototype/`.

Exactly four integration files outside it were added/modified by this task:

1. `apps/student-web/src/app/prototype/page.tsx` — thin gated route, noindex metadata and route-local approved Outfit font.
2. `apps/student-web/src/app/prototype/api/[...action]/route.ts` — thin Node-runtime adapter; all handlers and access logic remain under `prototype/teaching/`.
3. `pnpm-workspace.yaml` — registers the isolated `prototype` package.
4. `pnpm-lock.yaml` — isolated package/dependency wiring; pre-existing unrelated lockfile changes were retained.

No Next configuration, existing authentication, M4/M5/M6, assessment, schema/migration, original Petros artwork or existing `/petros/v2/session` code was changed by this task. The checkout already contained 444 modified/untracked status entries; `baseline-git-status.txt` records them. No reset, checkout, commit, PR, deployment or enrollment was performed.

The complete exact added/modified path inventory, including every screenshot/log/recording, is [files-changed.txt](</Volumes/Chris/Edrion Labs/prototype/evidence/files-changed.txt>). Original PDFs, the supplied source manifest and the approved build contract are preserved inputs, not task edits.

## Evidence and recording

- [Unedited product walkthrough](</Volumes/Chris/Edrion Labs/prototype/evidence/recordings/petros-showcase-walkthrough.webm>) — approximately 100 seconds, no audio, actual browser interaction. Its precise media duration and size are in `recording-validation.json`.
- [World teaching screenshot](</Volumes/Chris/Edrion Labs/prototype/evidence/showcase-world.png>).
- [Classic tree / pruning screenshot](</Volumes/Chris/Edrion Labs/prototype/evidence/showcase-classic-tree.png>).
- [Hazard comparison screenshot](</Volumes/Chris/Edrion Labs/prototype/evidence/showcase-hazards.png>).
- [Prepared clock experiment screenshot](</Volumes/Chris/Edrion Labs/prototype/evidence/showcase-topic.png>).
- Four-size home, Classic and World screenshots, plus a real Playwright trace, are in this evidence folder. `checkpoint-*` captures document their earlier checkpoints; `final-*` and `showcase-*` captures represent the completed experience.
- [Manual recording route and YC honesty notes](</Volumes/Chris/Edrion Labs/prototype/evidence/recording-script.md>).

Visual recording review caught and fixed an SVG default-fill issue in the safer guardrail and a browser screencast padding issue. The delivered take uses native browser viewport capture and contains no edited mockups or substituted AI replies. Failed capture trials are not the final deliverable.

## Remaining work and post-deadline steps

Core prepared lessons and both renderers are implemented. Live contextual answers, arbitrary generated topic lessons, rich generated lessons for unfamiliar PDFs, voice, durable progress and a faithful articulated Petros rig remain incomplete/unqualified. Optional CSP map-coloring and extra PPE scenes were not added; the required module activities are present.

Before the November 2, 2026 deadline, use the prepared paths and explicit limitations in the recording script. A founder introduction is a separate recording; do not substitute this product footage for founder-introduction-only requirements.

After the deadline: qualify an isolated model/voice adapter through existing provider admission and spend controls; agree on retention and production access; obtain owner approval for a faithful rig and its capabilities; then conduct source/academic review, broader device/accessibility testing and a separately approved production rollout. Do not infer production readiness or validated mastery from this showcase.

Tooling note: the repository's default Prettier configuration references an unavailable `prettier-plugin-tailwindcss`. Newly authored files were formatted with the installed Prettier using `--no-config`; no unrelated formatting or dependency cleanup was performed. Required app, 3D, PDF and browser dependencies used by this prototype were available/installed successfully. React Three Fiber v8 compatibility with React 18 was checked against its [official documentation](https://r3f.docs.pmnd.rs/getting-started/introduction).
