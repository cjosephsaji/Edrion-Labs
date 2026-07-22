# Tier 2 Preflight Report

Date: 2026-07-21  
Scope: verification and documentation preparation only. No feature code, migration, schema, asset, or product-decision change was made.

## 1. Migration-number verdict

### Result

**0095–0098 are free and contiguous. No Tier 2 renumbering is currently required.**

| Feature | Planned migration | Verdict |
|---|---:|---|
| Graph Pipeline | `0095` | Free |
| Edrion Learn | `0096` | Free |
| Documents | `0097` | Free |
| Mock Exams | `0098` | Free |

Evidence:

- Highest SQL migration file: `packages/database/migrations/0094_library_fsrs.sql`.
- Latest journal entry: tag `0094_library_fsrs`, `idx: 94`, in `packages/database/migrations/meta/_journal.json`.
- No `0095*.sql` through `0098*.sql` files and no corresponding journal tags exist.

### Pre-existing journal discrepancy

`packages/database/migrations/0082_timetable_period_backfill.sql` exists, but `_journal.json` jumps from tag `0081_calendar_types_backfill` to `0083_strip_bell_schedules`; there is no `0082` journal entry. This does not occupy 0095–0098, but the journal/file divergence should be reconciled by the migration owner before adding Graph A1 so a new migration is not built on ambiguous history. This report does not modify the journal.

## 2. Human-decision dependencies

Every item below is a recommendation only. **Status for all seven: AWAITING FOUNDER RULING.**

| ID | Decision | Repository finding | Recommendation | Status |
|---|---|---|---|---|
| a | Debate source FK vs `source_meta` | `debates`, `debate_participants`, and `debate_turns` exist in `packages/database/src/schema/student-knowledge.ts`. There is no `debate_rounds` entity/table or `debate_round_id`; a turn has only a text `round` label and FK to `debates.id`. | **Defer the Graph provenance column entirely.** Reserve graph `clash`/group semantics and the typed consumer signature, then let Tier 3 add a relational `source_debate_id` FK to `debates` or a future round FK once its aggregate is known. A generic `source_meta` is technically safe if strictly validated, but it freezes a weak, non-relational bridge in 0095 without a current writer. | AWAITING FOUNDER RULING |
| b | Mock `exam_profile_id` target | No `exam_profiles` table, export, migration, or application reference exists. | Accept the plan’s reservation approach, but use a validated nullable profile key/reference without a fake FK in Mock D1. Add the real FK in Tier 3 when the owning entity exists. Do not create `exam_profiles` as Mock work. | AWAITING FOUNDER RULING |
| c | Document send-back tombstone vs hard delete | `RequestDocumentService.sendBack` changes the request `approved → in_review`, clears `fulfilmentDocumentId`, hard-deletes `student_document_vault`, removes the stored PDF, marks the render failed with `Sent back: {note}`, then appends an internal event/audit entry. These operations are sequential, not wrapped in one explicit DB transaction. | Prefer an `abandoned_at`/reason tombstone for audit provenance while retaining the current zero-student-visibility behavior. This would require a vault column/index, changing send-back from delete to update, excluding abandoned rows from issuance/student/download/verify queries, and defining whether a retried render reactivates the same unique render-linked row or creates a fresh render/vault row. Keep storage deletion. This touches enough behavior to require founder approval. | AWAITING FOUNDER RULING |
| d | Full-name verification default | `verify()` selects first/last name but returns only uppercase initials as `studentInitials`, plus issuer, document type, issue date, and valid/revoked status. No full-name setting exists. The public controller is currently annotated `SkipRateLimit`, so the planned verification rate limit is also absent. | Accept default-off full-name display. Add it later as an audited, permissioned institution setting; initials remain the default. The implementation phase must also remove the verification route’s rate-limit bypass and add the planned constant-shape privacy behavior. | AWAITING FOUNDER RULING |
| e | NTA reference assets | `apps/student-web/src/components/mock-exams/nta-reference/` does not exist. There are no canonical screenshots, viewport metadata, diff masks, or approved hex samples at that path. | Founder/design must supply and approve the real NTA reference assets. They must not be AI-generated or inferred. Mock D6 cannot be accepted—and the Tier 3 NTA contract cannot be declared frozen—without those assets and exact color/control annotations. | AWAITING FOUNDER RULING |
| f | Mutable error notebook vs derived projection | No `wrong_answers`, `mistakes`, `error_notebook`, `past_mistakes`, or equivalent table/service was found in database schemas or application code. Wrong/slipped evaluations exist on normal answer/result records. | Keep the derived owner-only projection over `mock_exam_answers.evaluation` plus immutable question/attempt data and compatible `learn_attempts`/`evidence_tags`. Approve a separate table only if users must edit notes/status, manually add mistakes, or preserve notebook state independently of answer evaluation history. | AWAITING FOUNDER RULING |
| g | Edrion Learn boundary split | All nine boundary files exist. Detailed classification below confirms several serve both Petros chat and old teaching; the remainder are durable teaching-support/aggregation code that should be retained and adapted. | Confirm the plan’s split/refactor boundary. Delete none of these nine wholesale. Petros keeps chat/intent ownership; Edrion Learn replaces pedagogy/session creation; shared path/revision/history responsibilities remain behind narrow ports. | AWAITING FOUNDER RULING |

