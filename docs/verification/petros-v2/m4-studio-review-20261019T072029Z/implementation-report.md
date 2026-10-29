# M4 Living Learning Studio — fresh review handoff

19 October 2026, Asia/Kolkata. Isolated engineering and human acceptance review. This pass reused and refined the studio already present in the dirty checkout; it did not create that earlier work from scratch. No M5 work or production deployment was performed. Preexisting later experiments were preserved.

## A. Executive summary

The actual student app has a studio welcome, broad learning stage, integrated existing Petros artwork, exact source comparison, explicit participation and committed-work reflection. This pass fixed exact excerpt/source identity, long structured excerpts, silent twelve-beat truncation, presentation-budget fallback, durable masthead exit, persistent device display preferences, system reduced motion, and positive feedback fencing. The isolated demo and browser runner now accept separate loopback ports and use a distinct cookie/build directory.

## B. Old M4 comparison

The earlier M4 narrow lesson card, detached vertical progress rail and dropdown flow are replaced by a central source/activity surface with a horizontal Explore / Your turn / Reflect trail. The Playground's right-hand companion/chat arrangement was not copied. The retained original recording frames and metadata were inspected from `m4-studio-20261015T192054Z/reference`; the two original named recording files are not present in this checkout. New captures below come from this implementation.

## C. Design and state map

Warm paper, forest ink, large editorial typography and a mint companion band continue the existing design. Entry highlights a real resumable session or an authorized available lesson. Public snapshot -> exact passage adapter -> existing PresentationController -> registered visible targets -> existing CompanionPoseController. Server task, response, evaluation, epoch and permitted actions decide which stage is available. No academic planner was added. [Design specification](design-spec.md).

## D. Petros integration

The existing `petros.current-png.v4` manifest and 8 authored PNG poses are reused; **8/8 asset hashes match**. Quiet idle is a neutral static pose. Teaching can admit the existing brief cardinal pointing pose only for a current visible target, with the existing hold/cooldown. Student work yields quiet neutral presence; Ask interrupts the shared presentation. Success captions require matching completed submissions and nonempty satisfied trusted-kernel criteria. There is no fabricated blinking, facial layering, articulated hand, independent gaze, handwriting or lip sync. Whole-image idle and approximate mouth overlays remain disabled in this studio. Compact, hide, text-only and reduced-motion controls remain available. Display preferences now survive reload, and device reduced motion cannot be overridden by a stored preference.

## E. Learning-stage modes

Explain uses exact public wording. Demonstrate progressively reveals authorized excerpts and native tables. Explore focuses supplied table rows or passage paragraphs without issuing assessments. Try uses native radio selection boards and a spacious prose area, preserving the issued response contract. Reflect shows the frozen committed response and only current authorized evaluation. Rich-renderer overflow falls back to all exact public text and the same permitted actions; blank text has an honest empty state. These modes share one shell.

## F. Source grounding

No subject-name behavior or new instructional facts were introduced. Cloud's actual table covers service-model responsibilities; the next source excerpt distinguishes logical and physical resources. English uses its actual claim/evidence passage. Structured quotations are no longer split at 1,400 characters or found by ambiguous text equality: each displayed excerpt resolves its exact source reference by the validated adapter identity. Long/fragmented explanation text is retained within the existing renderer budget; unsupported serialized size falls back to full text. [Asset inventory](avatar-assets.json), [actual source hashes and demo roles](demo-ready/demo-info.json).

## G. Interaction

Cloud's response remains the same structured field/choice IDs. English paragraph focus is a reading aid; its response remains qualitative prose. Explicit submission, task identity, instance hash, session/canvas revision and server commitments remain unchanged. The masthead now invokes the existing durable leave path so a dirty draft is saved before navigation. New browser checks verify that exact draft after returning and resuming.

## H. Feedback

