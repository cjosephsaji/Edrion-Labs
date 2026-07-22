# Tier 2 Plan — Mock Exams

## 1. Feature summary

Mock Exams turns existing paper patterns, editable blueprints, validated questions, exposure history, attempts, and answers into a complete practice loop: authoring/banks first, then student setup, reliable timed players, deterministic scoring, self-authoritative subjective grading, results, revision/cards, and trends. It extends the deployed exam-engine tables and leaves the separate institution examination/gradebook machinery untouched. The NTA skin is a frozen Tier 3 Entrance Prep dependency and must be implemented pixel-for-pixel against checked-in references.

## 2. Spec Amendments and resolved audit flags

### 2.1 Existing substrate and exact shape

All Mock tables are in `packages/database/src/schema/student-knowledge.ts`:

- `exam_paper_patterns`: `key,name,board,level_label,duration_min,total_marks,sections,description`. Reuse as the system pack.
- `exam_blueprints`: deployed dual owner columns, `paper_pattern_id`, `source_kind`, `blueprint jsonb`, and optimistic `version`. `ExamBlueprintV1` is at `packages/schemas/src/student/exam-blueprint.ts`, with `template,title,subjectLabel,durationMin,difficultyCurve,sections,topicWeights,paperPatternId,sourceKind`. Sections already carry id/name/question count/types/marks. Extend this JSON and columns; no second section/blueprint table and no duplicate `blueprint_version` column on blueprint—`version` is it.
- Canonical question types are `mcq_single|mcq_multi|assertion_reason|fill_blank|match_following|numerical|short_answer|long_answer|case_based`. The hyperspec’s alternate `numeric|true_false|match` names do not replace them. UI/import adapters may map external names to these literals.
- `mock_exams`: owner/title/subject/topics/context/reference/goal/blueprint/source/generation notice/grading/status/generated/version/timestamps. It lacks scope/difficulty/schedule/strict/snapshot/meta.
- `mock_exam_questions`: question fields, payload, section/difficulty, and `question_bank_id`. Existing generation currently writes that FK as null even when a bank item was used; fix provenance.
- `mock_exam_attempts`: timing, pause, status, clock skew, and `results jsonb`. Reuse `results` as the versioned `results_cache`; do not add a duplicate cache column.
- `mock_exam_answers`: choice/text/single photo/flag/payload/client timestamp/evaluation. Extend for answer state/time/mode/multi-photo refs.
- `question_bank`: global validated item fields with prompt hash/version and payload, but no institution/subject/source/review gate. `question_exposure` already provides dual-owner exposure and is reused.
- The live module is `apps/api/src/modules/student/exam-engine/*`. `apps/api/src/modules/student/lab-mock/*` is an unregistered orphan/older implementation. Remove it after verifying no imports/routes/jobs; do not maintain two engines.

### 2.2 Current behavior that must change

- Current generation can fall back to fake placeholder questions and allows any shortfall. Remove placeholders. Apply the spec’s validated shortfall rule: ready only at >=60% of requested count, with honest shrunk-paper copy; below 60% is `generation_failed`.
- Current generation records bank IDs for exposure but inserts all generated question rows with `question_bank_id=null`. Carry `{question,bankId?,source}` through validation and persist it.
- Current question-bank insertion makes generated items immediately selectable. Backfill existing successfully used/validated items as approved; new AI/import items are pending until explicit teacher approval. Student-private generated questions may be used in their current mock but are not an approved institution bank item.
- Current subjective service makes AI marks authoritative. Replace this for subjective questions: objective is deterministic; subjective self-grade is final, and AI appears only after self-grade as a comparator. The current three-sample ensemble is new work.
- Current Quick Check pause endpoint/UI resumes with extended time. Spec Part B §5.1/§7 says timer never pauses for any skin, including Quick. Remove pause/resume behavior from the new player; keep old paused rows recoverable by migration/one-time resume policy.
- Current answer grace is 30 seconds. New contract accepts through server end+120 seconds and rejects at +121 with 409 `EXAM_OVER`.
- Current status vocabulary includes `paused`, `grading`, `graded`, etc. Extend/backfill without invalidating old values; API presents the new state machine while legacy rows remain readable.
- Correct keys are already stripped before in-progress responses; retain and test every route/cache.
- No repository table/service matching “wrong-answer/error notebook” was found. Do not invent a shadow “mistakes” table. Recommendation: the past-mistakes source is a query projection over `mock_exam_answers.evaluation` joined to immutable question/attempt snapshots, plus the required compatible `learn_attempts`/`evidence_tags` write. If a separately mutable notebook is desired, it is a founder/schema decision listed in Tier 2 Overview.

