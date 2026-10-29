# Petros Classic design system — engineering report

26 October 2026 · Local implementation and synthetic engineering verification

Implemented the approved Classic presentation across the existing Petros V2 session and learning canvases. The approved reference is **`docs/Petros_Classic_Interactive_Demo.html`**, as clarified by the product owner. The existing academic services, reviewed content, durable commands, assessment and source authorization remain authoritative.

Open [the visual review gallery](review.html), [verification summary](verification-summary.json), [source diff against the saved working baseline](source-changes.patch), and [human usability study materials](usability-study.md). Screenshots and the recording are actual browser captures. They use safe synthetic sources/accounts and do not demonstrate real student or provider qualification.

## Implementation and integration

The existing session now composes `ClassicLessonLayout`, `LessonHeading`, `LearningStageIndicator`, `LearningSurface`, `PrimaryLearningAction` and `LearningFeedback`. These components only present supplied state. `ExplanationReader` uses the existing `StudioDialog`, `ClassicCloudContent` and `TeachingSources`; no second source renderer or assistance command was added.

`ClassicCompanion` and `ClassicCloudController` extend the existing Classic/M6 path for every supported subject. M6 `CompanionController` remains the event admission owner. `usePetrosSession`, `useStudioExperience`, the existing teaching canvas editors, source references, safe math/text renderer and formal feedback projection are reused. The generic stage indicator maps the existing presenting/participating/complete state to Explore / Your turn / Reflect. VM retains its actual per-attempt Predict / Try it / Explain stages. Indicators do not enable navigation.

The portal/session navigation, preferences, pause/resume, sources, original question, correction and evaluation controls remain in the existing application. Prototype demonstration subject switching and fake save/grade handlers were not imported.

### Exact source files changed

These are changes relative to the saved working baseline, not a clean Git HEAD. The checkout already had **443 status entries** and the Petros V2 feature directory was already untracked. All unrelated local changes were preserved. [Baseline](baseline.json), [source hashes/audit](source-audit.json).

| File | Change |
|---|---|
| `apps/student-web/src/features/petros-v2/petros-session-shell.tsx` | Modified |
| `apps/student-web/src/features/petros-v2/feedback.module.css` | Modified |
| `apps/student-web/src/features/petros-v2/teaching-support.tsx` | Modified |
| `apps/student-web/src/features/petros-v2/teaching-support.module.css` | Modified |
| `apps/student-web/src/features/petros-v2/learning-format.tsx` | Modified |
| `apps/student-web/src/features/petros-v2/petros-session-shell.spec.tsx` | Modified |
| `apps/student-web/src/features/petros-v2/classic-studio.module.css` | Modified |
| `apps/student-web/src/features/petros-v2/companion/classic-cloud-controller.ts` | Modified |
| `apps/student-web/src/features/petros-v2/companion/classic-companion.tsx` | Modified |
| `apps/student-web/src/features/petros-v2/companion/classic-companion.module.css` | Modified |
| `apps/student-web/src/features/petros-v2/companion/classic-cloud-controller.spec.ts` | Modified |
| `apps/student-web/src/features/petros-v2/canvas/session-teaching-canvas.tsx` | Modified |
| `apps/student-web/src/features/petros-v2/canvas/classic-vm-activity.tsx` | Modified |
| `apps/student-web/src/features/petros-v2/canvas/classic-vm-activity.module.css` | Modified |
| `apps/student-web/src/features/petros-v2/classic-learning.tsx` | New |
| `apps/student-web/src/features/petros-v2/explanation-reader.tsx` | New |
| `apps/student-web/src/features/petros-v2/classic-learning.spec.tsx` | New |
| `apps/student-web/src/features/petros-v2/companion/classic-cloud.fixture.ts` | New |
| `apps/student-web/src/features/petros-v2/companion/classic-companion.spec.tsx` | New |

### Cleanup supported by evidence

Removed the session shell's superseded `actionCue` / `actionState` derivation and its conditional `CompanionRig` branch after every session view moved to the existing Classic companion. The rig, shared M6 controller and renderer contracts still have consumers/tests and were retained. Removed VM-local stage styling superseded by the shared stage component and the old refusal selector superseded by semantic feedback. The VM no longer wraps its workspace in a second cream outer card. Optional rationale becomes a disclosure; source access stays visible. Factored the existing controller fixture into a test-only module.

The saved-baseline audit finds **14 modified files, 5 new files, 99 unchanged baseline files and no deletions**. The source patch makes each removal reviewable. No package, backend, schema, academic reducer, persistence hook or source-renderer change belongs to this implementation. Next's two generated verification-build type includes were removed from `tsconfig.json` while preserving its pre-existing edits.

## Visual design and responsive behavior

