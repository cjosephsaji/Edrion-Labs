# Tier 3 Plan — Entrance Prep

## Execution header

| Field | Value |
|---|---|
| **Target feature** | Entrance & Standardized Exam Prep Mode (SAT-first international, ACT, thinner JEE/NEET) |
| **Attach at execution** | `/Users/macbook/Downloads/07-EXAM-PREP-MODE-HYPERSPEC.md` |
| **Prerequisites** | **`IMPLEMENTED-DEBATE.md`** (track order), `IMPLEMENTED.md`, `IMPLEMENTED-MARKS.md`, `IMPLEMENTED-LIBRARY.md`, **`IMPLEMENTED-EDRION-LEARN.md`**, **`IMPLEMENTED-MOCK-EXAMS.md`** |
| **Migration numbers reserved** | `0130`–`0139` |
| **Track and position** | Track A, position 2 of 2 (after Debate) |
| **Feature surface and capability flags** | `student.surface.exam_prep`; capabilities: `prep.profile.<key>`, `prep.adaptive_routing`, `prep.cohort_dashboard`, `prep.parent_digest` — **not** `student.module.prep` in new code |
| **Open blockers** | Tier 2 Learn/Mock closeout; **Content Lead named** (founder gate); SAT content readiness gate |
| **Human decisions** | HD-T3-004 error notebook annotations; HD-T3-005 Content Lead; HD-T3-006 SAT launch evidence |
| **Conditions before Phase 1 code** | Licensing/provenance memo; SAT framework import started; `exam_profile_key` FK design agreed with Mock closeout |

---

## 1. Summary

Entrance Prep orchestrates existing engines — **Mock** (player + adaptive routing extension), **Library/FSRS**, **Edrion Learn** sessions, **Today** obligations — behind exam profiles and a deterministic plan board. Profile priority: **(1) SAT complete E2E**, **(2) ACT E2E**, **(3) JEE thinner PYQ/mock**, **(4) NEET thinner PYQ/mock**. SAT must be launch evidence before other profiles count as shipped.

Ownership: replace hyperspec `user_id` with **`institution_id + student_id` OR `independent_user_id`** with XOR enforced in DB and services. Catalog tables (`exam_profiles`, administrations, syllabus nodes) are global/system-owned; learner tables dual-owner.

Error Notebook: **wrong answers = derived projection** from Mock/Learn attempts; mutable learner state only in **versioned annotation table** (`prep_error_notebook_entries` or equivalent) — tags, notes, resolution, pointers to source attempt/question; **re-attempt my errors** paper generation via Mock engine.

Content workstream runs **before and parallel to code** — dedicated Content Lead required; founder must name owner.

---

## 2. Current repository state

### 2.1 Mock / exam engine

- Tables in `student-knowledge.ts`: `mock_exams`, `exam_blueprints`, `question_bank`, etc.
- `PLAN-MOCK-EXAMS.md` reserves nullable **`exam_profile_key`** — not yet FK (Tier 2 incomplete).
- `apps/api/src/modules/student/exam-engine/*` is live module.
- NTA skin resolves to standard per Tier 2 amendment — Prep uses **standard player** for all v1 profiles.

### 2.2 Learn

- `learn_sessions`, `learn_topics`, `concept_atoms` exist; Tier 2 canonical entry contract in `PLAN-EDRION-LEARN.md` — **do not bind Prep to obsolete partial session APIs**.

### 2.3 Library / Today

- FSRS per `IMPLEMENTED-LIBRARY.md`.
- Obligations: `study_block`, `mock` in `packages/schemas/src/obligations.ts` — **no new Prep-specific obligation kind**; cap ≤3 Prep-sourced obligations/day in `TodayService` merge policy.

### 2.4 Prep tables

- Absent: `exam_profiles`, `prep_plans`, `error_notebook_*`, syllabus mapping tables per hyperspec §4.

### 2.5 Debate dependency

- Track gate: Debate IMPLEMENTED before Prep Phase 1 (program ordering); no hard data FK from Prep to Debate.

