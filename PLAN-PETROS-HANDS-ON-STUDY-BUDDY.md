# Petros: Hands-on Study Buddy Rebuild Plan

> Primary consumer: Claude. This is an implementation plan, not permission to skip discovery.
> Scope: the student portal companion, its student-facing AI contract, and its integration with the
> existing Petros teaching, learner-model, reflection, artifact, planning, and institutional systems.

## 0. First instruction to Claude: understand the existing Petros before editing

Do not begin by rewriting the prompt or redrawing the character. First trace the current system and
write a short implementation note showing how a student request moves through it.

Read these files in this order:

1. `apps/student-web/src/components/app-shell/app-shell.tsx`
2. `apps/student-web/src/components/petros/petros-context-assistant.tsx`
3. `apps/student-web/src/components/petros/petros-door-button.tsx`
4. `apps/student-web/src/components/petros/petros-repair-session.tsx`
5. Every `data-petros-target` call site under `apps/student-web/src`
6. `packages/schemas/src/petros-session-intent.ts`
7. `apps/api/src/modules/student/petros-session-intent/petros-session-intent.controller.ts`
8. `apps/api/src/modules/student/petros-session-intent/petros-session-intent.service.ts`
9. `apps/api/src/modules/student/petros-session-intent/petros-session-intent.repository.ts`
10. `apps/api/src/modules/student/petros-loop/petros-loop.service.ts`
11. `apps/api/src/modules/petros-learner-model/petros-learner-model.service.ts`
12. `apps/api/src/modules/student/petros-reflection/petros-reflection.service.ts`
13. `apps/api/src/modules/student/petros-artifacts/petros-artifacts.service.ts`
14. `packages/schemas/src/petros-ai-routing.ts`
15. `docs/petros-stage-prompts/08-stage-08-contextual-doors.md`
16. `docs/PETROS-QUALITY-HARNESS.md`

Before editing, verify and record this current flow:

```text
AppShell
  -> PetrosContextAssistant
  -> first DOM element matching [data-petros-target="primary"]
  -> POST /student/petros/assistant (one question, no thread)
  -> quickContext + assistantContext
  -> assistant.context.answer
  -> one plain-text answer
  -> optional explicit assistant_handoff intent
  -> existing adaptive Petros learning session
```

Also run the focused assistant/session tests and capture a baseline. If the code has moved, update
this plan's file list before implementing. Do not preserve a bad design merely because a test encodes
it; replace tests that assert the first-card-only or one-shot behavior.

## 1. Product outcome

Petros should feel like one continuous study companion travelling through the student portal. He
should know what the student is doing, remember the current conversation, understand the student's
authorized academic context, help choose a next step, and carry out safe study actions after clear
confirmation.

The target experience is not “ask X, receive Y.” A good Petros turn should usually do some combination
of the following:

- answer the immediate question;
- connect it to the exact item the student selected;
- explain why it matters to the student's current work;
- suggest one concrete next move;
- offer or perform a safe action with confirmation;
- continue naturally across page navigation;
- use the existing adaptive teaching engine when actual teaching is needed;
- retain only bounded, explainable memory the student can inspect or clear.

Relatability comes from continuity, timing, specificity, warmth, and occasional appropriate humour.
It must not come from forced slang, constant jokes, fake emotions, guilt, surveillance, or pretending
to be a human friend.

## 2. What is wrong today

### P0 — behavior and correctness failures

1. **Petros literally targets one element.**
   `petros-context-assistant.tsx` uses `document.querySelector`, so only the first matching node can be
   active. Many pages explicitly mark `index === 0` and describe it as “the first item.” This exactly
   explains the reported behavior.

2. **The visible companion and backend route model disagree.**
   Petros is mounted globally, but `safeReturnRoute` supports only a subset of student routes. Fees,
   Requests, Report cards, Profile, Settings, Transport, Hostel, Classes, and other routes collapse to
   `/home`, despite the UI claiming Petros knows the current screen.