### 2.1 Edrion Learn boundary-file classification

| File | Current responsibility | Classification | Recommended treatment |
|---|---|---|---|
| `apps/api/src/modules/student/learn/ask.controller.ts` | Exposes Petros ask/stream plus a `pin` endpoint that writes into an old lesson session. | **Both** | Retain Petros ask/stream. Route pin through a narrow Edrion Learn artifact/session port after rebuild. Do not delete controller wholesale. |
| `apps/api/src/modules/student/learn/ask.service.ts` | Runs Petros answer prompts, homework policy, visual grounding, AI logging; injects old `SessionsService` only for `pinNote`. | **Both** | Retain chat path and shared dependencies. Replace `SessionsService.pinNote` dependency with the new artifact/handoff port. |
| `apps/student-web/src/components/learn/AskPetrosDrawer.tsx` | Petros conversational drawer; “Pin to lesson” is enabled for session/concept/practice contexts. | **Both** | Keep as Petros UI, extract/adapt pin integration and remove old teaching-context assumptions as new contracts land. |
| `apps/api/src/modules/student/learn-ai/router.service.ts` | Routes one input among quick answer, learn topic, practice, revision, exam prep, and continue; emits copy that presents Petros as path/session teacher. | **Both** | Split into Petros-owned intent/handoff routing and explicit Edrion Learn entry payloads. No pedagogy decisions remain in Petros. |
| `packages/schemas/src/student/intent.ts` | Shared wire contract for quick chat and teaching/practice/revision routes. | **Both** | Refactor the discriminated contract rather than delete it: keep chat-vs-teaching handoff semantics and point teaching cases to the new entry contract. |
| `apps/api/src/modules/student/learn/path.service.ts` | Durable path CRUD/seeding and independent goal storage; also calls the old AI path prompt and uses purpose `session_plan`. It does not answer Petros chat. | **Old teaching support + durable substrate** | Retain repository/path operations and `learning_paths.goal`; rewrite the planner/goal contract under Edrion Learn. Do not delete the service/data role wholesale. |
| `apps/api/src/modules/student/learn/revision.service.ts` | Computes the durable revision queue, then starts the old `SessionsService` refresh flow and prematurely logs completion/freshness at session creation. | **Old teaching integration + durable substrate** | Retain queue calculation. Replace old session start with Edrion Learn entry; completion/freshness should occur on actual qualifying session evidence, not creation. |
| `apps/api/src/modules/student/learn/history.service.ts` | Aggregates old teaching sessions, Petros quick answers, mocks, and debates into one history. | **Both / cross-product aggregator** | Retain and label product kinds explicitly; update Edrion Learn states/routes while keeping Petros quick and Lab history. |
| `apps/student-web/src/app/(app)/learn/page.tsx` | One page mixes quick-answer Petros, AI intent routing, old teaching-session creation, independent path creation, revision, resume, and Petros-branded teaching copy. | **Both** | Make `/learn` the Edrion Learn home/goal surface and move quick-answer composition to Petros. Preserve path/revision/resume surfaces through new contracts. |

