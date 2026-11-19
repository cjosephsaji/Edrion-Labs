# A guided experiment in two representations

Historical design record. As of 18 November 2026, the shared spatial comparison described here has been removed. The current 3D route opens the [editable workshop](MAKER_WORKSHOP.md). The 2D guidance remains available. This document's former spatial validation does not describe the replacement.

Implemented locally, 8 November 2026. This note supersedes the old World/Stage route descriptions for the current learner-facing experience.

## Who this is for

The initial audience is a curious learner who recognizes a question but cannot yet explain its mechanism. They need an approachable first success, useful help when stuck, and a reason to test the idea again. This audience choice is a product hypothesis, not validated customer segmentation. The first release covers five subjects and fifteen authored cases; it does not yet teach arbitrary subjects.

The core loop is question → prediction → controlled comparison → explanation → another case. The distinctive interaction is seeing two possible situations at the same moment, changing one thing, and tracing the consequence. The purpose of 3D is to make that comparison inspectable. Walking around an environment is no longer required to reach the learning activity.

## What learners now get

- One next-step cue and an explicit learning goal. Other subjects sit in a collapsed question selector.
- Plain-language introductions, three model-reading questions, and selectable visual parts in both representations.
- Prepared explanations for terms, an everyday analogy, actual snapshot numbers, causes and model limitations. Search finds authored answers and explicitly reports unsupported questions. This is not a live AI conversation.
- A causal walkthrough that moves the experiment to the matching snapshot. Opening help pauses replay. Help is recorded as assistance, not silently credited as independent learning.
- A new spatial comparison for neural learning, rocket motion, attention, traffic and relativity. Both situations use the same computed snapshots and scales. Changed results remain hidden until the learner predicts. Illustrative arrow lengths and scientific limitations are labelled.
- Diagram/3D switching within the same mounted learning session. Answers, case, stage and evidence remain shared. Reload retains the selected topic and presentation in the URL; saved learning progress remains local to this browser.
- An explicit retry after an incorrect explanation and a natural place to pause. No streak penalty, fake mastery score or forced continuation.
- DOM measurement text, keyboard-operable reading controls, bounded camera controls, reduced-motion playback behavior and a diagram fallback for failed WebGL. Narrow layouts put the prediction/explanation before the model; spatial bays stack when canvas width requires it.

## Routes and architecture

`/prototype` is the question-led learning home. `?view=2d&lesson=rocket` opens the guided diagram; `?view=3d&lesson=rocket` opens its spatial equivalent. Old `view=world` and `view=stage` links now enter the new shared spatial journey. Legacy renderer source is retained but those routes no longer mount it. The separate free lab remains at `?view=2d&mode=explore`.

`LearningStudio` owns the existing investigation state and playback. `LearningSupport` and `learning-guide` provide authored guidance. `InvestigationSpace` is lazy-loaded; `spatial-investigation` derives ranges and selects snapshots without implementing another simulation. Rendering is on demand when the scene is idle. No new package or external service is required.

## Research informing the decisions

These sources inform design hypotheses; none validates this particular interface or establishes a retention improvement.

- [PhET research](https://phet.colorado.edu/en/research): simulation design benefits from observation of how learners explore. Use controlled changes, visible consequences and learner interviews instead of treating visual novelty as sufficient evidence.
- [Self-Determination Theory in education](https://selfdeterminationtheory.org/topics/application-education/): autonomy, competence and relatedness inform optional help, understandable progress and a supportive companion. The goal is willing return through useful learning, not compulsive use.
- [MIT teaching resources on worked examples](https://tll.mit.edu/teaching-resources/how-people-learn/worked-examples/): concrete worked steps inform the numerical explanations. Learners subsequently explain and test a different case rather than only read a solution.
- [Review of cognitive load in immersive VR learning](https://doi.org/10.1111/bjet.13503): immersion can introduce additional cognitive demands. This is adjacent evidence, not a direct comparison of our desktop 3D interface. It motivates keeping navigation bounded and controls shared.

## Verification and remaining evidence

All 214 unit/reference/route tests pass across 20 files; the production build and its TypeScript check pass. New tests exercise guidance for every authored case, snapshot-grounded values, hidden changed values before prediction, assisted retry evidence, shared scales and measured-car identity. The existing browser regression scripts were updated for the collapsed selector and renamed help; they were not executed in this pass. Native browser inspection covered neural and rocket spatial rendering, a rocket prediction, revealed values, restoration after reload, opening contextual help, the causal midpoint, and switching to the diagram with the same midpoint and prediction retained. At the checked midpoint, both representations reported changed velocity of −8.62 m/s. This was a local desktop browser check with a narrow window, not physical mobile-device acceptance.

Still required before making effectiveness claims: novice usability sessions, all-topic device/browser coverage, screen-reader evaluation and physical low-end-device performance. Historical World/Stage screenshots and performance numbers do not describe this new renderer.

Start with 5–8 learners with differing prior knowledge. Ask them to begin without coaching, explain what changes, recover from a wrong prediction, find help, and explain a fresh case. Record first-action hesitation, navigation errors, help usefulness, transfer accuracy and whether they choose to return. Ask what felt confusing and whether the experience supported their own goal. Compare 2D and 3D on the same learning task; keep 3D where it adds understanding. Do not equate longer sessions with better learning or happiness.

Broader subject coverage requires validated content, suitable representations, worked examples, misconceptions and transfer questions for each new domain. A topic-name input alone cannot supply that quality.
