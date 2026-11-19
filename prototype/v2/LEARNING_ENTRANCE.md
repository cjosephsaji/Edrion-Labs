# A clear beginning for Petros

## Product decision

Open with a question the learner wants to understand, a small achievable outcome, and one way to begin. The default `/prototype` route now opens the learning home after the existing access check. The home leads into the existing guided investigations. The 2D and 3D teaching implementations are retained.

The initial audience hypothesis is **a late-school or early-university STEM student who has encountered a concept but cannot explain why it works**. Their job is: “Help me make sense of this, so I can explain or apply it myself.” This fits the five working investigations better than a promise to teach every subject or replace a full course. It is a hypothesis based on current product capabilities, not validated customer research or a claim about the most profitable segment.

The distinctive experience is a short cycle of **question → prediction → visible consequence → explanation → a different case**. The visual model makes reasoning inspectable. The companion makes help feel approachable. Neither the novelty of a scene nor a visit count is evidence that someone learned.

## What changed

- A new learner sees a reassuring welcome and a topic search before the suggested experiment. Someone unsure where to start gets a clearly labelled traffic question, a concrete “I can…” outcome, and a single primary start action. Traffic is the fallback because the situation is familiar and does not first require the learner to understand AI terminology. This recommendation is editorial, not inferred personalization.
- A learner with a topic in mind can search the five authored investigations in plain language or expand their titles. Selection updates the question, outcome, prerequisite framing, and launch destination. Unsupported searches disclose the catalogue limit and offer a working recovery path. No arbitrary-topic generation is implied.
- Returning learners see their active question and the exact kind of next step their saved state supports: predict, observe, explain, revisit feedback, practise without a hint, or extend to another case.
- “Continue learning” restores the existing checkpoint. It does not automatically mark anything complete or skip the reflection/feedback page. Further-case and retry decisions remain in the existing lesson.
- A notebook shows cases explored and explanations matched to evidence, with hinted explanations identified. Repeated attempts do not inflate case counts. The latest attempt per case determines the summary, while the full attempt history remains inside the investigation.
- The guided lesson has a visible “My learning” return link. An explicit topic link selects that topic while retaining its saved case, stage, and attempts; other topic progress remains intact.
- `/prototype?view=2d` and `?view=2d&mode=explore` remain available. `?view=3d`, `?view=stage&lesson=…`, and `?view=world` now open the [new shared spatial journey](LEARNING_EXPERIENCE.md). The old `PETROS_V2_STAGE_DEFAULT` flag no longer overrides the home.
- No new dependency, account setup, placement test, external service, or AI call is required. Existing authentication and sign-out remain in place.

## Why this direction

Carnegie Mellon's Eberly Center emphasizes the relationship between goals, practice, feedback, prior knowledge and learner motivation. This supports stating what a learner is working toward and using their work to decide what help comes next. It does not establish a particular homepage layout or retention uplift. [Teaching and learning principles](https://www.cmu.edu/teaching/principles/).

Nielsen Norman Group recommends prioritizing common tasks and disclosing secondary complexity as needed. Its onboarding guidance favors contextual help over front-loaded instructions people must remember. Here, the initial screen introduces only the learning loop; the investigation explains each action when it is needed. [Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/), [Onboarding tutorials vs. contextual help](https://www.nngroup.com/articles/onboarding-tutorials/).

Freeman and colleagues' meta-analysis of 225 undergraduate STEM studies found benefits from active learning compared with traditional lecturing. This is evidence for making learners reason and participate, not evidence that this particular product, its animations, or its homepage improve learning. [Original study](https://doi.org/10.1073/pnas.1319030111).

These sources inform design decisions. They do not substitute for observing actual learners, testing the content, or measuring retention.

## Scope and boundaries

This change is in the standalone app deployed by this branch's `netlify.toml` (`prototype/v2`). It does not redesign the separate academic student dashboard or the older showcase embedded in `apps/student-web`.

Progress is browser-local and shared by people using the same browser profile; it is not account-synchronized personalization. Storage failure is disclosed. The catalogue contains five prepared investigations, not an open-ended tutor. The learning home adapts to saved actions and answers; it does not infer learning styles, certify mastery, or promise a session duration. Existing learning evidence is preserved.

## What to validate with learners next

Recruit an initial small group from the audience above, including students who say a current topic feels confusing. Give them the normal entry link without a tour. Ask them to think aloud; avoid explaining the interface first.

1. **Orientation:** Can they say what this is for, what they can learn, and what to do next before receiving help? Record their words and the point of hesitation.
2. **First useful action:** Can they choose a relevant question and commit a prediction? Distinguish supported from unsupported topic intent.
3. **Learning:** Can they explain the causal idea in their own words and apply it to a changed case? Check assistance used and misconceptions, not just button completion.
4. **Recovery:** After an incorrect explanation, do they understand the feedback and choose a useful next action? Does the companion's wording help or feel patronizing?
5. **Return:** On a later visit, can they recover their place and remember the idea? Ask whether they returned for a real learning need.
6. **Perceived value:** “What is clearer now?” and “What is still confusing?” are more informative here than time spent or a streak.

Compare this entrance with the previous default using the same learning content. Define activation as reaching and explaining a first experiment, with assisted and independent outcomes separated. Track voluntary return and delayed application alongside task success. Do not claim improved happiness or retention until measured. No analytics transmission was added by this change.

## Verification

`tests/learning-home.test.ts` covers catalogue validity, plain-language search, unfinished checkpoints, answer-aware next steps and repeat-attempt counting. `tests/learning-home-route.test.ts` covers the default entry, old default flags, explicit view links, invalid topics, authentication and server-rendered entry content. Run with the standalone unit suite and typecheck.

Live browser interaction and visual acceptance remain a separate verification step when browser access is available. Review new and returning states at desktop and phone widths, keyboard search/selection, focus transfer, reload/resume, blocked storage and an unsupported search. Source-level responsive rules and server rendering do not prove visual acceptance.

Local checks on 8 November 2026: all 206 tests across 19 files passed; the standalone TypeScript check passed; the development `/prototype` response returned HTTP 200 with the learning home and topic search before the suggested question. Browser preview access was unavailable and the native-app access request timed out, so no live interaction or screenshot approval is claimed. Changes remain local and have not been deployed.

To preview, run `npm run dev` from `prototype/v2`, then open `http://127.0.0.1:3022/prototype`.