---

## 3. Spec Amendments

| # | Hyperspec | Amendment |
|---|---|---|
| A1 | `user_id`-only learner rows | Dual-owner XOR per repo |
| A2 | `student.module.prep` flags | `student.surface.exam_prep` + `prep.*` capabilities |
| A3 | JEE-first ordering | **SAT-first** international focus (program binding) |
| A4 | Separate exam engine for SAT | SAT adaptivity via **Mock engine** `exam_stage_routes` + `prep.adaptive_routing` |
| A5 | `nta` faithful UI | `nta` → standard resolver; disclose "coming soon" |
| A6 | `mistakes` table | **Forbidden** — projection + annotation table only |
| A7 | Learn session input partial | Consume **completed** Tier 2 entry `{entryPoint, topic/knowledgeItemId, goal, sessionContext}` |

---

## 4. Dependencies and shared contracts

**Consumes:**

- Mock: blueprint snapshot, player, `exam_profile_key` → FK `exam_profiles.id`, past-mistakes projection API from Mock closeout.
- Learn: session launcher contract only.
- Library: FSRS review queues, exam-weighted hook.
- Today: `study_block`, `mock` obligations.
- Marks: optional institutional reporting only — Prep does not compute GPA.

**Produces:**

- `exam_profiles` catalog, administrations, enrollment, plan board, error notebook UI, mock season scheduling, last-72-hours experience, parent digest (flagged).

**Mock integration:**

- Bind `mock_exams.exam_profile_key` (or renamed column) to `exam_profiles.key` / FK after migration `0130`.
- Adaptive routing: `exam_stage_routes` table + `route_path` jsonb on attempts per hyperspec §2.3.

---

## 5. Content workstream (pre-code gate)

**Owner:** Content Lead (founder-named).

**Deliverables before `prep.profile.sat_digital` → active:**

1. Licensing & provenance policy (PYQ vs authored).
2. SAT assessment framework → `exam_syllabus_nodes` tree.
3. `exam_syllabus_atom_map` with two-person validation gates (§4.5 hyperspec).
4. Item corpus in `question_bank` + tags; `content_strategy=authored_to_framework` enforced for SAT.
5. `exam_score_scales` with methodology disclosure strings.
6. Readiness checklist: coverage, answer validation, a11y, scoring disclosure, minimum corpus (≥3 full forms per §19.1).

**ACT** second; **JEE/NEET** PYQ/mock minimum afterward.

---

## 6. Migration-first PR (`0130`–`0132`)

**Tables (global catalog):** `exam_profiles`, `exam_administrations`, `exam_profile_blueprints`, `exam_delivery_profiles`, `exam_stage_routes`, `exam_score_scales`, `exam_syllabus_nodes`, `exam_syllabus_atom_map`, `exam_topic_weights`, `exam_content_signoffs`.

**Tables (learner, dual-owner):** `prep_enrollments`, `prep_constraints`, `prep_plans`, `prep_plan_weeks`, `prep_plan_blocks`, `prep_error_notebook_entries`, `prep_diagnostic_runs`, `prep_readiness_snapshots`.

**ALTER mock tables:** FK `exam_profile_id` or validated FK on `exam_profile_key`; `route_path`, `delivery_profile_key` snapshot on attempts.

**Views:** `v_prep_wrong_answers` — projection over `mock_exam_answers.evaluation` + compatible learn attempts (no duplicate answers store).

**CHECK:** `prep_error_notebook_entries` stores annotations only; FK pointers `(source_kind, attempt_id, question_id)` immutable.

**RLS:** Catalog read all authenticated; learner tables owner XOR.

---

## 7. Code phases

### Phase 1 — Profiles, administrations, enrollment, constraints, diagnostic (`0133`)

**Goal:** Profile picker, administration countdown, enrollment XOR owner, institution constraints (timetable-aware), diagnostic mock via standard player.

**API:** `/student/prep/profiles`, `/enrollments`, `/diagnostic/start`.