3. **The assistant is one-shot, not conversational.**
   The request has no thread or message ID. “Ask a follow-up” sends another isolated question. The
   previous student message, Petros answer, accepted/declined suggestion, and topic are not supplied.
   Closing the panel clears the answer.

4. **The assistant cannot do useful work.**
   Its response contract contains only `answer` and an optional teaching-session offer. It cannot
   navigate, build a plan, schedule study time, resume a session, open a review, collect materials, or
   propose any other bounded action.

5. **Independent learners see a control the API rejects.**
   `AppShell` mounts the companion for all student kinds, while the student Petros intent controller
   calls `requireInstitutional` for every assistant request.

6. **Authorization and surface visibility are not part of context assembly.**
   `assistantContext` queries broad student records directly. Context must be filtered by the same
   permissions and surface flags as the portal before anything reaches a model. Ownership filtering
   alone is not enough when a module is disabled or a record is not meant to be exposed on that surface.

### P1 — experience and architecture failures

7. **Session routing is a keyword/word-count heuristic.**
   `requiresSession` treats long questions and a few verbs as “deep.” It can offer a teaching session
   for a non-teaching question and miss short but genuinely complex requests.

8. **The prompt defines safety but barely defines a companion.**
   There is no stable voice charter, humour policy, relationship continuity, acknowledgement style,
   frustration handling, or rule for balancing answer/action/question.

9. **Mature Petros capabilities are stranded behind separate screens.**
   The adaptive loop, learner model, reflection recommendations, artifacts, review queue, input modes,
   teach-back, and institutional policy exist, but the ambient companion cannot discover or orchestrate
   most of them.

10. **There is no proactive companion loop.**
    Petros reacts only after a click and a typed message. He does not provide a deterministic daily
    briefing, notice an active session, offer a relevant review, or help turn deadlines into a plan.

11. **The response is unstructured.**
    Plain text cannot render source chips, selectable focus, action previews, suggested replies,
    navigation, plan steps, or confirmations safely.

12. **Preferences are fragmented.**
    Backend student preferences already contain language, hint generosity, celebration style, and
    expert mode. The student-web preference provider stores only appearance/quick-nav fields in local
    storage. Petros does not receive a coherent student-controlled companion preference set.

13. **The assistant is slow by design and has weak retry semantics.**
    It waits for one complete JSON answer, disables gateway caching, and does not persist the turn.
    Retrying can repeat AI work, while the student sees only a spinner.

14. **Quality tests evaluate teaching mechanics, not companionship.**
    The current harness covers PLAN/RENDER/OBSERVE well, but not multi-turn coherence, helpful
    initiative, humour appropriateness, action correctness, route grounding, or memory boundaries.

15. **The character is visually static.**
    There is one pointing image and one dominant “look at this” behavior. This reinforces the feeling
    that Petros is a pointer attached to a card rather than an active companion. Visual variants are a
    polish phase, not the first fix.

### P2 — implementation debt to resolve during the rebuild

- Home priority cards do not carry stable Petros source IDs, so a handoff can degrade to a route.
- Generic page fallbacks claim to use visible context even when the backend has no entity context.
- Demo mode ignores selected-card semantics and contains keyword-specific fixture behavior.
- The assistant payload sends broad context on every turn instead of a bounded route/task projection.
- Quick answers have little outcome telemetry; offered sessions are measured more than helpful answers.
- The global modal does not preserve an active thread while the student navigates.
- Suggested questions are the same three generic strings on nearly every screen.
- The companion is hidden on the Petros session route rather than sharing a deliberate session-aware
  presence model.

## 3. Target architecture

Build four cooperating layers. Do not put all responsibilities into one React component or one prompt.

### Layer A — persistent companion shell

Create a `PetrosCompanionProvider` mounted once in `AppShell`. It owns:

- open/minimized state;
- active thread ID;
- recent messages;
- current page context and selected focus;
- pending action/confirmation;
- active Petros session/review state;
- route transition continuity;
- accessible keyboard and screen-reader behavior.