Only complete, matching server evaluations can produce checked feedback. Missing/empty, stale, invalidated, unavailable, review-required and untrusted criteria cannot produce positive companion cues or satisfied markers. Submitted work remains visible. English remains teacher-review-required; pending/unavailable feedback never fabricates success. No mastery, XP, reward loops or client correctness computation was added.

## I. Ask Petros

The existing contextual source reread is explicitly labelled as a reread, not generated inference. Selected source questions carry the actual reference/unit/revision rather than arbitrary DOM text. Questions interrupt presentation without removing work. Independent tasks keep answer-revealing sources, replay and coaching blocked. Assistance, when specifically permitted by the existing server contract, records exposure before source help appears. Voice is honestly unavailable in this M4 studio.

## J. Reliability

The existing session hook and backend remain the authority for durable drafts, idempotent submissions, epoch fencing, pause/resume, reconnect and worker recovery. Cosmetic reading position remains same-tab and source-fingerprinted. Device preferences store four booleans only, with malformed/blocked storage fallback and no lesson or learner data. Browser checks cover pause/reload/resume, double submit, committed work reload, offline/reconnect, masthead exit and delayed evaluation.

## K. Security

No production controller, private instrument, evaluator, RLS policy, release policy or migration was changed. Only the disposable HTTP test fixture accepts its configured loopback CORS origin/cookie. Final M4 privacy, ownership, source withdrawal, assistance/exposure, response, canvas and worker tests passed alongside M3 release and V1 regressions. The isolated V1 browser fixture hosts the original saved-session route and Resume control but omits its optional adaptive endpoint; the V1 screenshot therefore includes that ancillary 404. The browser V1 assertion is a saved-route smoke check, while the real V1 full-journey and assignment-authority integration tests also passed. This does not qualify every V1 browser feature. Existing public schema validation also rejects impossible evaluation publications; view tests deliberately inject stale component props to check defensive rendering. The prior report's 28-case security coverage map remains applicable and is supplemented by the new source-identity, renderer-budget, preference and feedback tests. No paid inference or real academic qualification is claimed.

## L. Responsiveness and accessibility

Actual browser checks pass at 360, 390, 768, 1280 and 1440px, including native keyboard radio navigation. Screenshots and captures include 360px mobile, text-only, system reduced motion, hidden/missing character art and 200% CSS zoom. Dialog focus/Escape behavior and source text alternatives are preserved. Source strings render as text, including markup-looking strings. The final desktop comparison, English writing and narrow-screen captures were visually inspected. Physical mobile keyboards, a screen-reader user's session and low-performance hardware were not independently tested.

## M. Performance

Twenty browser radio-to-next-frame samples measured p95 **17.10 ms** in this local run. This is a local responsiveness observation, not target-device qualification. [Full measurements](performance-summary.json) retain page loads, navigation recoveries and the actual warm M4 admission/read/evaluation workload. Existing presentation timing owns source reveal and companion cues; the studio adds no autonomous avatar timer, speech generation or per-click LLM request. Background visibility interrupts the controller and suppresses motion.

## N. Verification

| Final run | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Student frontend | 423 | 0 | 0 |
| Schemas, canvas and timeline | 583 | 0 | 0 |
| API M4, M3 and V1 | 1564 | 0 | 0 |
| Browser | 55 | 0 | 0 |

**2,570 automated assertions and 55 browser checks passed.** Student/API builds, API/schema/student/API-client typechecks and final focused lint passed. Exact command/environment/duration receipts and JSON logs are retained beside [verification-summary.json](verification-summary.json).

