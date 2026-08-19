# Petros companion — Phase 0 discovery baseline

Recorded before any production code change, as required by
`PLAN-PETROS-HANDS-ON-STUDY-BUDDY.md` §8 Phase 0.

## 1. Current flow (verified against source)

```text
AppShell  apps/student-web/src/components/app-shell/app-shell.tsx:281
  -> <PetrosContextAssistant route={pathname} studentName={me.fullName} />   (no owner-kind gate)
  -> petros-context-assistant.tsx:61  document.querySelector('[data-petros-target="primary"]')
       reads data-petros-{title,message,sourceId,href} off that ONE node
  -> POST /v1/student/petros/assistant   { question, route, sourceId?, selectedCard?, idempotencyKey }
       controller  petros-session-intent.controller.ts:84  @Post('assistant')
       guard chain  StudentAuthGuard > StudentPermissionsGuard > StudentPortalGuard > StudentRateLimitGuard
       permission   student.learn.use     rate limit 40/60s
       principal()  -> requireInstitutional(raw)   (404 for independent)
  -> PetrosSessionIntentService.assistant()  :322
       quickContext(scope, route, sourceId)          -> { label, topic, quickAnswer }
       requiresSession(question)                     -> word-count / verb regex heuristic  :1320
       repo.assistantContext(scope)                  -> broad student snapshot  repository.ts:343
       gateway.execute({ functionKey: 'assistant.context.answer', disableCache: true })
  -> petrosAssistantAnswerSchema.parse -> { mode, answer, contextLabel, offer? }
  -> one plain-text answer, no persistence, no thread
  -> optional accept() -> POST /intents/resolve (door 'assistant_handoff') -> /intents/:id/start
  -> router.push('/petros/session?session=…')
```

Nothing about the turn is stored. `close()` sets `answer` to `null`; the thread does not exist.

## 2. Supported-route vs mounted-route matrix

`safeReturnRoute()` (service.ts:1276) allows 15 prefixes. `PetrosContextAssistant` is mounted for
every `(app)` route except `/petros/session` and `*/attempt` (assistant.tsx:32).

| Route | Mounted | Backend supported | Result today |
|---|---|---|---|
| `/home` | yes | yes | correct |
| `/timetable` | yes | yes | correct |
| `/attendance` | yes | yes | correct |
| `/courses`, `/courses/[id]` | yes | yes | correct |
| `/calendar` | yes | yes | correct |
| `/assignments`, `/assignments/[id]` | yes | yes | correct |
| `/homework`, `/homework/[id]` | yes | yes | correct |
| `/materials` | yes | yes | correct |
| `/learning-path` | yes | yes | correct |
| `/progress` | yes | yes | correct |
| `/exams` | yes | yes | correct |
| `/results` | yes | yes | correct |
| `/announcements` | yes | yes | correct |
| `/notifications` | yes | yes | correct |
| `/documents` | yes | yes | correct |
| `/classes`, `/classes/[id]` | yes | **no** | silently reported as `/home` |
| `/report-cards`, `/report-cards/[id]` | yes | **no** | silently reported as `/home` |
| `/fees` | yes | **no** | silently reported as `/home` |
| `/fees/pay` | yes | **no** | payment flow, must be suppressed outright |
| `/requests`, `/requests/new`, `/requests/[id]` | yes | **no** | silently reported as `/home` |
| `/transport` | yes | **no** | silently reported as `/home` |
| `/hostel` | yes | **no** | silently reported as `/home` |
| `/profile` | yes | **no** | silently reported as `/home` |
| `/settings` | yes | **no** | silently reported as `/home` |
| `/petros`, `/petros/artifacts` | yes | **no** | silently reported as `/home` |
| `/design-system` | yes | **no** | dev-only surface, should be hidden |
| `/petros/session` | no | n/a | deliberately hidden |
| `/exams/[id]/attempt` | no | n/a | deliberately hidden |

15 supported, 16 mounted-but-unsupported. On every unsupported route Petros claims
"I know this screen and the academic records connected to you" while the backend has silently
substituted `/home`.

## 3. Institutional vs independent matrix

| Concern | Institutional | Independent |
|---|---|---|
| `AppShell` mounts companion | yes | **yes** |
| `StudentPetrosSessionIntentController.principal()` | passes | `requireInstitutional` -> 404 NOT_FOUND |
| `repo.assistantContext` | institution-scoped queries | no implementation |
| Net effect | works | visible control that always fails |

## 4. Petros capability inventory vs ambient reach

| Capability | Module | Reachable from ambient assistant |
|---|---|---|
| Session intent resolve/start | `student/petros-session-intent` | only via `assistant_handoff` |
| Adaptive teaching loop | `student/petros-loop` | no |
| Learner model + evidence | `petros-learner-model` | no |
| Reflection recommendations | `student/petros-reflection` | no |
| Artifacts + spaced review | `student/petros-artifacts` | no |
| Teach-back | `student/petros-teach-back` | no |
| Input modes | `student/petros-input-modes` | no |
| Topic profiles | `petros-topic-profiles` | no |
| Institutional policy/disclosure | `petros-institutional` | indirect only |
| AI routing/cost/quality | `petros-ai-routing`, `petros-quality` | yes (gateway) |
| Planner / study blocks | student planner | no |

One of eleven is reachable, and only as a one-way handoff.

## 5. First-card targeting call sites

14 files carry `data-petros-target`. Confirmed index-0 or single-node targeting:

- `home/page.tsx:43` `index === 0`
- `materials/page.tsx:105` `index === 0`
- `documents/page.tsx:88` `index === 0`
- `exams/page.tsx:160` `!featured && index === 0`
- `module-page.tsx:122` `index === 0`
- `courses/[id]/page.tsx:105`, `calendar/page.tsx:137`, `announcements/page.tsx:66`,
  `exams/page.tsx:125` — hardcoded single node
- `results/page.tsx:90`, `learning-path/page.tsx:65`, `assignment-list-screen.tsx:100` — derived
  focus, closest to correct, still not student-selectable

`document.querySelector` returns the first match in document order, so array order is the selection
algorithm. This is the reported bug exactly.

## 6. Baseline

- `pnpm --filter @edrion/student-web test` -> **10 files, 35 tests, all passing**, 8.77s.
- Next free migration number: **0201** (`packages/database/migrations/0200_petros_failure_fixes.sql`
  is current head).

## 7. Gate check

The four required explanations are recorded above: first-card bug (§5), one-shot follow-ups (§1),
route fallback (§2), owner-kind mismatch (§3). Phase 1 may begin.
