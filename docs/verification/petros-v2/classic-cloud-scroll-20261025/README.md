# Classic styling, focus, and companion follow-up — 25 October 2026

This follow-up addresses the user’s screenshots of a heavy double focus outline, cramped equation and annotation forms, an elongated thought cloud, and Petros leaving the viewport during desktop scrolling. The prototype in `docs/petros_vm_thought_cloud_prototype.html` is a visual reference only.

## Changes

- One theme-aware 2 px keyboard focus treatment across student-web. Text fields use an inset outline and suppress old focus shadows and Tailwind ring layers. Buttons, links, summaries, radios, and other controls keep a visible keyboard indicator. Forced-colors mode uses the system Highlight color. Old wrapper halos in login, resource cards, and the mentor composer were removed so they do not stack around the active control.
- Default form fields use the shared control radius, readable inherited type, consistent padding, and a 44 px minimum height. Explicit SVG foreignObject geometry remains in charge of diagram controls.
- Classic correction forms now receive the shared teaching form styles. Labels, full-width inputs, unit hints, save buttons, annotation textareas, and disclosures use consistent spacing. Two calculation cards sit beside each other when there is room and stack on narrower screens. Worked examples stay available in a disclosure; the visible saved value is neutral and does not imply correctness.
- Shared learning-card headings use consistent sans-serif type. Neutral saved/pending feedback uses the same subdued sage/cream palette; correct, incorrect, partial, and review states keep separate semantics.
- Petros follows desktop scrolling in the existing right column using sticky positioning. On narrower layouts the companion stays in normal flow, without covering lesson fields. Thought-cloud body height adapts to viewport height; fixed corner curves prevent long text from becoming a tall oval. Long source explanations remain scrollable. Petros art, labels, and help controls remain visible on the desktop sizes checked. Hovering the art does not introduce a rectangular button background.

## Verification

- `student-web-tests-final.log`: all 616 tests in 84 files passed, including all 339 learning-studio tests.
- `lint-final.log`: focused ESLint passed for the changed TSX files.
- `typecheck.log`: standalone type checking passed before the final layout-only changes; the final production build also checks types.
- `format-final.log`: formatting checked for the changed feature files. Existing global and legacy CSS formatting was preserved.
- `build-verified.log`: final optimized production build, generated in an isolated output directory so it does not disturb the running development preview.
- Real UI test flow used a separate synthetic `cloud-b` actor. The user’s lesson was not reset. The test submitted an independent response, waited for actual evaluation, advanced the approved demonstration, recorded a prediction, allocated a VM, saved an explanation, saved the revised capacity, and saved an annotation through the existing commands.

Screenshots show the actual running application:

- `explanation-focus.png`: explanation text field with a single integrated border.
- `correction-desktop-final.png`: consistent calculation cards and fields, with Petros alongside the scrolled workspace.
- `correction-mobile.png`: calculation and annotation fields at 390 × 844, with no horizontal page overflow.
- `desktop-cloud-and-correction.png`: requested thought cloud and full character at 1366 × 768.
- `correction-panel-desktop.png`: full-width annotation form and save action before the final two-card desktop layout.

Observed computed styles: the independent response input and explanation textarea both had a 2 px outline with -1 px offset. The explanation textarea had a 1 px border, 8 px radius, 16 px text, and no box shadow. At 1366 × 768 after scrolling, the companion dock stayed at y=16; the cloud body was 98 px tall with 716 px of accessible scrollable text, the character ended at y=511, and the dock ended at y=591. Neither the cloud nor its controls overlapped the workspace. At 390 × 844, the correction input was 294 px wide with 16 px type, and the page had no horizontal overflow.

## Verification limit

Local browser use was disabled in Work settings during the final mobile thought-cloud check. The remaining mobile-cloud, short-viewport, and additional-page visual checks could not be completed. Resetting the browser viewport was attempted immediately and was blocked by the same setting; the preview may remain at the mobile test width. No alternative browser-control mechanism was used. Later global shadow cleanup and SVG minimum-height protection were checked by source review, tests, and production compilation rather than additional live browser checks.

## Preservation

`summary.json` records exact presentation-file hashes and checks protected API, schema, and original Petros assets against the earlier implementation baseline. Academic state, command payloads, evaluator policy, backend authorization, original character images, and source material were not changed in this follow-up. The original independent answer remains separately identified in the correction panel; editing the current saved value does not rewrite it.
