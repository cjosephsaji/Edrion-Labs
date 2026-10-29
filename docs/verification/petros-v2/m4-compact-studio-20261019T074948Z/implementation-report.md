# M4 studio — compact workspace and active companion revision

19 October 2026 (Asia/Kolkata). This is a response to the user's rejection of the earlier spacious, static design. Human visual acceptance is still pending. This is frontend M4 work only.

## What changed

The studio masthead drops from 87px to 52px, the outer desktop margin from 48px to 20px, and the lesson title from up to 43px to 26px. Objective, progress and current activity are much closer together. Duplicate subject/title labels, duplicate source headings, the extra bottom slogan and the separate End-session row have been removed. Working notes appear only where there is an issued task; optional controls no longer consume an explanation row.

The character is no longer inside a 157px promotional strip. Petros and a content-sized speech bubble share a compact instruction area, with the authored avatar at 76×102px on desktop and 58×78px on mobile. Teaching and listening use the actual existing pose controller and PNG artwork. A genuine question now admits the existing listening pose, while assessments still force neutral attentive behavior. No independent idle timers, invented face layers, fake speech or new avatar engine were added.

The source stage now shows one current representation. A compact trail switches among already revealed source excerpts without losing the checkpoint. Text-only mode retains every revealed source. The current source changes as the same presentation controller progresses; text highlights follow its actual progress. Fresh, visible normal-motion lessons begin one source-backed introduction automatically. Saved checkpoints, task states, explicit interruptions, hidden pages, reduced motion and text-only mode never cause an unrequested restart. The active source panel is saved alongside the reveal count, so pause/reload/resume returns to the same selected comparison.

Selecting a table row now brings that row's exact source values into a focus panel. On desktop that panel sits beside the table; on mobile it stacks. It uses the supplied header/cell values and makes no new responsibility claims. Cloud's selection IDs and English's qualitative response contract remain unchanged. All committed work and deterministic/pending feedback remain server-owned.

The welcome screen now has a short greeting and concise lesson rows, replacing the oversized two-line hero. It only says Continue when an actual resumable session exists. Display preferences continue to persist without retaining lesson content.

## Direct visual comparison

At 1440×900, the revised focused Cloud comparison ends at 736.27px and the full page remains 900px tall. The prior Cloud comparison capture was 1618px tall at 1440px width. This is an observed layout comparison, not a hardware performance benchmark. The revised assessment and its Submit control are visible together on desktop. Keyboard input and no-horizontal-overflow checks pass at 360, 390, 768 and 1280px; 1440px is used for the full lesson flow. The 360px screenshot retains 44px mobile controls and a readable single-column response area.

I attempted to inspect the live Companion Playground at 3011, but its session could not be verified. I used the existing actual Playground recording instead, copied byte-for-byte into `reference/playground.mp4`, with its source path and SHA-256 recorded in `reference/provenance.json`. I also inspected its existing interaction/controller and placement implementation. No authentication was bypassed, no Playground route was widened, and its separate chat/sidebar layout was not copied.

## Verification

- Student frontend: **428 passed, 0 failed, 0 skipped**, across 70 test files. This includes the canvas, timeline, companion, persistence preference, feedback and responsive component regressions.
- Actual browser checks: **26 passed, 0 failed, 0 skipped**, with no observed runtime errors.
- Student production build: passed.
- Standalone student typecheck: passed after the build completed.
- Focused lint: passed.

Browser checks cover fresh introduction and actual pointing artwork, one current representation, exact row focus values, the 900px fit, actual listening posture on Ask, honest source reread, selected-panel pause/reload/resume, independent-assessment help blocking, exact draft restoration, real deterministic feedback, English pending review, native radio keyboard navigation, text-only mode and preserved source history.

Earlier failures are retained in this new evidence directory. The first full student run had 425 passed and 2 failed because longer source captions pushed maximum-size fixtures over the existing 64k presentation budget; shorter captions fixed that without increasing the bound or truncating source content. The first browser run failed the geometry assertion at footer 906.77px; the table focus layout was improved until the final 736.27px result. The next browser attempt checked listening before the real async dialog rendered; the final check waits for the dialog. A standalone typecheck overlapped Next's regeneration of route type files and failed TS6053; the successful build and subsequent sequential typecheck passed. The original logs and command receipts remain beside the final ones. No API or schema suite was silently claimed as rerun in this frontend-only pass.

## Evidence and manual review

- [Open the revised lesson](http://127.0.0.1:4953/demo/delivery)
- [Welcome](http://127.0.0.1:4953/demo/entry)
- [English source and writing](http://127.0.0.1:4953/demo/english-delivery)
- [New screenshots and recordings](http://127.0.0.1:4957/review.html)
- [Exact test results and limitations](verification-summary.json)

Screenshots are in `browser/`. Four recordings show Cloud, English, mobile and companion transitions. They are uncut actual browser captures; provenance and hashes are in `recordings.json`. Screenshots of the source comparison, student activity, English writing, 360px layout and teaching pose were manually inspected. Browser control became disabled in Work settings after the successful capture run; no alternate browser-control method was used to work around that setting.

To review: open Cloud, watch or step the real source introduction, switch to Comparison, focus a row, ask about it, then pause/reload/resume. Try the issued question, save the draft, resume and submit. Open English to compare the passage-plus-writing surface and confirm it remains teacher-review-required. Check mobile and text-only mode. The current display remains usable when Petros is hidden.

## Boundaries

No backend authority, academic assessment, source release, evaluator, database migration, provider route, M5 adaptation, M6 art capability or M7 voice was changed. Captions do not read drafts or infer a misconception. A success reaction still requires actual evaluated feedback. The previous historical preservation exception remains unresolved; this refinement does not clear it. All evidence from this pass uses a new directory. The original report is preserved with a dated update; existing M1/M2/M3/M4 receipts and recordings are not overwritten. Human acceptance is the next step, not an inferred consequence of passing tests.