## 3. Graph JSON contract freeze and parity

### Freeze marker

`PLAN-GRAPH-JSON-CONTRACT.md` now begins with the exact marker **Status: FROZEN (Tier 2)**. No schema or implementation file was edited.

### Parity verdict

**PARTIAL MATCH — NOT DEPLOYED-SHAPE IDENTICAL. Graph A1 requires an explicit ruling/implementation change before the frozen contract can be enforced.**

| Contract area | Frozen document | Deployed `visuals.ts` / DB | Verdict |
|---|---|---|---|
| Archetypes | `mind_map`, `flowchart`, `cycle`, `timeline`, `hierarchy`, `comparison` | Exact same Zod set; exact same `visual_canvases_archetype_ck` set in Drizzle and migration 0063 | Match |
| Node types | `concept`, `process_step`, `decision`, `example`, `question`, `definition`, `formula`, `note` | Exact same set | Match |
| Node status | `normal`, `shaky`, `resolved` | Exact same set | Match |
| Node origin | `ai`, `student`, `ai_expansion`, `alternative_path` | Exact same set | Match |
| Edge types | Existing seven plus reserved `clash` | Only `leads_to`, `causes`, `requires`, `contrasts_with`, `example_of`, `part_of`, `alternative_to` | **Mismatch: `clash` is contract-only** |
| Layout algorithms | Six deployed algorithms | Exact same six | Match |
| Source-ref variants | `library_page`, `learn_topic`, `learn_session_block` | Exact same three and field shapes | Match |
| Root fields | Adds optional `groups` | Deployed root is strict and has no `groups` | **Mismatch** |
| Node fields | Adds optional `group_id`, `event_date`, `color_token`, `pinned` | Deployed node object is strict and has none of these | **Mismatch** |
| Color enum | References a closed `SubjectAccentToken` | No graph color field or graph-exported token enum exists | **Cannot currently satisfy/verify** |

Consequences:

- A frozen-contract graph containing `clash`, `groups`, group IDs, dates, colors, or pins will currently fail `canvasGraphSchema` because the deployed nested objects are strict.
- Existing deployed graphs remain represented accurately by the common subset.
- No silent reconciliation was made. Founder must rule whether Graph A1 is authorized to extend deployed v1 with these additive fields/reserved edge, or whether the frozen document must be revised before implementation.

## 4. `DECISIONS.md` scaffold

Appended dated stubs for **D-T2-001 through D-T2-018** to root `DECISIONS.md`.

Each stub contains:

- ID and title from Tier 2 Overview §4.
- The plan’s recommendation.
- `Status: PENDING FOUNDER SIGN-OFF`.
- A blank `Reversal trigger:` field.

No item was marked approved, rejected, or decided.

## 5. Existing-substrate sanity check

All requested load-bearing substrate names exist. No missing-name amendment error was found in this spot-check.