Desktop should use a non-blocking side panel; mobile should use a bottom sheet. The compact character
can remain, but it must not jump to an arbitrary card. The student should be able to keep the panel open
while navigating.

### Layer B — structured page-context registry

Replace DOM scraping and `data-petros-*` strings with a typed React context API. Pages register:

```ts
type PetrosPageContext = {
  route: string;
  surface: string;
  title: string;
  summary?: string;
  candidates: Array<{
    ref: string;
    entityType: string;
    entityId?: string;
    title: string;
    summary: string;
    href?: string;
    sourceVersion?: string;
    availableActions: string[];
  }>;
  selectedRef?: string;
};
```

Pages should register all relevant candidates. Focus changes only when the student explicitly selects
an item, opens a detail, invokes “Ask Petros about this,” or when a deterministic priority adapter
identifies one urgent item and explains why. Array order must never be the selection algorithm.

Client-supplied context is only a navigation hint. The API must resolve authoritative data by entity
type/ID and current principal before model use.

### Layer C — student companion service

Add a dedicated student companion module rather than continuing to grow
`PetrosSessionIntentService.assistant`. It should contain:

- `PetrosCompanionController`
- `PetrosCompanionService`
- `PetrosCompanionRepository`
- `PetrosStudentContextService`
- `PetrosStudentActionRegistry`
- `PetrosCompanionPrompt`
- context adapters per supported surface
- action handlers with permission checks and confirmation policy

The existing session-intent service remains the verified door/handoff layer. The companion calls it
when a teaching action is accepted; it should not duplicate session creation logic.

### Layer D — existing adaptive learning systems

Reuse, do not fork:

- Petros session intent resolution and freshness checks;
- Petros adaptive loop;
- learner model and evidence;
- reflection recommendations and knowledge map;
- artifact library and spaced review;
- teach-back and input modes;
- institutional policies and disclosure;
- AI gateway, routing, cost, validation, audit, and quality infrastructure.

The rebuild is primarily an orchestration and continuity layer over these systems.

## 4. New contracts and persistence

### 4.1 Threads and messages

Add student-owned, tenant-safe persistence. Do not reuse institution-staff Petros conversations without
first generalizing their ownership model and RLS safely.

Recommended tables:

- `petros_student_threads`: owner, title, active topic/focus, compact summary, summary watermark,
  status, last activity, version, retention timestamps.
- `petros_student_messages`: thread, role, typed blocks, route/surface, focus reference, status,
  idempotency key, prompt/schema versions, timestamps.
- `petros_student_action_proposals`: thread/message, action key, validated arguments, preview,
  status, expiry, confirmation/execution timestamps, result reference, idempotency key.
- `petros_student_companion_preferences`: preferred name, response length, energy/tone, humour level,
  proactive check-ins, language/mixed-language choice, quiet mode, version.
- `petros_student_memory_facts` only if explicit durable facts are required. Each fact must have a
  bounded type, source, student-visible wording, confidence, expiry, and delete control.

Requirements:

- institutional student rows are scoped by institution + student;
- independent-user support is either implemented end to end or the companion is honestly gated off;
- force RLS and add cross-tenant tests;
- raw chain-of-thought is never stored;
- rejected action proposals never mutate product state;
- message/action idempotency is enforced in storage;
- retention/export/delete behavior is documented and tested.

### 4.2 Turn contract

Replace the current one-question schema with a versioned contract similar to:

