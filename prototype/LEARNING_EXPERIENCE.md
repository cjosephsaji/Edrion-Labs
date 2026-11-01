# Learn, Apply, Test in the local prototype

The complete authored experience is available in **AI Module 4: How an AI Reasons with Knowledge**. Open [the local prototype](http://localhost:3022/prototype), enter Petros World and choose that book from the Library. Classic uses the same controller and evidence. No AI key, production API or database is required.

## Student journey

1. Answer two optional starting questions, or skip the diagnostic. Facts-versus-rules confusion starts with foundations; reversing an implication prompts direction-specific teaching. Two correct unassisted answers let the student begin the first application immediately. This establishes a starting point, not an ability score or verification.
2. **Learn:** read the objective, inspect the model and request a worked demonstration. Simpler teaching, repetition and another example remain available.
3. **Apply:** select a response and explicitly check it. The reasoning board supplies facts and one-way rules. Its candidate conclusions are real response controls in Classic, the room and Focus Board.
4. Receive feedback about the submitted response. Missing support is distinguished from reversing a rule. Repeated mistakes offer another worked example, review or unverified continuation.
5. **Test:** answer an unused authored question. The first bank uses sensor rules; the second uses plant rules, differing from the guided bird examples. Only a fresh unassisted correct application can verify the concept.
6. Request help whenever needed. Help or source reading marks the current attempt assisted. A correct assisted check cannot independently verify the concept; another unused variant is offered.
7. Explicitly continue, or continue/skip unverified. Back and review preserve earlier evidence.
8. Finish the sequence, or use **More → Finish lesson and review evidence**. The recap offers five mixed questions, including a two-rule inference. Results distinguish independent correct, incorrect, assisted and skipped outcomes and link back to weak concepts.

## Evidence

Position and achievement are separate. The compact strip shows concepts visited, verified now, needing practice and visited but unverified. The recap includes skips and per-concept attempt counts.

| State          | Meaning                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Not assessed   | No meaningful practice evidence or study visit exists                                                |
| Learning       | Visited, without independent verification                                                            |
| Needs practice | Incorrect, partial or assisted applications have not been followed by qualifying independent success |
| Verified now   | The latest fresh unassisted check was correct                                                        |
| Retained       | Reserved for a separate delayed assessment; never awarded here                                       |

An assisted answer does not erase an earlier valid independent success. A later incorrect independent check recommends practice while preserving the earlier response history.

Each attempt records concept and question/variant identity, submitted response, validation, assistance, attempt number, independence, skip status, intervention and submission time. Watching, navigating or clicking Continue cannot create a successful assessment. Written explanations remain unverified.

Navigation and learning evidence have separate state fields. The existing controller and shared validator own selections, evaluation and transitions. Independent question exposure is recorded separately from submission, preventing a previously revealed question from being recycled as fresh.

There are two independent variants per showcase concept and five mixed questions. Exhausted banks offer practice, review or continuation with evidence unchanged.

## Scope

| Capability                                                | Existing lessons generally                          | Knowledge showcase                                |
| --------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------- |
| Learn/Apply, existing diagrams and explicit pacing        | Preserved                                           | Supported                                         |
| Actual practice evidence, help, retries, skips and review | Supported                                           | Supported                                         |
| Compact progress and detailed recap                       | Supported                                           | Supported                                         |
| World/Classic and refresh continuity                      | Supported                                           | Supported                                         |
| Diagnostic                                                | Existing start preserved without authored questions | Two questions with three starting branches        |
| Independent Test                                          | Unavailable until suitable checks are authored      | Two variants per concept                          |
| Mixed assessment                                          | Unavailable without authored content                | Five questions                                    |
| Candidate-conclusion reasoning board                      | Existing models preserved                           | Shared Classic, World and Focus Board interaction |

Generated topics keep their existing connector and practice flow. Model-declared answer keys are not promoted into independent verification. Adding a key does not automatically provide qualified assessments for every topic.

## Storage and presentation

Session storage belongs to the current browser tab, with a disclosed memory-only fallback. It is not account-level course history. Checkpoint envelope version 4 ignores older or invalid envelopes rather than interpreting them as new assessment evidence. Uploaded contents and pending requests are excluded.

World keeps the room, library and original character. Desktop teaching uses a stable reading column beside the board. Narrow screens use a scrollable task area and prominent Focus Board. Canvas resizing refits the board without a new camera journey. Keyboard operation and reduced motion remain supported.

The main-platform Petros backend is unchanged. No production conversations, assessments or academic records are written. Voice remains unavailable.

## Manual verification

1. Select the showcase from the World Library. In the diagnostic, choose **Bird(Lark)** and **Yes, reverse the rule**. Teaching should address implication direction, with zero verified concepts.
2. Work through or explicitly skip the first four concepts. On **Supported derivation**, press Show me and Your turn.
3. Open Focus Board, choose **CanFly(Tweety)** and check it. Feedback should identify the missing flight rule and offer another application.
4. Complete guided practice, then Test this concept. Request simpler help and answer correctly: this attempt must remain assisted.
5. Try the different independent question without help. Only that correct response should update the concept to Verified now.
6. Switch to Classic and refresh. The active question, evidence and supported checkpoint should remain intact.
7. Finish the sequence or use More to review evidence. Take the mixed check, deliberately missing the two-rule question, requesting help on another and skipping another. Results must reflect those actual conditions.
8. Select Review weak area. The relevant concept should reopen without deleting prior evidence.
9. Start a new showcase and skip the diagnostic. Standard teaching should open with starting knowledge not assessed.

## Verification commands

Run with the dev server and an installed Chromium browser:

    pnpm --filter @edrion/petros-showcase test
    pnpm --filter @edrion/petros-showcase run verify:experience
    pnpm --filter @edrion/petros-showcase run verify:learning
    pnpm --filter @edrion/petros-showcase run verify:learning-world
    pnpm --filter @edrion/petros-showcase run verify:learning-accessibility
    pnpm --filter @edrion/petros-showcase run verify:topics
    pnpm --filter @edrion/student-web exec tsc --noEmit

For the isolated production build, run these PowerShell commands from the repository root, then run TypeScript checking after the build completes:

    $env:PETROS_SHOWCASE_ENABLED='1'
    $env:PETROS_SHOWCASE_LOCAL_ONLY='1'
    $env:PETROS_ISOLATED_VERIFICATION='1'
    pnpm --filter @edrion/student-web exec next build
    pnpm --filter @edrion/student-web exec tsc --noEmit

Device and dev-server prerequisites remain in [DEVICE_SETUP.md](DEVICE_SETUP.md). See [executed checks, evidence and file inventory](evidence/learning-experience/HANDOFF.md).