### 2.3 Ownership and privacy correction

- Use repository ownership: institution student = `institution_id + student_id`; independent = `independent_user_id`. Institution-authored blueprint/bank rows carry institution only; system patterns live in `exam_paper_patterns`. Do not add `owner_kind/user_id`.
- Voluntary mocks and strict-mode tab switches remain owner-private. Staff aggregates are separately computed, disabled by default, thresholded, and never expose individual scores. Teacher-side `exams`, schedules, paper questions, attempts/answers, and official marks are untouched.

### 2.4 Strategic calls resolved

Part B §7 and Part A §4.4/§5:

1. Subjective self-grade authoritative, AI comparator always: accept.
2. 60% generation shortfall: accept with exact threshold and no placeholders.
3. Timer never pauses: accept, including Quick mocks.
4. Psychometrics appear at n=30 and never auto-reclassify declared difficulty: accept.
5. `individual_scores_visible=false` is hard-coded for voluntary mocks: accept; future explicitly assigned mocks require a separate reviewed contract.

Additional NTA call: freeze exact button labels/order, palette colors/states, candidate strip, section tabs, and screenshot fixtures. Any visual change after release requires explicit contract review because Tier 3 consumes it.

## 3. Dependencies and contracts

### Reuses

- Existing `exam_blueprints`, `exam_paper_patterns`, question bank/exposure, mock exam/question/attempt/answer tables.
- Shared AI provider/budgets/`learn_ai_calls`, BullMQ, notification preferences, storage/photo validation.
- Today obligation schema/API (`kind='mock'`) for scheduled mocks; completion updates the same signal.
- `learn_attempts`/`evidence_tags` compatible evidence writes and Edrion Learn remediation entry contract.
- Library standard flashcard curation and existing deck/flashcard/FSRS storage.
- Feature visibility uses `student.surface.lab` plus `lab.mock_exams.visibility`, never `student.module.*`.
- Shared pure grading is reused only if a future mock projection calculates an academic GPA/standing. Mock raw score/negative/optionality math is a distinct pure exam scorer and must not be mislabeled GPA.

### Exposes downstream

- Versioned blueprint snapshot/system pattern contract, including `exam_profile_id` hook.
- Frozen NTA player contract for Tier 3 Entrance Prep.
- Approved bank selection/provenance/psychometrics read contracts.
- Stable mock remediation entry payload for Edrion Learn and Petros fallback.
- Owner-private attempts/results and privacy-thresholded institution aggregates.

## 4. Implementation phases

### Phase D1 — Blueprint/bank/mock migration and shared schemas (Part A §1, §4.1; Part B §1)

**Goal:** land additive storage and compatibility parsers first.

**Files**

- Add `packages/database/migrations/0098_mock_exam_extensions.sql`; modify `packages/database/src/schema/student-knowledge.ts`, schema exports, journal/grants/RLS.
- Extend `packages/schemas/src/student/exam-blueprint.ts`, `exam-questions.ts`, `mock-exams.ts`, `exam-grading.ts`; add focused `mock/` schemas for snapshots, player state, results, psychometrics, imports.
- Commit `docs/mock-blueprint-audit.md` or an equivalent “REUSE/ADD” section in the implementation PR record.

**Blueprint extensions**

- Extend JSON section with optional/defaulted `negative:{mode:'none'|'fraction'|'fixed',value}`, `optionality:{answerAny}|null`, `sectionTimeSec|null`, `shuffleQuestions`. Preserve `id`, `questionCount`, `questionTypes`, `marksPerQuestion` and actual question literals.
- Extend blueprint JSON with instructions and versioned presentation metadata as needed. Add columns on `exam_blueprints`: `skin CHECK standard|nta|paper DEFAULT standard`, `grading_style CHECK auto|ai_assisted|self_graded DEFAULT auto`, nullable `exam_profile_id` only if the actual Tier 3 table exists by execution time (otherwise defer FK and use a validated nullable profile key), `is_published DEFAULT false`, `archived_at`, and explicit `origin` only if owner columns cannot unambiguously derive system/institution/student. Recommendation: derive origin and avoid redundant column.
- Existing `version` is optimistic concurrency and blueprint version. Structural edit increments it; published edit audits. Backfill skin/grading from JSON/question types and preserve any already-visible institution blueprint as published.
- Validate unique section IDs, computed totals, timing consistency, NTA types only `mcq_single|numerical`, and long answer implies paper/non-auto.