```ts
type PetrosCompanionTurnInput = {
  threadId: string;
  message: string;
  route: string;
  surface: string;
  focusRef?: string;
  visibleCandidateRefs: string[];
  idempotencyKey: string;
};

type PetrosCompanionBlock =
  | { type: 'text'; text: string }
  | { type: 'source'; label: string; href?: string; sourceRef: string }
  | { type: 'suggested_replies'; replies: Array<{ id: string; label: string; payload: string }> }
  | { type: 'navigation'; label: string; href: string }
  | { type: 'action_proposal'; proposalId: string; actionKey: string; title: string; preview: string[]; confirmationRequired: boolean }
  | { type: 'session_offer'; intentPreviewRef: string; title: string; minutes: number }
  | { type: 'plan_preview'; title: string; steps: Array<{ label: string; when?: string; sourceRef?: string }> }
  | { type: 'status'; label: string; tone: 'neutral' | 'positive' | 'warning' };
```

The backend, not the model, owns IDs, URLs, permissions, confirmation requirements, and executable
arguments. The model may select from registered action keys and propose bounded inputs. The service
must validate and resolve them before returning a proposal.

### 4.3 Memory boundaries

Keep three kinds of context separate:

1. **Thread memory:** recent turns plus compact summary, used for conversational continuity.
2. **Learning evidence:** existing learner model, used for teaching decisions and clearly labelled
   uncertainty; never converted into personality labels.
3. **Student-controlled companion preferences:** explicit choices such as concise/deep, calm/energetic,
   humour off/light, preferred language, and proactive check-ins.

Do not infer or store mental-health diagnoses, personality types, “learning styles,” friendships,
private-life facts, or sensitive memories merely because they appeared in chat. Provide “What Petros
remembers” and “Forget this” controls before enabling durable memory.

## 5. Hands-on action registry

Implement safe actions incrementally. Every action definition must declare required permissions,
supported owner kinds, confirmation policy, idempotency strategy, audit event, and student-facing
preview.

### First release actions

- `navigate.open`: open an existing safe student route or entity detail.
- `session.preview_and_start`: call the existing Petros intent resolver, show the existing verified
  preview, then start only after acceptance.
- `session.resume`: reopen the student's own active/paused Petros session.
- `planner.create`: propose one or more study blocks using the existing student planner service;
  confirm before creation.
- `planner.update`: move or rename the student's own planner item; confirm material changes.
- `review.open_due`: open an existing due artifact review.
- `reflection.open_recommendation`: open an existing evidence-linked recommendation.
- `artifact.open`: navigate to the student's own Petros artifact.
- `teach_back.start`: start the existing teach-back flow with explicit topic/source selection.

### Later actions, after the first release is stable

- create a multi-day exam revision plan from published syllabus, deadlines, available time, and
  learner evidence;
- turn an accepted plan into planner items in one confirmed batch;
- select materials for a session from authorized sources;
- generate an editable recap/flashcard proposal through the existing artifact flow;
- set a bounded study reminder using the existing notification/quiet-hours policy.

### Never automate through the companion

- submit assignments or homework;
- answer or finish an examination;
- make a payment or confirm a financial transaction;
- change marks, attendance, teacher feedback, institution records, or permissions;
- contact a teacher/guardian or share session content without a separate explicit, previewed consent
  flow and the existing institutional policy checks.

## 6. Companion behavior and voice

Create a versioned student companion charter. It should enforce these behaviors:

- lead with the useful answer or next step;
- use the student's name sparingly, not every message;
- refer to exact authorized facts with dates/status/source labels;
- acknowledge frustration without diagnosing it;
- use one question only when the answer materially changes the plan;
- prefer doing a small useful thing over listing many possibilities;
- never repeat the same greeting inside an active thread;
- remember accepted/declined suggestions inside the thread;
- never claim to see a screen or record that context resolution did not provide;
- never say an action happened until the action handler confirms it;
- never expose provider/model/routing details;
- keep jokes short, optional, and secondary to the help.

Humour policy:

- default to `light`, with `off` and `playful` student settings;
- allow gentle subject-related humour during ordinary study and recovery after effort;
- suppress humour for bad results, attendance risk, overdue fees, safeguarding, teacher escalation,
  account/security issues, or when the student's message is distressed;
- do not tease the student, their marks, their speed, their language, or their mistakes;
- do not produce canned jokes every turn;
- fall back to warm directness whenever appropriateness is uncertain.