The central Classic CSS defines the twelve approved cream/sage/green/amber tokens. Semantic validation, review and evaluated feedback retain the existing accessible palette. The existing variable Outfit configuration (Latin subset, swap, preload) is reused; there is no additional font source. Every one of the 48 base matrix observations reports Outfit.

The desktop layout caps at 1260px, with a 270px companion column (260px at intermediate widths), 25px gap, 22px main corners and 30px × 34px padding. Body copy is 16px, headings approximately 30–36px; mobile heading is 28px. At 760px and below the companion and workspace become one column. A cloud-free mobile companion uses a small avatar/Ask row; with a cloud the original avatar sits to the right. No cloud is fixed over the lesson. Complex canvases keep their working geometry and keyboard controls.

The gallery presents preserved production-build before screenshots, new screenshots and approved reference screenshots. Before/new baseline comparisons use the same saved synthetic sessions. Every relevant view has a new capture at 1440×900, 1366×768, 1024×768, 768×1024, 390×844 and 360×800. The 48 base observations plus six refusal and six math correction observations report no page horizontal overflow.

The [browser recording](browser-walkthrough.gif) contains 31 real captures over approximately 14.35 seconds with recorded frame timestamps, showing network recovery, accepted allocations and refusal. It is a low-frame-rate engineering recording; smaller captured frames are letterboxed without rescaling UI content. It is not a staged replacement UI or a human study.

### Necessary differences from the illustrative prototype

- **VM:** the reviewed engine commits a separate prediction for each allocation attempt. That progression is preserved. Real source totals/reservations/per-VM values drive all visuals and outcomes.
- **Mathematics:** the reviewed fixtures expose capacity calculations, source-qualified equation steps and saved answers. The report shows the actual `48 / 8 = 6 VM` worked calculation, saved edit and assisted correction. No approved standalone `3(x + 2) = 18` transformation workflow exists in these fixtures; no local algebra validator or invented curriculum was added. Generic method and equation cards share Classic surfaces while retaining their existing editors.
- **English:** the existing reviewed activity is a source-linked claim/evidence/relationship diagram using a library council survey. Node/relationship locators and the original source remain intact. Prototype passage tiles and arbitrary text-span selection would require a reviewed academic workflow and were not fabricated.
- **Other canvases:** graph/table, process trace, relationship diagram, source reading and the existing bounded simulator use the same shared presentation. The synthetic experiment fixture selects the reviewed memory-allocation kernel; it is not evidence of a new simulator. There is no separate prototype screen for these types, so the gallery uses the approved general visual system as the reference and says so.
- Portal controls and real recovery/source/assessment controls remain, so page length differs from the standalone prototype.

## Academic integrity and recovery

No change was made to academic kernels, source permissions, submission construction, assessment policies or durable state. Prediction acknowledgement, simulator results and explanation acknowledgement come from existing session commands. Local option selection does not commit, show correctness or display a prediction cue. A refused seventh allocation retains six VM tiles and the committed count of six. Routine accepted allocations use the resource visualization without an automatic companion cue.

A saved explanation is explicitly **Saved · Not checked yet**. Evaluation feedback and review-required feedback still use the real evaluator response. Assisted corrections remain separate immutable submissions; the original independent answer remains visible. Browser evidence includes an actual private bounded correction evaluation and an English evaluation that abstains and requests teacher review. It is not general academic qualification.

The existing source/epoch/session/activity/revision/hash checks remain active. Requested help must equal the current authorized explanation and satisfy the existing help policy. Opening or closing its reader sends no additional academic command or duplicate exposure. The original Ask flow saves dirty work, interrupts the current teaching action when required, and issues the existing authorized ask/hint command. Failed saves do not display success.

Two actual socket failures were injected **before forwarding** to the existing synthetic API through the loopback-only [verification transport](verification-proxy.mjs). The prediction retained its selection with zero allocations, no new stage and no cloud. The failed explanation save retained its full draft without a saved confirmation; refresh/retry then recovered successfully. Authentication/cookies and upstream academic command checks were preserved. The proxy was test infrastructure, not production code.

Pause, reload and resume retain committed progress. Scope/epoch change, source invalidation, hidden page, blocked/closed session and unconfirmed submission suppress stale companion content. Automatic clouds disappear during text input or manipulation. A requested explanation remains available through its reader action while typing.

## Original Petros and event contract

The original static asset comes from `apps/student-web/public/petros/states/petros-idle.png`, selected through the existing `public/petros/v2/rig/manifest.json` neutral pose. Both files are byte-identical to the initial baseline:

| Asset | SHA-256 |
|---|---|
| Original idle PNG | `26fa3a0d8f831d19388a40aa6bb3a22d42e11535e18e5fff1d30236ce0584ec6` |
| Existing manifest | `9547828dae9db83068cfa9948bedf5fb39ca8a0959b82e383f76f53122145dff` |