**Mock snapshot/attempt/answer extensions**

- `mock_exams`: add `scope jsonb`, `difficulty`, `scheduled_for`, `strict_mode DEFAULT false`, `blueprint_snapshot jsonb`, `blueprint_version integer`, `generation_meta jsonb`, `obligation_id` nullable, and status support for `draft|queued|generating|ready|generation_failed|scheduled|in_progress|submitted|scoring|awaiting_self_grade|scored|expired|abandoned` while retaining legacy accepted values during transition.
- `mock_exam_questions`: add `source CHECK bank|ai`, validator/prompt provenance and immutable snapshot hash if not already inside payload; retain `question_bank_id` FK.
- `mock_exam_attempts`: add `submitted_at`, `tab_switches DEFAULT 0`, `strict_mode_snapshot`, `current_section_id`, `section_deadlines jsonb`, `scoring_version`; keep `results` and old pause columns for compatibility but new flows never set paused.
- `mock_exam_answers`: add `state CHECK unseen|seen|answered|marked|marked_answered`, `time_spent_ms`, `answer_mode CHECK type|photo|on_paper`, `photo_refs jsonb`, and answer/evaluation schema versions. Preserve existing fields/readers.

**Question bank extensions**

- Add nullable `institution_id`, `subject_id`, `source CHECK manual|import|ai|system`, `review_status CHECK pending|approved|rejected`, `topic_tags text[]`, declared difficulty, duplicate/review metadata, created/reviewed actor/timestamps/version. Define allowed row shapes for global/system and institution bank; independent AI output is not a shared approved bank row unless a separate private-owner field is deliberately approved.
- Backfill existing validated/used rows as approved and source system/legacy; new AI/import defaults pending, manual teacher entry may be approved immediately only with permission/audit.
- Keep `question_exposure`; add indexes for approved institution/global subject/topic/type/difficulty selection.

**Definition of done**

- Old blueprint/mock/answer/question fixtures parse and render. No new blueprint/pattern/bank/attempt table.
- Ownership/RLS, snapshot immutability, NTA/type, total/timing, status transition, review gate, and migration double-run tests pass.

### Phase D2 — System paper pack and blueprint authoring (Part A §2–§3)

**Goal:** provide reusable system and institution/student blueprints before the wizard.

**Files**

- Idempotent data migration/seed into `exam_paper_patterns`; blueprint API/service extensions; institution Academics → Blueprints; student “My blueprint” builder; shared paper-shape strip.

**System pack**

- Seed stable keys for JEE Main, NEET-UG, CBSE X/XII subjects, university end/mid terms (reuse KTU when present), SAT R&W/Math, and generic AP with actual canonical question types. Do not duplicate existing CBSE/KTU rows. Validate every resolved pattern.
- System patterns read-only; “Duplicate” creates version-1 blueprint for institution/student owner.

**Authoring/API**

- Institution list/builder/publish/archive under `lab.blueprints.publish`; use owning blueprint service and `PortalCrudEngine` only for truly flat list CRUD, not as a reason to bypass structured validation.
- Student CRUD is owner-only and cannot publish institution-wide. Endpoints require idempotency/expected version; no hard delete.
- Reorderable section cards, negative options, optionality, timing, types, skin/grading, live computed paper strip. Server computes totals; client-supplied total ignored.
- Publishing audits once and appears on next wizard open. Editing increments version and leaves every mock snapshot byte-identical; UI notes scheduled mocks on old version.

**Definition of done**

- Part A §1.6 and §2–§3 acceptance all pass, including double seed, permission 403/button absence, unpublish snapshot safety, and exam-profile hook behavior if FK exists.

### Phase D3 — Institution question banks, import/review, selector, psychometrics (Part A §4)

**Goal:** build human-reviewed reusable inventory and provenance-aware selection.

**Files**

- Extend `question-bank.service.ts`; add bank management controller/services/import processor/psychometric rollup; institution Banks UI/review queue.

**Behavior**