Use the registered `engagement.motivate` capability only for a bounded intervention when the session
state justifies it. Do not call a separate model merely to decorate every response.

## 7. Proactive, not intrusive

Add a deterministic companion briefing endpoint. It should assemble current facts without an LLM:

- active/paused Petros session;
- nearest unfinished deadline;
- next exam and published coverage;
- today's timetable and available gaps;
- due artifact reviews;
- one active reflection recommendation;
- planner commitments;
- relevant teacher feedback;
- attendance warning only when the student is allowed to see it.

Use clear priority rules, not model vibes. The model may phrase an already selected briefing, but
priority selection and source links must be deterministic and inspectable.

Constraints:

- no AI request on every route change;
- no more than one unsolicited companion nudge per meaningful session/day according to preference;
- never interrupt an exam attempt, payment flow, submission confirmation, or sensitive form;
- every nudge is dismissible and dismissal is remembered;
- “nothing urgent” should produce calm availability, not invented work;
- no streak pressure, guilt, fake urgency, or “Petros misses you” language.

## 8. Implementation phases

### Phase 0 — discovery and baseline (mandatory first step)

Deliverables:

- current-flow note with exact files/endpoints/tables;
- supported-route versus mounted-route matrix;
- institutional versus independent behavior matrix;
- list of all current Petros capabilities and whether the ambient assistant can invoke them;
- focused test/typecheck baseline;
- screenshots or recordings of Home, Assignments, Results, an unsupported route, and accepted handoff.

Gate: no production code changes until the matrices explain the first-card bug, one-shot follow-ups,
route fallback, and owner-kind mismatch.

### Phase 1 — fix grounding and visibility before adding personality

Files likely touched:

- `apps/student-web/src/components/app-shell/app-shell.tsx`
- `apps/student-web/src/components/petros/petros-context-assistant.tsx`
- new student-web Petros context/provider files
- all current `data-petros-target` pages/components
- `packages/schemas/src/petros-session-intent.ts` or new companion schema files
- new backend context adapters

Tasks:

1. Introduce the typed page-context registry.
2. Remove `document.querySelector` and first-index targeting.
3. Add explicit “Ask Petros about this” affordances or selection callbacks on entity cards.
4. Build a route coverage registry with one of: supported, intentionally unavailable, or hidden.
5. Resolve every candidate server-side and enforce permissions/surface flags.
6. Gate independent accounts honestly until their context repositories are implemented.
7. Preserve the existing verified session doors.

Acceptance:

- selecting the third assignment makes it the focus;
- filtering/reordering a list never silently changes focus to item zero;
- Petros does not claim to know unsupported screens;
- hidden/disabled modules cannot be queried through Petros;
- independent users never hit an institutional-only error from a visible Petros control.

### Phase 2 — persistent multi-turn companion

Tasks:

1. Add thread/message persistence and migrations with forced RLS.
2. Add create/read/archive thread APIs and an idempotent turn API.
3. Stream text/status blocks over fetch-based SSE or another existing compatible stream transport.
4. Compact old turns into a bounded summary; retain recent turns verbatim within a strict budget.
5. Make the shell survive route navigation and reload.
6. Replace the plain answer schema with typed blocks.
7. Add dynamic suggested replies based on resolved context, not three global strings.

Acceptance:

- a pronoun/follow-up refers to the previous turn correctly;
- navigate from Results to Calendar with the panel open and continue the same thread;
- refresh restores the thread without duplicating the last turn;
- retrying the same idempotency key does not make a second AI call/message;
- archived/cleared threads disappear according to policy.

### Phase 3 — hands-on actions

Tasks:

1. Implement the action registry and proposal validator.
2. Start with navigation, session preview/start/resume, planner create/update, due review, reflection,
   artifact, and teach-back actions.
3. Reuse existing services internally; do not call student HTTP endpoints from backend services.
4. Render a preview card showing exactly what will happen.
5. Require explicit confirmation for every state-changing action.
6. Re-check permissions, ownership, current version, and freshness at confirmation time.
7. Return structured action results to the same thread.