There is no body animation or screenshot-derived avatar. The pre-existing 6% bottom presentation clip is retained to suppress an extraneous asset artifact without editing image bytes. Speech has a warm 22px cloud and one tail; thought has a 32px organic shape and two bubbles; notice uses amber. Entrance is 230ms and manual dismissal fades for 180ms. Reduced motion removes these animations. Invalidated content disappears immediately.

| Authoritative event | Presentation and lifetime |
|---|---|
| Authorized VM ready, no prior attempt | Speech: “How many VMs do you think will fit?” after 700ms, for 4s, once per scope |
| Local prediction selection | No cue |
| Confirmed prediction | Speech: “Let's test your prediction.” for 2.7s |
| Confirmed accepted allocation | No automatic cloud; resource result updates |
| Confirmed refused single VM | Amber notice: “No room left. This VM needs [actual GB], but only [actual remaining GB] is available.” for 6s; multi-VM requests retain actual aggregate values |
| Current observed attempt enters explanation | Speech using its admitted/refused question for 3.8s |
| Current explanation acknowledged | Speech: “Saved. Your explanation hasn't been checked yet.” for 4s |
| Explicit permitted help | Thought with exact short text, or neutral reader label for long content; until dismissed/replaced or authorization expires |
| Other subjects / evaluated result | Existing M6-admitted public caption; no frontend answer or verdict |
| Admitted blocked event | High-priority notice; authorization revocation still removes unavailable content |

One active cue, no indefinite queue, bounded deduplication and one current deadline remain in the existing controller. Requested help outranks optional introductions; critical notice/authorization wins. Manual exit timers only clear their own fading record and cannot remove newer cues. Long text (>160 characters or multiple paragraphs) gets the neutral label **Your reviewed explanation is ready to read.**; the complete authorized text, equations and references open in the reused safe reader without AI shortening.

## Accessibility

Native labeled inputs/buttons, a noninteractive `aria-current=step` progress list, visible focus rings, semantic live feedback and dismiss controls are retained. The native dialog provides Escape, tab containment, scrollable content, an accessible close action and opener focus restoration. Component and actual browser checks cover restoration. Diagram editing retains keyboard/form alternatives as well as dragging; undo/redo and persisted keyboard movement were exercised. Reduced-motion browser observation reports `animation: none`; focused textarea observation reports zero clouds with the avatar present.

**Unresolved evidence:** the mobile reader capture has an incorrect 360×202 raster that does not correspond to the requested 360×800 viewport. It is retained for diagnosis and excluded from visual approval. Reader functionality/focus is tested, but this particular narrow reader screenshot needs recapture. Browser tools/sessions became unavailable after the host restarted during reporting. Three final VM cue wording synchronizations also postdate the captures; the source tests/build verify the final copy, while screenshots/recording preserve the earlier copy. No screenshot has been altered to conceal either limitation.

## Measurements

Matched isolated Next production builds report `/petros/v2/session` **First Load JS 747kB before → 742kB after**, a reported 5kB reduction (~0.67%). Both build logs are preserved. This is a build-reported transfer metric, not a measured runtime speedup. One isolated build completed in 52.583s; it is not a comparative build-time benchmark. Twelve instrumented UI click-through-ack samples are preserved in `ui-timings.json`; they include automation/loopback/dev overhead and have no matched baseline, so no latency improvement is claimed.

No animation package, 3D dependency, global store or font dependency was added. Future opportunities include profiling retained editor/KaTeX route cost and lazy loading heavy canvases if measurements support it. No runtime performance, frame-rate, memory-leak or hardware qualification is asserted.

## Verification results and commands

| Check | Result / evidence |
|---|---|
| Pre-edit Petros component baseline | 341 passed in 32 files; `baseline-tests.json` |
| Full student application suite | 630 passed in 87 files; `student-tests.json` / `.log` |
| M5 contract + actual disposable-DB regressions | 80 passed in 5 files; `academic-tests.json` / `.log` |
| Petros schema/reducer contracts | 161 passed in 10 files; `schema-tests.json` / `.log` |
| Student TypeScript | Passed; `typecheck.log` |
| ESLint on changed TypeScript files | Passed; `lint.log` |
| Isolated production build | Passed; `build-result.json`, `build-final.log`, before/after build logs |
| Browser base matrix | 48 captures, 8 views × 6 widths, no page overflow; `final-browser-checks.json` |
| Additional browser work | Refusal/math matrices, focused input, source reader/Escape/focus, motion, failed saves, pause/reload/resume, English review required, diagram drag/undo/redo/keyboard persistence, graph point/row comparison |

Representative commands run from the repository root (output paths abbreviated):