- Banks grouped/filterable by subject/type/topic/difficulty/review/source. Teacher manual editor validates through the same canonical question schema.
- CSV template + DOCX numbered-heading heuristic run as BullMQ import; idempotency/dedupe by import job/key and prompt hash. Ambiguous/malformed rows become attention records in job result, not invalid bank items.
- AI bank generation <=50/job uses the same validator as mock generation and always lands pending with prompt lineage. Bulk approval max 25/action with summary confirm/audit. Keyboard review shortcuts and duplicate comparison.
- `bankSelect` returns approved only, authorizes institution/global scope, exact tag before subject, meets type/difficulty mix, excludes last-five-mock IDs, downweights exposure, and returns partial. No correct key leaks to player payload.
- Psychometrics read from existing mock answers/questions/attempts and eligible official exam data. Async rollup every five minutes; no scoring hot-path write. Below n=30 no stats; at 30 show p/n/time and effective band. Mismatch informational only.

**Definition of done**

- Part A §4 acceptance 1–6, tenant isolation, import retry, no AI auto-approval, and selector property tests pass.

### Phase D4 — Wizard, snapshot, generation, and validation (Part B §2–§4)

**Goal:** create a complete validated mock before any player starts.

**Files**

- Refactor `exam-generation.service.ts`, `question-bank.service.ts`, prompts/processor/service/controller; extend student new/list/detail UI and hooks.

**Wizard**

- Step 1 source: studied topics, Library documents, manual topic; ownership/index readiness enforced.
- Step 2 grouped blueprint picker: published institution (institution only), system patterns (prep-profile first), personal, and pinned Quick Mock “20 MCQ · 30 min · auto”; show shared paper strip/totals and thin-source warning.
- Step 3 difficulty/schedule/strict/setup review. Create idempotently persists full resolved `blueprint_snapshot`/version before queue. Scheduled creates one Today `mock` obligation with deep link; completion closes it.
- Generation card copy stages “Selecting questions…”, “Checking answers…”, “Ready”; failure offers same-row retry/change setup. Notifications only ready/failed.

**Generator/validator**

- Carry records `{question,source,bankId}`. Bank pass approved only. AI top-up by section/type within bounded calls.
- Every AI item: strict schema/answer validation, blind solve/check independent of generation answer, distractor quality/uniqueness, grounding/topicality, duplicate hash/embedding. Retry/repair within fixed cap; no placeholders.
- Passed AI item is used in current owner’s mock and inserted into appropriate bank scope as `pending` with lineage. It is not selectable for other mocks until teacher approval; independent generated items need an explicit private/system curation policy and otherwise remain question snapshots only.
- Persist exact `question_bank_id` for bank source and new bank row where policy permits. Record exposure only for actual used bank IDs.
- If accepted count >=60% target, shrink snapshot section counts/totals deterministically and mark ready with exact honest notice. Below 60%, mark generation_failed and persist reason/meta; zero question never ready.

**Definition of done**

- Blueprint edits after creation cannot affect player/scorer. Bank provenance/exposure, 60% boundary (59.9 fail/60 ready), no placeholders, blind solve/distractor faults, retry idempotency, source auth, Today scheduling/completion, and notification tests pass.

### Phase D5 — Reliable player core and standard skin (Part B §5.1–§5.3)

**Goal:** establish timer, autosave, offline, palette, strict mode, and submission once.

**Files**

- Refactor `exam-engine.service.ts/controller.ts`, answer schemas/store/offline queue/timer/palette, standard attempt page; remove pause hook/UI/endpoint from new flow.

**Server contract**

- `POST /student/mock-exams/:id/start` idempotently creates one attempt with server `ends_at` and section deadlines from immutable snapshot. Reopen returns same attempt/deadline; timer never pauses.
- `PUT /:id/attempt/answers/:questionId` with answer payload, client update timestamp, monotonic answer version/idempotency. Accept through `ends_at+120s`; after returns 409 `EXAM_OVER`. Server rejects expired section back-navigation/writes.
- `POST /:id/attempt/tab-switch` increments only when strict snapshot true, transition hidden while in-progress, deduped by client event ID. Never appears in staff projections.
- `POST /:id/submit` expected version/idempotency; in_progress→submitted exactly once and queues one score job. Double tap/retry replays.
- Correct answers/rubrics stripped until submitted/result authorization; audit response caches/SSE too.

**Client**

- Server-anchored timer; amber at 20%, never red/flashing. Local attempt store persists current question/palette/answers/times; autosave/offline queue uses last-write version and flushes safely. Banner for queued answers.
- Standard skin: section tabs, question, previous/mark/save-next, responsive palette with unseen/seen-unanswered/answered/marked/marked+answered.
- Submit confirmation exact counts; emerald Submit. No exit pause—leaving explains timer continues.

**Definition of done**

