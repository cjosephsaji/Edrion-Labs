# Execution prompt 08 of 13 — Stage 8: contextual doors into Petros

Use this prompt after Stage 7 artifacts and review persistence pass acceptance. Complete the
contextual entry points and handoff contract. Do not build photo/voice input modes from Stage 9.

## Mission

Embed Petros where students already need help. Implement five reliable doors into the same teaching
engine: bad marks, upcoming exams, uploaded documents, learning paths, and the embedded assistant
handoff. Every door must pass a typed goal, scope, time/session context, source references, and
appropriate emotional register. The resulting session must arrive correctly pre-scoped and toned.

Do not create a generic Petros destination that students must remember to visit. The assistant is a
quick contextual layer on existing screens; it may explicitly offer a session, but must never
silently turn into one.

## Required reading and entry gate

1. Read `/Users/macbook/Downloads/PETROS-BUILD-SPEC.md` completely, especially Parts 1, 5, 7, 8,
   10, and Stage 8.
2. Read `docs/PETROS-AI-ROUTING.md`; inspect the session-create contract, learner model, artifacts,
   results, exams, documents, learning paths, and current contextual result link.
3. Manually verify Stage 7 propose/edit/save and spaced review before adding traffic sources.
4. Reuse existing portal entities and permissions. Do not duplicate results/exams/documents/path data.
5. Preserve worktree changes and student privacy. Never pass source data the student cannot access.

## Unified door/handoff contract

Define a versioned, validated `PetrosSessionIntent` or equivalent containing:

- door type and source entity IDs;
- student/institution/campus and permission context;
- session type: Learn, Revise, Repair, or Doubt as currently supported;
- goal and target concepts/topics;
- scope boundaries and curriculum/source grounding;
- time budget/deadline/exam date;
- emotional/contextual register as a bounded enum/factors, not a mental-health diagnosis;
- known failure/mark-loss details or learning-path position;
- source citations the session may use;
- requested language/accessibility preferences;
- return destination and safe resume semantics;
- policy/institution disclosures;
- schema/version and idempotency key.

Resolve and validate intent on the backend. Never trust client-supplied student IDs, marks, deadlines,
permissions, or source content. Log the resolved intent and which factors influenced initial PLAN.

## Door 1: bad mark

- Keep “See what to fix” on an eligible published result/assessment row and relevant detail views.
- Pre-scope to lost concepts/questions/mark patterns actually available from the result.
- Use flat, specific, practical tone: no cheerful hook after failure, no shame, no ability labels.
- State what went wrong, estimated repair time, and first step.
- Never change marks or overwrite teacher feedback.
- Handle missing question-level evidence honestly rather than inventing a diagnosis.

## Door 2: upcoming exam

- Add contextual revision entry from exam/calendar/today surfaces.
- Resolve syllabus coverage, exam date, time available, and known mastery.
- Weight toward recall, contrast cases, synthesis, exam-shaped answers, and spaced-review artifacts.
- Avoid fake urgency and notification pressure. Explain why mixing topics may feel harder.
- Handle schedule changes/cancelled exams and prevent stale session intent.

## Door 3: uploaded document

- Add “Teach me this” to authorized student documents/materials.
- Pass document/version/page or selection scope and permitted citations.
- Ground teaching in the student’s pages and cite exact page numbers/sections.
- Respect file access, malware/scanning state, extraction status, retention, and copyright limits.
- If extraction is incomplete, show an honest wait/retry state; do not hallucinate document content.

## Door 4: learning path

- Starting the next topic must create an adaptive Petros session rather than a rigid fixed lesson.
- Pass path, current node, prerequisites, completion evidence, and forward link.
- Do not mark the path node complete merely because a session opened; use demonstrated completion.
- Return to the path with updated status and next useful action after session close.

## Door 5: embedded assistant handoff

- Provide a summonable contextual assistant affordance on appropriate portal screens without a
  standalone chat page.
- The assistant knows the current route and explicitly permitted visible entity context.
- It handles small contextual questions quickly and offers a clearly described session when depth is
  warranted.
- The student must explicitly accept the handoff; never silently become a long session.
- Handoff transfers the question, resolved screen context, goal, time, and tone without forcing the
  student to repeat themselves.
- Provider/model details remain invisible. Questions become structured context, not a generic chat
  history stored as learner memory.

## Backend/API requirements

- Central intent resolver with per-door adapters, authorization, source freshness checks, and policy
  disclosures.
- Idempotent session creation so repeat taps cannot create duplicates.
- Safe return/resume links and expired/deleted-source handling.
- Metrics for impression, start, accepted handoff, completed session, artifact save, return, and
  failure—without dark-pattern engagement optimization.