```sh
pnpm --filter @edrion/student-web exec vitest run src/features/petros-v2
pnpm --filter @edrion/student-web exec vitest run --maxWorkers=4 --minWorkers=1 --reporter=json --reporter=default --outputFile=.../student-tests.json
pnpm --filter @edrion/student-web typecheck
pnpm --filter @edrion/student-web exec eslint <changed TypeScript files>
pnpm --filter @edrion/schemas exec vitest run src/petros-v2 --maxWorkers=2 --minWorkers=1 --reporter=json --reporter=default --outputFile=.../schema-tests.json
env -u DATABASE_URL -u DATABASE_MIGRATION_URL PATH='<existing PostgreSQL 17 bin>:'"$PATH" PETROS_M5_DB_TESTS=1 pnpm --filter @edrion/api exec vitest run src/modules/student/petros-v2/petros-m5-contracts.spec.ts src/modules/student/petros-v2/petros-m5-progress.spec.ts src/modules/student/petros-v2/petros-m5.integration.spec.ts src/modules/student/petros-v2/petros-m5-refinement.integration.spec.ts src/modules/student/petros-v2/petros-m5-interactive.integration.spec.ts --maxWorkers=1 --minWorkers=1 --reporter=json --reporter=default --outputFile=.../academic-tests.json
PETROS_ISOLATED_VERIFICATION=1 PETROS_M4_VERIFICATION=1 PETROS_STUDIO_INSTANCE=classic-browser NEXT_PUBLIC_PETROS_M4_DEMO=1 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:5019 NEXT_PUBLIC_DEV_STUDENT_EMAIL= NEXT_PUBLIC_DEV_STUDENT_USER_ID= pnpm --filter @edrion/student-web exec next build
```

The database tests use a fresh private Unix-socket database, with configured application database URLs unset. The initial database attempt could not locate `initdb` (nine tests skipped after setup failure); the existing mounted PostgreSQL 17 binaries resolved this and all five selected suites then passed with **zero failed or skipped tests**. The diagnostic is retained in `academic-diagnostic.log`. Default formatting initially referenced an absent Tailwind Prettier plugin; the existing formatter was run with the explicit compatible `prettier.json` (no dependency installation). Routine Vite deprecation/reduced-motion diagnostic output does not indicate a failed test. No failing final academic assertion remains.

### Browser scenario evidence

| Scenario | Files |
|---|---|
| Initial VM and responsive presentation | `after-cloud-b-{width}.png` |
| Prediction speech / accepted experiment | `final-prediction-speech.png`, `final-vm-accepted-3.png`, `final-vm-accepted-6.png` |
| Refusal and no seventh tile | `final-refusal-notice.png`, `final-vm-refused-{width}.png` |
| Explanation input/save | `final-explanation-speech.png`, `final-focused-input.png`, `final-explanation-saved.png` |
| Actual math edit and source worked example | `final-math-correction-{width}.png`, `math-authoritative-correction-result.png` |
| English evidence/relationship/reasoning | `final-english-evidence.png`, `final-english-reasoning.png`, `final-english-draft-restored.png` |
| Actual teacher-review outcome | `final-english-review-required.png` |
| Thought / reader / motion | `final-thought-{1366,390,360}.png`, `final-reader-1366.png`, `reduced-motion-thought.png` |
| Failure / recovery | `network-failure-prediction.png`, `network-failure-explanation.png`, accompanying JSON |
| Pause / resume | `final-paused.png`, `final-resumed.png` |
| Other actual manipulation | `final-diagram-drag.png`, `final-graph-point-comparison.png` |

Earlier exploratory files remain as diagnostics. In particular `before-graph-1366.png` is an intermediate hot-reloaded UI, `before-math-1366.png` is an initial VM with saved progress, and `prototype-english-mobile.png` has the wrong viewport. The gallery deliberately uses the later matched baseline/reference captures instead. Screenshots are full-page where appropriate, so their image height can exceed the nominal viewport height. The mobile reader diagnostic is the explicit exception described above.

## Human study and remaining gates

[Usability materials](usability-study.md) provide neutral first-use tasks, observation fields and save-versus-evaluation comprehension checks. **No participants have been tested and no usability approval is claimed.** Human testing, physical mobile keyboards/devices, screen-reader/assistive-technology qualification, broader real-course subject/source qualification and actual external-provider behavior remain pending. This local implementation does not grant an academic or production rollout approval. The mobile reader recapture is also outstanding.

## Petros World compatibility

Classic remains the default presentation. Both the existing renderer/M6 contract and authoritative educational events are retained. A future immersive renderer can consume the same accepted/refused operation and source-qualified teaching event, without a second teaching engine. No Three.js, WebGL, walking or flattened-PNG body animation was added. Future World work still needs approved original-character model/rig/artwork and tested pointing/attention/camera capabilities; the current static PNG cannot supply those embodied capabilities.

Capture format note: the browser returned JPEG bytes for screenshots saved under `.png` paths. The original bytes are preserved; the image audit reads their actual encoding and dimensions. Gallery images use the same original captures.