Earlier failed attempts are retained: the API run with the obsolete readiness-patch flag had 14 failed files, 273 passed assertions and 1,291 skipped assertions; the current-tree run has 1,564 passed / 0 failed / 0 skipped. Two deliberately invalid negative UI fixtures initially failed schema parsing; they were corrected to inject stale view props explicitly, and all 423 student assertions now pass. Browser setup first lacked Chrome; the installed Brave browser is used. The first browser run stopped at a transient empty response (38 passed / 1 failed); the second stopped at a hardcoded old V1 URL (53 / 1); the final configured-port run is 55 / 0. Initial demo startup lacked initdb on PATH; the successful demo uses the installed tools in its disposable cluster. The unavailable Prettier Tailwind plugin was not installed or bypassed silently: equivalent formatting settings without that plugin were saved locally. Forced lint on the ignored Next config first found 11 missing-Node-global errors; the explicit global declaration fixes those and final config lint passes. Vite's CJS deprecation warning and V1 fixture Redis reconnection logs remain in the receipts.

## O. Visual evidence and exact URLs

- [Review gallery and all four uncut recordings](http://127.0.0.1:4955/review.html)
- [Welcome / authorized opportunities](http://127.0.0.1:4953/demo/entry)
- [Cloud introduction and comparison](http://127.0.0.1:4953/demo/delivery)
- [English source and writing](http://127.0.0.1:4953/demo/english-delivery)
- [Paused checkpoint](http://127.0.0.1:4953/demo/paused)
- [Delayed evaluation](http://127.0.0.1:4953/demo/pending), [unavailable evaluator](http://127.0.0.1:4953/demo/unavailable), [withdrawn source](http://127.0.0.1:4953/demo/blocked), [no lesson](http://127.0.0.1:4953/demo/empty)
- [Existing V1](http://127.0.0.1:4953/demo/v1), [current role/session URLs](http://127.0.0.1:4953/demo-info)

Each handoff signs in its disposable actor; use `127.0.0.1` consistently. No real credentials are needed. All current screenshots are in [browser/](browser/). Recordings: [A — Cloud](browser/recordings/A-desktop-cloud.webm), [B — English](browser/recordings/B-desktop-english.webm), [C — Mobile](browser/recordings/C-mobile-360.webm), [D — Companion](browser/recordings/D-companion-behavior.webm). These are uncut actual browser captures, with raw files and SHA-256 receipts in [recordings.json](recordings.json).

## P. Limitations and preservation

Human acceptance remains pending. The earlier M4 report's unresolved historical preservation failure is **not repaired or cleared by this pass**: five M3 receipts were overwritten in that earlier run and their original bytes remain unrecovered. The new run redirected all legacy evidence writers. A preexisting later experiment's dev log appended when the shared frontend changed; its original 5,900-byte prefix is verified against the starting hash and retained in this directory. The required main report receives a dated addendum while its complete previous bytes are retained, hashed and backed up. [Current preservation audit](historical-audit-current.json).

No M5 academic adaptation, new planner, learner-belief changes, M6 rig capability or M7 voice was implemented. Preexisting later source/processes were not removed. No deployment, commit, production database write, provider spending or academic acceptance was performed. The two original named video files are not currently attached; retained reference frames/metadata were used. The current captures are fresh evidence of the actual implementation. Synthetic review records demonstrate authority paths and deterministic feedback, not expert content approval. Broader historical acceptance gates remain open.

## Q. Manual review

1. Open the gallery, then Welcome. Check that a saved session is featured only when one exists.
2. Open Cloud. Play or step the explanation, inspect the table and logical/physical excerpt, select a row, and open contextual Ask. Confirm the honest reread label and return to the same place.
3. Try a question. Select the permitted choices, check that Ask and Sources cannot disclose answers, save/pause/reload/resume, then explicitly submit. Confirm the frozen response and real criterion feedback.
4. Use the masthead with an unsaved draft and return to that same session. Resume and verify the exact choices.
5. Open English, focus a passage paragraph and write prose. Save/pause/reload/resume/submit. Expect teacher review and no success claim.
6. Inspect 360px, keyboard controls, preferences, reduced motion, hidden artwork, text-only mode, offline recovery and the failure handoffs. Review the four uncut recordings.
7. Record human acceptance or rejection, including the historical preservation issue. Stop at this student-experience review. Do not proceed to M5 from this handoff.