Acceptance journeys:

- “Plan 30 minutes for biology tomorrow” -> preview -> confirm -> planner item appears once.
- “Help me fix this result” -> verified result intent preview -> confirm -> existing adaptive session.
- “Continue where we stopped” -> exact owned session resumes.
- “What should I review?” -> due artifact source -> review opens.
- stale, unauthorized, duplicate, and cross-tenant proposals fail without leaking existence.

### Phase 4 — companion voice and student controls

Tasks:

1. Add the versioned companion charter and response-style validator.
2. Add Petros settings: response depth, tone/energy, humour, proactive check-ins, language, memory.
3. Reconcile backend preferences with the current local-only frontend preference provider.
4. Add distress/setback and sensitive-domain tone suppression.
5. Add a small set of character states driven by UI state: available, listening, thinking, planning,
   celebrating, calm/supportive. Start with CSS treatment; add image variants only after behavior works.
6. Make reduced motion and screen-reader status first-class.

Acceptance:

- humour off produces no jokes;
- light humour appears occasionally in safe study contexts, never on sensitive surfaces;
- a low result starts flat and practical;
- Petros does not greet the student repeatedly in one thread;
- preferences sync across devices where the account model supports it.

### Phase 5 — proactive daily planning

Tasks:

1. Build the deterministic briefing/priority service.
2. Expose one “Plan my day” and one contextual next-action entry.
3. Produce an editable plan preview with source references and time estimates.
4. Batch-create planner items only after one explicit confirmation.
5. Respect quiet hours, nudge cadence, dismissals, and institution policy.

Acceptance:

- the same facts produce the same priority ordering;
- plans do not overlap known timetable/exam events without warning;
- no-deadline fixtures do not invent urgency;
- dismissing a nudge prevents it from reappearing immediately;
- no model call occurs just because the student changes pages.

### Phase 6 — connect the full Petros ecosystem

Tasks:

1. Surface active sessions, due reviews, reflection recommendations, learner-model uncertainty, input
   modes, teach-back, and artifacts through registered read/action adapters.
2. Let a conversation hand off to an adaptive session without repeating the question.
3. Return from the session to the same thread with a concise session result and new artifacts.
4. Keep learner evidence separate from conversational memory.
5. Show “why this?” for recommendations using existing evidence links and limitations.

Acceptance:

- one coherent journey can go from dashboard question -> plan -> teaching session -> artifact review;
- every transition retains source/return context;
- session completion updates existing evidence/artifact systems, not duplicate tables;
- Petros distinguishes known fact, tentative learner-model inference, and student-stated preference.

### Phase 7 — evaluation, safety, performance, and release

Add a companion evaluation suite alongside, not inside, the teaching-only harness.

Required dimensions:

- exact entity and route grounding;
- multi-turn reference resolution;
- action selection and argument correctness;
- confirmation before mutation;
- permission/surface/tenant isolation;
- next-step usefulness;
- non-repetition;
- tone after setback;
- humour appropriateness and preference compliance;
- no fake memory or invented facts;
- handoff continuity;
- latency, tokens, cost, retries, fallback, and idempotency.

Required adversarial cases:

- prompt injection inside assignment/document/announcement text;
- “submit this for me,” “take my exam,” or “pay this fee”;
- cross-student and cross-institution entity IDs;
- hidden module data;
- stale planner/session/result versions;
- ambiguous “this/that/it” with no selected focus;
- rapid route changes and double sends;
- joking requests after a bad result or distress language;
- requests to remember sensitive personal facts;
- model output containing an unregistered action or forged URL.

Release gates:

- focused unit/integration tests pass;
- schemas, database, API, and student-web typechecks pass;
- student-web and API builds pass;
- RLS and cross-tenant proofs pass;
- action idempotency and confirmation tests pass;
- mobile/desktop, keyboard, screen reader, zoom, reduced motion, slow network, offline/reconnect, and
  route-navigation manual checks pass;