| Planned substrate | Repository evidence | Result |
|---|---|---|
| `mark_release_batches` | `packages/database/src/schema/grading.ts` → `markReleaseBatches` | Found |
| `student_document_vault` | `packages/database/src/schema/requests.ts` → `studentDocumentVault` | Found |
| `visual_canvases` | `packages/database/src/schema/visual-studio.ts` → `visualCanvases` | Found |
| `visual_canvas_revisions` | Same file → `visualCanvasRevisions` | Found |
| `exam_blueprints` | `packages/database/src/schema/student-knowledge.ts` → `examBlueprints` | Found |
| `question_bank` | Same file → `questionBank` | Found |
| `learn_ai_calls` | `packages/database/src/schema/learn.ts` → `learnAiCalls` | Found |
| `ai_policies` | `packages/database/src/schema/ai.ts` → `aiPolicies` | Found |
| `learning_paths.goal` | `packages/database/src/schema/learn.ts` → `learningPaths.goal` JSONB | Found |
| Learn AI provider | `apps/api/src/modules/student/learn-ai/provider.ts` (`LearnAiProvider`), OpenAI/null implementations, `LEARN_AI_PROVIDER` module binding | Found |

Related confirmed paths used by the plans include `learn_attempts.evaluation`, `evidence_tags.polarity`, `concept_atoms`, `learn_topics`, `document_templates`, `document_renders`, the central idempotency service, and the visual-memory diff service.

## 6. Orphan and cleanup-target sanity check

### Mock `lab-mock` orphan

- Present: `apps/api/src/modules/student/lab-mock/lab-mock.controller.ts` and `lab-mock.service.ts`.
- No `lab-mock.module.ts`, StudentModule registration, controller/provider registration, or import from outside that directory was found.
- `@ApiTags('student-lab-mock')` in the live `exam-engine.controller.ts` is only an API tag, not an orphan-module import.
- Verdict: the plan’s “present but unregistered orphan” description is accurate. It must not be removed until the Mock closeout parity/import check authorized by that phase.

### Old Edrion Learn teaching targets

All **30/30** paths listed in `PLAN-EDRION-LEARN.md` §2.2 are present:

- 7 API teaching/planner/prompt files.
- 3 session routes.
- 15 old teaching renderer/components.
- 3 web hook/navigation/type files.
- 2 shared session/block schema files.

They are not inert: `SessionsController`/`SessionsService` are registered in `student.module.ts`; `PlannerService`/`BlockGeneratorService` are registered/exported by `learn-ai.module.ts`; `AskService` and `RevisionService` import `SessionsService`; the three session routes import the old hook/navigation/renderer chain. Nothing in the delete list is already gone. This confirms the clean rebuild requires a coordinated replacement/removal PR, not mechanical deletion ahead of implementation.

## 7. Authorized-file change log

Only the following preflight documentation changes are authorized and made:

1. `PLAN-GRAPH-JSON-CONTRACT.md` — changed the status line to `FROZEN (Tier 2)`.
2. `DECISIONS.md` — appended 18 pending, unsigned Tier 2 decision stubs.
3. `TIER2-PREFLIGHT.md` — created this report.

No migration or feature file was changed by this preflight.

## CLEARED TO EXECUTE ONCE THE FOLLOWING ARE RESOLVED

Before **Graph Pipeline A1** starts:

- [ ] Founder rules on the Graph v1 parity gap: authorize A1 to add `clash`, `groups`, `group_id`, `event_date`, `color_token`, and `pinned`, or revise the frozen contract first.
- [ ] Founder rules on Debate provenance: recommended **defer the column**, versus reserving validated nullable `source_meta` in 0095.
- [ ] Founder signs off or changes the pending Tier 2 decision records that govern Graph A1, at minimum D-T2-001, D-T2-002, D-T2-003, and D-T2-005; no stub may be treated as decided while pending.
- [ ] Migration owner reconciles the missing `0082` journal entry/file divergence and re-confirms 0095 remains the next valid slot.
- [ ] Founder records rulings for preflight items b–g before their owning feature phase; these are not authorization to act meanwhile.

Not a Graph A1 blocker, but a hard later acceptance dependency:

- [ ] Founder/design supplies and approves canonical NTA screenshots, viewport metadata, exact hex samples, and comparison guidance before Mock D6.

