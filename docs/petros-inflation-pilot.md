# Petros Inflation Lab pilot

Open `/petros/pilot` in the student portal (locally, http://localhost:3011/petros/pilot). The Petros landing page also links to the pilot for institutional students with learning permission. Existing sessions keep their original renderer and routes.

## Experience

Six authored scenes cover a basket-price puzzle, purchasing power, demand-pull inflation, cost-push inflation, inflation rates and consequences, and a transfer/map exercise. Each scene pairs an interactive visual with one answer prompt. Petros uses the existing character artwork and voice integration, with explicit text or voice selection and reduced-motion support.

Learners can request hints, examples, or a contextual answer from Petros; pause and resume; revisit unlocked scenes; and review their notebook. Moving on without a successful check explicitly records an unresolved idea. Independent answers, supported answers, and unresolved ideas remain distinct in the closing summary.

## Implementation

- `packages/schemas/src/petros-pilot.ts` defines public teaching scenes, validated actions, and persisted pilot state. Assessment rubrics remain on the API server.
- `petros-pilot.policy.ts` owns progression and evidence transitions. Choice questions use deterministic server checks; written explanations use the existing evaluation gateway with authored rubrics. Provider failures return a retryable error without inventing an assessment.
- The existing learning-session service and repository store pilot state in session context. Owner checks, expected versions, atomic compare-and-swap updates, and idempotency keys protect state mutations. Pilot lifecycle changes also use version checks.
- The frontend serializes autosaves and actions, preserves drafts through interruptions, and reuses request identities after uncertain responses. Saved state includes the current scene, unlocked scenes, controls, answers, feedback, support use, and delivery mode.
- No database migration or new image assets are required. This is an authored inflation pilot; arbitrary-document scene generation is outside its scope. Evidence belongs to the session and is not a claim of validated long-term mastery.

## Validation

The implementation was checked with 35 API tests (pilot policy/service and existing learning-loop service), 8 pilot component tests, 47 existing Petros component tests, and 4 app-shell tests. Coverage includes wrong-answer feedback, support classification, explicit skips, state injection rejection, ownership/version conflicts, gateway failure, lost-response retry, restored drafts, pause, interruptions, and closed notebooks.

API and student-portal TypeScript checks passed. Frontend lint passed; API lint reported only the existing seven Nest dependency-injection import warnings. Browser verification remains with the user; the full end-to-end browser pass was deliberately stopped at their request.

For local institutional-student testing, the student dev process can use `NEXT_PUBLIC_DEV_STUDENT_EMAIL=student.test@toch.edrion.local`. The normal independent-learner development identity does not have access to this institutional pilot. API evaluation and contextual questions require the existing configured AI gateway.