- Kill/reopen, five offline answers, +119/+121 grace, section expiry, strict counter, double submit/score, clock-skew, stale-save and answer-key leak tests pass.

### Phase D6 — Frozen NTA and paper skins (Part B §5.4)

**Goal:** implement both alternate presentations over the same player state/API.

**Files**

- Add `apps/student-web/src/components/mock-exams/players/{standard,nta,paper}/*` and shared headless player state.
- Add canonical reference screenshots/metadata under `apps/student-web/src/components/mock-exams/nta-reference/` before styling; include viewport, source/version, color samples and expected diff masks.

**NTA frozen contract**

- Desktop-faithful candidate name/photo strip, NTA typography, question left, palette right, section tabs, submit top-right.
- Exact action labels/order: **Save & Next**, **Clear Response**, **Save & Mark for Review**, **Mark for Review & Next**, plus Back/Next as the reference specifies. Mobile compresses only; labels/colors/order do not change.
- Palette uses exact checked-in reference hex values/states. Visual regression tests at frozen viewports and keyboard/focus/accessibility tests. No generic design-token substitution where it changes contract pixels.

**Paper**

- Scrollable paper with section headers/margin numbers. Per-question mode Type (rich text/KaTeX), Photo (multi-shot, thumbnails/retake, validated uploads), On paper (answered pen chip, self-grade later). Floating palette uses same state model; timer identical.

**Definition of done**

- Part B §5 acceptance 1–7 plus NTA screenshot threshold/labels/order/palette and paper photo/on-paper/offline tests pass. Tier 3 can import the frozen NTA component/contract without branching it.

### Phase D7 — Pure scoring and subjective self-grade comparator (Part B §6.1)

**Goal:** replace current authoritative AI subjective grading with retry-safe scoring.

**Files**

- Extract pure `mock-scorer.ts` + property/golden tests; refactor `exam-subjective-grading.service.ts`, processor, evaluation schemas, APIs/UI.

**Objective**

- Snapshot answers on submit. Deterministically apply question keys, negative mode, and section `answerAny` best answered scores; no negative below rules’ floor. Fully objective target scored <3s p95.
- Idempotently write answer evaluation, attempt results, compatible one `learn_attempts`/`evidence_tags` per objective question, and completion events. Stable scoring version/key makes queue retry no-op.

**Subjective**

- Build 2–5 weighted rubric criteria summing exactly to marks (bank rubric verbatim where present). Attempt becomes `awaiting_self_grade`; hero shows objective score and count awaiting.
- Per question, show answer + rubric. Student records criteria/self marks first. Only then, if not on-paper, run three independent bounded AI grades and reveal per-criterion comparison/confidence: unanimous high, split medium, photo low on OCR uncertainty; on-paper n/a/no AI. Exact header: “AI-graded — review the rubric. Your grade counts.”
- Store `evaluation.self`, `evaluation.ai`, `evaluation.final_source='self'`; final/hero uses self. “Show with AI grades” is display-only and never rewrites final score/evidence.
- Results cache/version updates idempotently after each self-grade; score job retry never reveals AI early or duplicates evidence.

**Past mistakes**

- Implement owner-only projection from wrong/slipped `mock_exam_answers.evaluation` + immutable question/attempt rows, with stable item IDs. Do not create a separate table. Cards/remediation consume this projection. Document limitation: it is derived and corrections follow evaluation history.

**Definition of done**

- Objective p95 fixture, optionality best-N, negative marking, AI-hidden-until-self, final source self, on-paper no AI, ensemble confidence, scoring retry/evidence exactly once, and derived-mistakes projection tests pass.

### Phase D8 — Results, review, cards/remediation, trends, resume, privacy (Part A §5; Part B §6)

**Goal:** close the practice loop without auto-mutating Library/Learn or exposing scores.

**Results**

- Hero score/pattern/attempted/accuracy, per-section filter bars, worst-first topic heat with Review/Cards from misses/Fix with Edrion Learn, time analysis/outliers, and strict exact line “Focus check: you left the exam screen N times.” No red score numerals; topic bar red only below 33%.
- Review full paper; explanations generated on first authorized view and cached inside versioned `mock_exam_attempts.results`, never recomputed per render. Palette navigation and per-topic filter.
- Cards from misses uses existing Library curation; one proposal/miss, zero save before acceptance, FSRS rows after acceptance.
- Fix with Edrion Learn sends `{entryPoint:'bad_result',goal:'remediation',source:'mock',mockId,topicIds,emotionalContext?}` to the stable session API. If rollout unavailable, open Petros chat prefilled with the same summary; label/copy must not call Edrion Learn “Petros Learn.”
- Trends require two attempts, group by blueprint ID with version chip only when mixed; points open results. Lab resume priority: in-progress, scheduled <=48h, ready, awaiting self-grade, last result.
- Notifications only generation ready/failed, T-1h schedule reminder, scored. Respect module/quiet-hours settings.

