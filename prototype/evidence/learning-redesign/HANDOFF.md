# Petros interactive learning redesign — 30 October 2026

Implemented in the existing `Edrion-Labs/prototype/`. The sibling `petros-modules-private/` is the private source handoff, not the application repository. Production academic code, APIs, authentication gates, schemas, character artwork and room assets are unchanged.

## Result and controller changes

The existing controller already recorded responses, misconceptions and interruptions. The previous presentation exposed separate reveal/pruning controls, three help buttons, multiple navigation actions, a detached character sidebar and a checkpoint counter. It began with a mostly empty game tree and discarded progress on refresh.

The same controller now drives a diagram-first workspace, an integrated original-Petros caption, one primary task action, contextual help, and eight student-facing minimax concepts. `Show me → Your turn → Check my answer → feedback` uses explicit student actions. A primary MAX/MIN success requires a fresh application before validated continuation. An incorrect MIN choice of 8 receives the specific MAX/MIN explanation; the first retry preserves 3/8/5, repeated confusion produces a worked two-value example, and the new check uses different values. Further MAX/MIN checks rotate pairs so the immediately repeated failed question is not treated as recovery evidence.

`checkpoint.ts`, `controller.ts`, `curriculum.ts` and `use-lesson-controller.ts` remain the single educational system. Classic and World use the same `TeachingCycle`, questions, deterministic validation, observations and interruption checkpoints. The renderers do not determine correctness or advance on animation, voice or time. `CHECKING_UNDERSTANDING` remains compatible with historical callers; the primary interface moves directly from demonstration to awaiting a response. Lesson completion uses the existing recap phase.

The specified tree is shared: A=(3,5), B=(2,9), C=(4,1). Child minima are 3,2,1 and MAX chooses A with value 3. Left-to-right alpha-beta visits **five** leaves and skips only B's 9: C's first 4 is above alpha=3, so its remaining 1 must be examined. The legacy C=(1,4) fixture remains supported for historical supplied states; it is not silently substituted into new lessons.

Tab-scoped `sessionStorage` restores the lesson, question, diagram, selected response, observations, assistance, retries, remediation, interrupted beat and selected mode after refresh. An in-flight network request is cleared rather than replayed. Uploaded PDF contents/receipts are excluded. This is refresh recovery within the browser tab, not account/cloud or cross-device storage; storage denial falls back to an honest memory-only footer.

## Browser evidence

- [Minimax opening](minimax-opening.png), [MAX correct response](max-correct.png), [MIN wrong response](min-wrong.png), [simpler worked example](min-simpler.png), [fresh assisted success](min-recovered.png).
- [Correct-answer and contextual-interruption recording](recordings/correct-answer-and-interruption.webm). The MIN B question asks why 2 is chosen instead of 9, keeps that branch highlighted and resumes the exact visual/question.
- [Wrong-answer remediation recording](recordings/wrong-answer-remediation.webm).
- [Contextual interruption screenshot](contextual-interruption.png), [World shared state](world-shared-state.png).
- [31-second unanswered hold](no-response.json): actual before/after state, with no response, completion or observation invented.
- [Classic/World/Classic continuity](continuity.json): actual persisted observations and assistance before/after switching.
- [Complete browser results](browser-results.json), [World subject results](world-results.json), [responsive/keyboard results](accessibility-results.json).

Recordings are genuine automated browser interactions, silent, with reduced motion. They are not human usability studies. Screenshots include the actual original artwork and self-hosted Outfit font.

## Verification

The full Classic browser suite completed all 64 prepared tasks: AI3 12, AI4 12, EHS3 12, EHS5 12, AI 8, time travel 8. A separate World pass exercises the first five tasks of each lesson, including a wrong response, a fresh follow-up, recorded help and return-to-Classic continuity. World checks use its existing low-power viewport and the installed browser's native graphics backend. The full minimax correct/remediation/interruption paths and a 31-second unanswered hold are covered by the main browser suite.

Both layout suites target 1366×768, 1440×900, 390×844 and 360×800. Focused accessibility checks use keyboard activation of SVG values, Escape dismissal and focus return, Outfit verification, primary-button hover colors, diagram document-position stability when help opens, no horizontal overflow, and reduced motion. This is targeted browser accessibility verification, not a screen-reader certification or comprehensive WCAG audit. Consult the JSON results for the exact assertions and final status.

The baseline had 63 passing prototype tests. Eight persistence/fresh-application tests were added. The student-web production build completed successfully, including its type validation. Reproducible commands and final results are recorded in `verification.txt`.

## Scope and remaining limits

The response demonstrably changes the next teaching action. This remains an **authored, response-aware showcase**, with prepared alternative explanations and deterministic practice checks. It is not an unrestricted adaptive AI tutor or a formal mastery engine.

Free explanations are saved as **unverified**, without keyword grading. General-purpose AI responses, arbitrary-topic custom simulations and voice/TTS remain unavailable: the existing showcase server reports the lack of a qualified read-only model connector. Production conversation/assessment endpoints are not used as a workaround. KB inference, the toy weighted connection and time-dilation formula have bounded deterministic models. Construction and pollution illustrations are qualitative educational examples, with no invented physical measurements or professional certification.

Classic's diagrams animate the actual checked value toward its parent, with a direct committed result under reduced motion. World's whiteboard shows committed values directly. World retains its existing camera and static original-character poses; this change does not add articulation or upgrade decorative assets. No formal long-term learning claim follows from these automated checks. [The five-learner test protocol](USABILITY_TEST.md) is prepared; participants and observations are pending.

## Exact modified source/document files

The final file inventory is in [files-modified.txt](files-modified.txt). All intended changes are under `prototype/`; transient Next-generated tsconfig entries are removed after verification. Screenshots, recordings, JSON evidence and this report are under `prototype/evidence/learning-redesign/`.
