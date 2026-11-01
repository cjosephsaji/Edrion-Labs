# Topic workflow handoff

The API key is blank, as requested. The prototype is running at [localhost:3022/prototype](http://localhost:3022/prototype). [Setup and the full workflow](../../TOPIC_SETUP.md) describe the configuration to add later.

## What changed

The topic form previously called an endpoint that unconditionally returned 503. Its error appeared in a notice above the page, so submitting from the topic section looked like a dead button. Submission now has a busy state, prevents duplicate requests, preserves the question and reports failures directly below the form.

**How do integrals work?** opens a real prepared lesson immediately, without an API. Its six concepts cover accumulation, rectangle sums, convergence, definite integrals, signed area and antiderivatives. Both modes use the same state and controller. The plot computes a left-endpoint sum and exact integral for `f(x) = m x` over `[0,b]`; slope, upper limit and rectangle count update the displayed calculation. The controls use bounded integer values, and the totals are displayed precisely for those values.

For other topics, the server connector is ready to request a complete structured blueprint: goals, prerequisites, ordered concepts, diagrams, worked examples, simpler explanations, practice checks, option-specific feedback and a different follow-up. The app validates the complete response, creates question IDs/links and opens it in the existing teaching loop. Generated text is never executed as code. Contextual questions use the same isolated connector when configured, with the actual current step and computed diagram values. Replies can add explanation text only.

No concept advances because time elapsed, an animation finished or a model replied. The student requests the demonstration, submits a response and explicitly continues. A mistake leads to feedback and another application. Help pauses the checkpoint. Refresh and mode changes preserve the active blueprint, diagram, drafts and observations. Late topic responses cannot replace a newer module choice.

## Browser evidence

- [Inline connection feedback](inline-connection-message.png)
- [Integrals in Classic](integrals-classic.png), [integrals in World](integrals-world.png)
- [1366 px layout](integrals-1366.png), [390 px layout](integrals-390.png), [360 px layout](integrals-360.png)
- [Provider fixture diagram/lesson](provider-fixture-flow.png) — explicitly a controlled fixture, not a live AI result
- [Actual browser assertions](results.json)

## Verification

- Prototype unit suite: **101 passed**, including 20 topic workflow tests. These cover prepared-topic routing, the integral calculation, response gates, recovery, provider request construction, malformed/refused/incomplete responses, sanitized failures and contextual answers.
- Topic browser suite: **9 scenarios passed**. It completes all six integral concepts, exercises the controlled generated-topic and contextual-answer fixtures, checks refresh and mode continuity, and confirms cancelled requests cannot overwrite a newer lesson or lock its Ask button.
- Existing lesson regressions: **64 Classic tasks** and **30 World tasks** passed across the six existing lessons. Their browser results report no runtime errors or production mutations: [Classic](../learning-redesign/browser-results.json), [World](../learning-redesign/world-results.json).
- Topic screenshots were visually reviewed at desktop and 360 px phone widths; automated layout checks also cover 1366 px and 390 px with no horizontal overflow. World integration, focus dismissal and actual area controls are included in the topic suite.
- The student-web production build and TypeScript checks passed. The running local preview returned HTTP 200, and the local `OPENAI_API_KEY` was confirmed blank without logging its value.

Provider tests use controlled fixtures only. No live model call was made. The exact topic-browser assertions and empty runtime-error/production-mutation lists are in [results.json](results.json).

## Implementation files

All paths below are relative to `prototype/`; existing uncommitted redesign and motion work was preserved.

| Purpose                                                         | Files                                                                                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prepared mathematics lesson                                     | `lessons/integrals.ts`                                                                                                                                                                           |
| Topic routing, blueprint validation and model prompts/connector | `teaching/topic-catalog.ts`, `teaching/topic-content.ts`, `teaching/topic-provider.ts`, `teaching/lesson-registry.ts`                                                                            |
| Shared state, teaching gates, feedback, hints and recovery      | `teaching/types.ts`, `teaching/controller.ts`, `teaching/checkpoint.ts`, `teaching/curriculum.ts`, `teaching/contextual-explanations.ts`, `teaching/demonstration.ts`, `teaching/persistence.ts` |
| API dispatch                                                    | `teaching/server.ts`                                                                                                                                                                             |
| Form feedback and shared lesson selection                       | `components/home.tsx`, `components/showcase.tsx`                                                                                                                                                 |
| Concept diagrams, integral controls and learning path           | `components/topic-lesson.tsx`, `components/workspace.tsx`, `components/showcase.module.css`                                                                                                      |
| World integration and board rendering                           | `world/room.tsx`, `world/board-content.ts`                                                                                                                                                       |
| Tests and controlled fixtures                                   | `tests/topic-workflow.spec.ts`, `tests/topic-workflow-browser.mts`, `tests/fixtures/topic-outline.ts`                                                                                            |
| Commands and documentation                                      | `package.json`, `TOPIC_SETUP.md`, `README.md`, `DEVICE_SETUP.md`, this evidence directory                                                                                                        |

The only new machine-local configuration outside `prototype/` is the ignored `apps/student-web/.env.local`, containing a blank `OPENAI_API_KEY` and the topic model setting. Original room/character assets and production academic evaluation implementations were not changed.

## Limits

No real provider call was made. Live provider access, academic content quality, latency, quota and billing must be checked once credentials are added. Strict schema validation establishes that a lesson is structurally usable; it does not certify its facts or answer key.

Generated topics currently use a three-stage conceptual diagram and the shared practice loop. The integrals lesson has an authored quantitative plot. The model cannot generate arbitrary executable simulations or replace the approved 3D room/character. Existing private source-module help and voice boundaries remain as described in the setup guide.

Performance was not re-benchmarked for this feature; the larger-viewport frame-pacing limitations from the [motion handoff](../world-motion/HANDOFF.md) remain relevant.
