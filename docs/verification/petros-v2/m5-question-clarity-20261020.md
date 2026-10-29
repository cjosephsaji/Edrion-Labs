# M5 follow-up: question context and visual teaching

Date: 20 October 2026. Scope: the requested clarity and visual refinement of the existing M5 teaching screen. No M6 work or deployment.

## What changed

- The teaching screen repeats the exact public question. Short question details remain visible; long supplied passages stay available in an expandable section. Assisted practice carries the original scenario with it.
- Internal diagnostic wording is replaced with a short explanation of the teaching strategy. “Why this step?” is a visible illustrated card. “Your next move” gives the actionable instruction.
- “Already correct” and “Let’s revisit” describe the previous submitted answer. They use only a matching, completed public evaluation, and do not score or color the new editable example.
- A separate “Teaching source” card opens the real source excerpts. The existing footer Sources button uses the same presentation. Independent tasks still withhold the teaching excerpts until submission.
- The preview uses the label “Sample teaching material” and explains simulated reviews in “About this demo.” Genuine citations and material limitations remain visible outside preview mode. Full preview limitations remain accessible in the demo information dialog.
- The checked memory example now has a proportional segmented allocation bar and individual VM blocks. The worked example and the learner’s saved answer are explicitly labeled separately. For the review example, the checked result is six VMs while the saved learner answer remains seven until edited.
- Text-only mode retains the equation, explanation, answer controls, and equivalent teaching reader. The new cards stack at narrow widths; controls and disclosures retain keyboard focus indicators.

## Public data and assessment boundaries

The public teaching projection adds optional checked equation steps, filtered to equation elements in the accepted action prefix that are still present on the corresponding canvas with the matching source. Later examples remain hidden until their teaching beat is accepted. Independent tasks do not receive this teaching projection.

The diagrams draw those checked public quantities. They do not calculate correctness, create assessment results, or change the learner’s saved response. Existing immutable submission and assisted/repeated-practice checks still pass.

## Verification

- 57 frontend checks passed across the teaching support, canvas participation, feedback, studio presentation, and learning stage suites.
- 52 API checks passed, including real disposable-PostgreSQL checks of the accepted teaching prefix, original question retention, immutable wrong/corrected submissions, and assisted repetition.
- Frontend, API, and schema type checks passed. Changed frontend source lint passed.
- The direct demo entry returned 302; the authenticated public session snapshot, frontend page, and all three linked CSS files returned 200.
- The API snapshot confirms two previously satisfied criteria, a saved answer of seven VMs, a checked example of six VMs, and an editable participating teaching state.
- Memory-bar text contrast is 4.87:1 against its background (calculated from the declared colors).

Evidence is in `m5-question-clarity-20261020/`. Final test reports are `frontend-tests-verified.json` and `api-tests-final.json`. `http-verification.json` and `demo-public-snapshot.json` record the local service checks. `changes.patch` compares this follow-up against its scoped starting files; `files-modified.json` records source hashes.

An initial API test incorrectly expected a revealed equation immediately after starting teaching. The corrected test explicitly verifies an empty initial projection and then the first accepted reveal. The initial run also exceeded a 60-second integration-test deadline under concurrent type checking; the follow-up integration checks allow 120 seconds. Runtime authority and publication bounds were not relaxed. The initial failed reports are retained separately from final passing reports.

The browser automation URL policy previously rejected navigation of the local browser tab. No alternate browser surface was used to bypass it. This follow-up therefore has component, integration, type, lint, contrast, and HTTP checks; it does not claim a new browser screenshot, visual layout, or assistive-technology qualification. The earlier A–H recordings predate these changes.

## Open and review

Use [the updated calculation demo](http://127.0.0.1:4943/demo/method-preview?fresh=1). This isolated synthetic actor starts with an evaluated sample answer and reveals the real teaching steps, so both diagrams are immediately available. The API restart creates a new disposable database; old session URLs no longer identify current sessions. Enter through the demo link to receive its current cookie.

1. Confirm the question states 64 GB total, 16 GB reserved, and 8 GB per VM.
2. Read the rationale and the two prior-feedback groups. Open Teaching source, close it with Escape, and inspect About this demo.
3. Compare the 16/48 GB allocation bar and six 8 GB VM blocks with the separately saved answer of seven.
4. Change the capacity input, save the step, and use the existing reviewed-practice submission flow. Saving an edit alone must not turn it into an assessed correct answer.
5. Check 1440, 1280, 768, 390, and 360 px widths, enlarged text, keyboard controls, and text-only preference during manual visual review.

The API, frontend, and existing recordings server remain bound to loopback. No production database, external inference, publication, branch, or commit was used.