- live AI routing/cost/fallback is reconciled for companion turns separately from teaching sessions;
- student reviewers judge Petros useful, specific, natural, and non-annoying.

## 9. File-level implementation map

### Replace or substantially refactor

- `apps/student-web/src/components/petros/petros-context-assistant.tsx`
- `apps/student-web/src/components/petros/petros-context-assistant.module.css`
- `apps/student-web/src/components/petros/petros-context-entry.spec.tsx`
- the assistant method inside
  `apps/api/src/modules/student/petros-session-intent/petros-session-intent.service.ts`
- the assistant request/answer definitions in
  `packages/schemas/src/petros-session-intent.ts`

### Add

- student-web companion provider, panel, composer, message block, action card, focus picker, and
  page-context registry components;
- shared companion thread/message/action/preference schemas;
- database migration and schema for student companion persistence;
- API companion module, context adapters, action registry, prompt, validator, and tests;
- context adapters for Home, Assignments/Homework, Calendar/Timetable, Exams, Results, Materials,
  Learning Path, Progress/Reflection, and Artifacts first;
- companion quality fixtures/evaluator/reporting;
- a route-support matrix test so new pages cannot silently fall back to Home.

### Reuse without duplicating

- `PetrosSessionIntentService.resolve/start`
- `PetrosLoopService`
- `PetrosLearnerModelService`
- `PetrosReflectionService`
- `PetrosArtifactsService`
- student planner service
- Petros AI gateway/routing/validator/cost telemetry
- institutional policy and disclosure services

## 10. Test plan by layer

### Frontend

- context registration/unregistration across route transitions;
- explicit focus on non-first items;
- persistent thread and focus state;
- typed block rendering;
- action preview/confirm/reject states;
- duplicate-send prevention;
- keyboard focus trap/return, escape behavior, live regions, reduced motion;
- mobile sheet and desktop panel;
- unsupported/sensitive route suppression.

### Schemas and database

- strict unions and version compatibility;
- invalid/forged action keys rejected;
- thread/message/action idempotency constraints;
- owner XOR/tenant checks and forced RLS;
- retention/export/delete;
- concurrent confirmation executes once.

### API

- every context adapter enforces owner, permission, surface, publication, and freshness;
- broad context cannot leak a disabled module;
- thread history is bounded and ordered;
- prompt injection in source text stays data, never instructions;
- action confirmation revalidates state;
- teaching handoff uses the existing intent resolver;
- fallback remains helpful without pretending an action succeeded;
- independent-owner matrix is explicit.

### End-to-end

1. Select the third assignment, ask two follow-ups, schedule help, then open it.
2. Ask about a low result, receive practical help, accept a repair session, return to the thread.
3. Ask for an exam plan, edit the proposed times, confirm once, verify planner rows.
4. Resume a paused session from Home.
5. Open a due artifact review and complete it.
6. Try a hidden module/cross-tenant ID and verify a non-revealing denial.
7. Navigate across five pages with the companion open and preserve continuity.
8. Toggle humour/memory/proactive settings and verify behavior immediately.

## 11. Definition of done

Petros is not complete because he has friendlier copy or more character images. This rebuild is done
only when a student can:

- select any relevant item, not just the first card;
- carry one coherent conversation across the portal;
- receive answers grounded in authorized current records;
- get a useful next step rather than a generic reply;
- preview and confirm safe study actions;
- move naturally into and back out of the existing adaptive teaching engine;
- understand what Petros knows, why he suggested something, and what he remembers;
- control tone, humour, memory, and proactive help;
- trust that sensitive, financial, assessment, and institutional boundaries remain intact.

Do not mark the work complete with prompt-only changes, a redesigned modal, or additional canned
suggestions. The first-card selector, one-shot API, missing action registry, route mismatch, owner-kind
mismatch, and missing companion evaluation must all be resolved.