**Privacy aggregates**

- Existing settings plumbing stores `aggregates_enabled=false`, scope, min cohort default 10; individual scores remains constant false. Disabled endpoint 403; below threshold returns only `insufficient_cohort`; voluntary data never joins student ID to a staff score projection. Student disclosure exact when enabled.

**Definition of done**

- Part B §6 acceptance 1–9 and Part A §5 acceptance 1–4 pass; every result number/action works, cards require acceptance, remediation payload matches both paths, strict count private, trends threshold correct, aggregate privacy/query tests pass.

### Phase D9 — Consolidation, hardening, and closeout

**Goal:** remove the orphan implementation and publish stable contracts.

- Prove no imports/jobs/routes use `apps/api/src/modules/student/lab-mock/*`, then delete it and its obsolete schemas/tests. Keep only `exam-engine` (renaming module later is optional and not worth a risky broad move).
- Delete old pause UI/hooks/new-flow endpoint after legacy paused-row migration handling. Remove `apps/student-web/src/app/(app)/lab/mock-exams/CONFLICTS.md` only after its still-relevant decisions move into implementation record/tests.
- Load/security/accessibility/offline/queue/AI-budget/PII/answer-key audits and operational dashboards.
- Write `IMPLEMENTED-MOCK-EXAMS.md` with migration/audit verdicts, system keys, blueprint snapshot, bank review/selection, validator/shortfall, player/NTA version/reference, scoring/evaluation/past-mistakes projection, privacy, Edrion Learn/Library/Today contracts, decisions/deviations, test commands, and Tier 3 NTA/exam-profile APIs.

## 5. Risks and landmines

| Risk | Guard |
|---|---|
| Parallel `lab-mock` and `exam-engine` behavior | One registered engine, parity/import proof, delete orphan at closeout. |
| Fake/invalid paper becomes ready | No placeholders, strict validator/blind solve, >=60% threshold. |
| Bank item provenance lost | Carry source/bank ID through pipeline and FK/exposure contract tests. |
| Pending AI items become selectable | Selector hard filter, default pending, explicit approval/audit. |
| Blueprint edit changes live mock | Full immutable snapshot; player/scorer never read live blueprint. |
| Timer extended by exit/pause | Server absolute deadlines; no pause transition/UI. |
| End-of-exam answer loss/race | Explicit 120s grace, versioned idempotent writes, server time. |
| Correct key leaks | Response projection tests on every pre-submit route/cache/log. |
| AI subjective grade becomes authoritative | Schema `final_source='self'`, hero/scorer tests, AI gated after self. |
| Scoring retry duplicates evidence | Stable scoring/evidence keys and transactional upserts. |
| “Wrong-answer data” shadow table | Derived projection over answers + shared Learn evidence; founder decision if mutable notebook needed. |
| NTA drifts before Tier 3 | Checked-in refs, frozen component contract, visual regression gate. |
| Voluntary scores visible to institution | Hard false, thresholded aggregates, query-level privacy contract. |
| Photo upload abuse/PII | Signed owner upload, MIME/size/count/scan, expiring refs, no staff projection. |
| Cost blowup from validation/ensemble | Fixed batch/retry/sample caps, shared budgets/logs, async queues. |

## 6. Acceptance and closeout checklist

- Map Part A §1–§5 and Part B §4–§6 acceptance items to automated/manual evidence; explicitly sign the five strategic calls.
- Prove zero parallel blueprint/pattern/bank/mock/flashcard/mistake stores and teacher exam tables untouched.
- Prove system seed idempotency, blueprint version/snapshot immutability, bank human approval, provenance/exposure, psychometric n=30 behavior.
- Prove generation shortfall/no-placeholder, offline/timer/grace/strict/submission reliability, exact frozen NTA screenshots/actions, paper modes.
- Prove objective scorer/optionality/negative marks, subjective self authority/AI reveal, evidence idempotency, results/actions/trends/Today/Library/Edrion Learn integrations.
- Prove privacy defaults/thresholds/no staff individual score path and closeout documents every downstream Tier 3 contract.