- Audits/correlation IDs connecting source entity, intent, session, first PLAN decision, and usage.
- Strict tenant and access checks on source documents, results, exam coverage, and paths.
- No provider-specific logic in door code; all AI work uses registered functions/gateway.

## Frontend requirements

- Entry affordances feel native to Results, Exams/Calendar, Documents/Materials, Learning Paths, and
  the current portal screen—not advertisements.
- Preview what Petros will do, approximate time, source/scope, and applicable institution rule before
  start.
- Correct tone/copy for each door; the bad-mark door must be visibly different from curiosity-led Learn.
- Preserve back/return path and resume state.
- Show source citations and path/exam context in the session header without clutter.
- Provide honest empty/stale/deleted/unauthorized/extraction-pending states.
- Work on mobile/desktop, keyboard/screen reader, zoom, reduced motion, and slow/offline transitions.

## Dashboard/observability requirements

Add an authorized Doors/Session Origins view showing privacy-safe aggregates:

- impressions, starts, completion, abandon/pause, artifact commits, and returns by door;
- intent-resolution failures and stale/missing-source counts;
- first-content latency and session cost by door/session type;
- tone/goal/scope selection and initial-move distribution;
- assistant offered vs accepted handoffs;
- document grounding/citation failures;
- no conversion-pressure rankings or manipulative re-engagement metrics.

Super Admin Petros AI Routing must permit filtering usage by door/session type and tracing a session’s
registered function calls without revealing provider details to students.

## Automated verification required

Test at least:

- intent schema and server-side resolution for all five doors;
- result context uses only published/authorized evidence and practical Repair tone;
- exam context updates on schedule changes and uses Revise weighting;
- document access, extraction status, exact citations, deleted/restricted source fallback;
- path node is not completed on open and updates only from demonstrated evidence;
- assistant quick-answer vs explicit session-offer boundary and accepted handoff context;
- idempotent repeated taps and resume/return links;
- stale/unauthorized/missing source behavior;
- cross-tenant isolation and permission checks;
- initial PLAN logs cite the resolved door factors;
- analytics source dimensions and no double counting;
- responsive/accessibility semantics;
- Stage 5 quality cases for each door do not regress correctness, tone, or stuck recovery.

Run focused/integration/E2E tests, package typechecks, lint, builds, and quality comparisons. Report
exact commands/results.

## Mandatory manual QA and dashboard acceptance

Use documented fixtures and perform/provide these checks:

1. **Bad result:** Open a low published result, tap “See what to fix,” and verify exact scope, flat
   practical tone, no hook/shame, correct mark context, and no mark mutation.
2. **Upcoming exam:** Start from exam/calendar. Verify date, syllabus scope, Revise weighting,
   exam-shaped checks, and return to the exam surface.
3. **Uploaded document:** Select “Teach me this,” choose a page/section, and verify exact citations.
   Test extraction pending, deleted file, and a page the student cannot access.
4. **Learning path:** Start next topic, complete/abandon different fixtures, and verify path status is
   evidence-based and return navigation is correct.
5. **Assistant handoff:** Ask a small contextual question and confirm a quick inline response. Ask a
   deeper question, verify an explicit session offer, decline once, accept once, and confirm context
   transfers without repetition or silent conversion.
6. **Tone comparison:** Capture first three blocks from all five doors for the same broad subject and
   have a human verify they are appropriately scoped/toned rather than templated.
7. **Refresh/double tap:** Repeat taps, refresh during intent creation, and resume. Confirm one session,
   stable source context, and safe return.
8. **Doors dashboard:** Reconcile impression/start/complete/artifact/return events and failures for the
   five manual runs, including correlation IDs.
9. **AI Routing dashboard:** Filter by door/session type and reconcile functions, costs, latency,
   cache, validation, retry, and fallback.
10. **Privacy:** Cross-student/institution attempts must fail without revealing result/document/path
    existence. Inspect the audit record.
11. **Responsive/accessibility:** Test each door and handoff on mobile/desktop, keyboard, screen
    reader, zoom, reduced motion, slow network, offline, and stale-page resume.

For each, list navigation, fixture IDs/setup, actions, expected frontend, expected API/database and
dashboard records, failure criteria, and screenshots/IDs to retain.

## Definition of done

Stage 8 is complete only when all five doors create one shared-engine session with correct verified
scope, tone, source grounding, goal and return path; assistant handoff is explicit; tenant/privacy
rules hold; and human/dashboard evidence confirms each journey.

## Final response contract

Return scope, intent architecture, migrations/APIs, clickable files, test/quality results, browser
checks performed, detailed five-door manual/dashboard runbook, evidence, limitations, Stage 9
prerequisites, and `Stage 8 complete` or `Stage 8 not complete`.