**Services:** `PrepEnrollmentService`, `PrepDiagnosticService`.

**UI:** Profile cards gated by `prep.profile.<key>`; staleness note on administrations >45d unverified.

**Tests:** XOR constraint; enrollment on non-active profile rejected.

**DoD:** Enroll SAT profile on test tenant with content gate flag override in dev only.

---

### Phase 2 — Plan board, scheduling, weekly re-plan, Today, Learn links (`0134`)

**Goal:** Deterministic plan generator; blocks deep-link Learn (`goal=acquisition|revision|remediation`) and FSRS; sync ≤3 obligations to Today.

**API:** `/student/prep/plan`, `POST /replan`.

**Obligations:** Map blocks → `study_block` with deep links; mock blocks → `mock` kind.

**DoD:** Re-plan idempotent; Today merge respects cap.

---

### Phase 3 — PYQ practice, projection, Error Notebook, re-attempt (`0135`–`0136`)

**Goal:** Tagged PYQ filters; wrong-answer projection UI; annotations CRUD with version; generate re-attempt mock from error set via Mock engine `role=error_reattempt` blueprint.

**No second mistakes table.**

**Tests:** Projection parity with Mock past-mistakes API; annotation optimistic concurrency.

**DoD:** Re-attempt paper playable end-to-end.

---

### Phase 4 — Mock season, SAT adaptivity, scores, cohorts (`0137`–`0138`)

**Goal:** Scheduled mock season; **SAT two-stage routing** server-side at module submit; score bands with honest methodology labels; cohort dashboard behind `prep.cohort_dashboard`.

**Flag:** `prep.adaptive_routing` for SAT only.

**Player:** `bluebook_v1` delivery profile — graphing calc embed, grid-in normalization in scorer.

**Tests:** Routing transaction atomicity; never disclose route to student during attempt.

**DoD:** Full SAT adaptive mock on staging with content corpus.

---

### Phase 5 — Final 72 hours, exam day, post-exam, parent digest, hardening (`0139`)

**Goal:** Checklist, taper suppresses estimates, exam-day card, post-exam state, optional `prep.parent_digest`.

**Notifications:** Minimal — respect quiet hours except institution-configured exam reminders.

**DoD:** SAT profile passes content readiness gate in prod config.

---

## 8. Security, privacy, and safety

- No target-college rank predictions.
- Estimates always bands + methodology.
- Catalog writes `exam_content_admin` only; AI proposals require human accept rows.
- Institutional reporting aggregates thresholded — no individual mock score leakage (Mock privacy contract).

---

## 9. Risks and failure modes

| Risk | Mitigation |
|---|---|
| Content schedule slip | Gate `exam_profiles.status` transitions |
| Trademark (SAT/ACT) | Copy layer §17.4 hyperspec |
| Blueprint drift | Snapshot on mock start |
| Learn API drift | Block on Tier 2 IMPLEMENTED contract test |

---

## 10. Test plan

- Contract: Learn entry payload fixture.
- Contract: `exam_profile_key` FK migration roundtrip.
- Integration: plan → Today → Learn deep link.
- SAT routing golden paths for easier/harder module.
- Content gate unit tests on `exam_content_signoffs`.

---

## 11. Acceptance criteria

1. SAT E2E: enroll → plan → practice → error notebook → adaptive mock → results with band disclosure.
2. ACT profile follows after SAT gate passes.
3. JEE/NEET thinner paths documented and flag-gated.
4. No `user_id`-only ownership in new tables.
5. No Prep-specific obligation enum value.
6. Content Lead recorded in `DECISIONS.md` before prod SAT enable.

---

## 12. Operational readiness

- `/admin/exam-content` tooling for mappers (internal).
- Weekly administration staleness job.
- Runbook: syllabus diff import.

---

## 13. Closeout

**`IMPLEMENTED-ENTRANCE-PREP.md`** — profiles shipped, Mock FK, projection + annotation contract, flags, deviations from hyperspec.
