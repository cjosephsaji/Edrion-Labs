# Petros concept-led learning revamp

The document planner now extracts concepts across page boundaries. Page numbers remain source references. The outline is cached by content fingerprint and extraction version; old page-batch caches are not reused. The concept pass uses the existing AI gateway through `document.concepts.extract`, with the contextual-answer route as its routing template. The output is checked for duplicate/page-only titles, source coverage, invalid ranges, and prerequisite ordering. A failed pass uses source headings, clearly identified in the preview, and retries after five minutes. Inputs above 120,000 serialized characters use the heading fallback rather than silently analyzing only the first pages.

Starting a document session re-reads the student's authorized concept pages. Teaching receives up to 120,000 source characters, separately from the short preview citations, and an explicit completeness flag. Overlapping page ranges do not select other topics' preview citations. Existing saved sessions retain their original plans; start a fresh session to use concept planning.

The study screen separates the current teaching block from expandable completed history. The progress header no longer covers the lesson while scrolling. Explanation prose uses normal case and readable type; the uppercase style is limited to labels. Diagrams no longer shrink inside a height-constrained flex container, larger concept maps receive more space, and arrowheads terminate at node boundaries. Full node labels remain available to assistive technology and hover titles.

Listen first narrates the current idea with Petros beside its declared visual anchors. Think it through stops narration. Both retain the required checks. Mode selection is persisted with block interaction state and supplied to subsequent planning through learner context. Pause and finish stop narration; elapsed time uses an authoritative server snapshot and wall-clock interpolation rather than counting timer callbacks. Reading/listening time is session time, not evidence of mastery.

Progress now distinguishes independent first answers from supported/guessed/fragile successes and unresolved attempts. Retries sharing a root question cannot inflate independent evidence. Self-rated closing recall is labeled as self-rated. Neither a completed step nor ending the session is presented as mastery. Long-term mastery remains the responsibility of the existing learner model and delayed review evidence; this change does not claim to validate long-term retention from one session.

## Learning rationale

Worked examples, explanatory questions, retrieval, and the combination of verbal and visual representations follow the [IES practice guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/1). The decision to preserve active checks alongside listen-first explanations is informed by [Freeman et al.'s undergraduate STEM meta-analysis](https://doi.org/10.1073/pnas.1319030111). These support the design choices; they are not evidence that this particular interface has already improved outcomes. Adaptation uses observed answers and stated needs, not fixed learning-style labels.

## Verification and rollout

Run the API outline, session-intent, loop-service and loop-policy tests; student session, contextual-entry, learning-evidence, mentor and spatial tests; and API/student typechecks. No new database migration is required: added planning/source/mode values use the existing JSON contracts and storage.

Browser QA was left to the user at their request. Check a new multi-page document lesson, prerequisite ordering, normal-case explanations, completed-history expansion, narrow-screen diagrams, narration pointing, question interruptions, pause/resume, and an early finish. Verify live concept extraction with the configured provider; deterministic tests validate the contract and failure behavior, not the model's semantic quality. Arbitrary generated SVG markup is not accepted: diagrams continue to use structured nodes/edges and declared target anchors.

Verified: 113 distinct targeted tests passed across the API and student suites. The final full-session progression check was rerun alone with a 15-second test allowance after it hit the default five-second limit during concurrent typechecking; it passed in about five seconds. Student typechecking and linting of the changed frontend components passed. Browser testing remains with the user.
Final API typecheck also passed. The student dev server is running on port 3011 with the existing local environment configuration.
