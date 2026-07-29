# IMPLEMENTED-MOCK-EXAMS.md

Mock Exams (PLAN-MOCK-EXAMS D1–D9) — implementation record.

## Decisions (founder-confirmed)

| Decision | Resolution |
|---|---|
| `exam_profile_id` FK | Deferred — `exam_profile_key text` nullable slug (no `exam_profiles` table yet) |
| Mutable past-mistakes notebook | No — projection over `mock_exam_answers.evaluation` only |
| Migration number | `0100` / `0101` (0098/0099 already Documents / mark batches) |
| D-T2-017 NTA skin | **AMENDED** — `nta` reserved; render → standard + coming-soon note; frozen NTA deferred until `nta-reference/` assets |

See also `DECISIONS.md` § Mock Exams and `docs/mock-blueprint-audit.md`.

## Build status

| Phase | Status | Notes |
|-------|--------|-------|
| D1 Migration + schemas | Shipped | `0100_mock_exam_extensions.sql`, schema/Zod extensions, RLS for published institution blueprints |
| D2 System pack + authoring | Shipped | `0101_mock_system_paper_pack.sql`; student wizard blueprint APIs; portal `/portal/lab/blueprints` |
| D3 Banks / review / selector | Shipped | `bankSelect` approved-only; pending AI default; portal banks + review + privacy aggregates |
| D4 Wizard / generation | Shipped | Snapshot-before-queue; ≥60% shortfall; no placeholders; `question_bank_id` provenance |
| D5 Player core | Shipped | 120s grace → 409 `EXAM_OVER`; pause disabled; leave copy; offline banner; strict tab-switch |
| D6 Skins | Shipped (amended) | Paper skin + standard player; `nta` reserved → standard fallback (D-T2-017). Frozen NTA pixels **DEFERRED**. |
| D7 Scorer / self-grade | Shipped | `mock-scorer.ts`; self authoritative; AI post-self comparator ensemble |
| D8 Results / mistakes / privacy | Partial | Past-mistakes projection + aggregates endpoint; trends/cards/Learn remediation hooks deferred polish |
| D9 Consolidation | Shipped | `lab-mock/*` deleted (orphan proven); this document |

## Substrates extended (no parallel tables)

- `exam_blueprints` — `skin`, `grading_style`, `exam_profile_key`, `is_published`, `archived_at`
- `mock_exams` — `scope`, `difficulty`, `scheduled_for`, `strict_mode`, `blueprint_snapshot`, `blueprint_version`, `generation_meta`, `obligation_id`
- `mock_exam_questions` — `source`, `validator_meta`, `snapshot_hash` (+ existing `question_bank_id`)
- `mock_exam_attempts` — `submitted_at`, `tab_switches`, `strict_mode_snapshot`, `section_deadlines`, `scoring_version` (`results` = cache)
- `mock_exam_answers` — `state`, `time_spent_ms`, `answer_mode`, `photo_refs`, schema versions
- `question_bank` — institution/review/source/tags + backfill approved

## System pattern keys (0101)

`jee_main`, `neet_ug`, `cbse_x_maths`, `cbse_x_science`, `cbse_xii_physics`, `university_end_sem`, `university_mid_term`, `sat_rw`, `sat_math`, `ap_generic`  
(REUSE existing `cbse_8_10`, `ktu_university`, `chapter_test` — not duplicated)

## Behavioral contracts

- Blueprint snapshot immutable for player/scorer
- Generation: no placeholders; fill &lt;60% → `generation_failed`; ≥60% shrinks snapshot with honest notice
- Bank: AI/import → `pending`; `bankSelect` approved only
- Timer never pauses; answer grace `ends_at+120s`
- Subjective: `evaluation.final_source='self'`; AI comparator after self only
- Past-mistakes: projection only (`GET .../past-mistakes`)
- Privacy: `individual_scores_visible` hard false; aggregates default off / cohort threshold

## Key APIs

Student (`/student/lab/mock-exams`):

- `GET wizard/blueprints`, `POST wizard`, `POST blueprints/from-pattern/:key`
- `POST :id/start`, `PUT :id/answers/:qid` (+ attempt alias), `POST :id/submit`
- `POST :id/attempt/tab-switch`, `POST :id/self-grade/:questionId`
- `GET past-mistakes`, `POST :id/pause` → 403 `PAUSE_DISABLED`

Portal (`/portal/lab`):

- Blueprints CRUD + publish/unpublish/archive
- Banks list / review-queue / bulk approve|reject (max 25)
- `GET mocks/aggregates` (privacy-gated)

## Tier 3 contracts

- NTA player component: **does not exist yet** (D-T2-017). Tier 3 consumes blueprint/paper-pattern **shape** (D2) + **standard** player. When `skin='nta'` is selected today, render resolves to standard with a coming-soon note.
- Frozen NTA pixel skin: **DEFERRED** until approved assets in `nta-reference/` (reversal trigger in DECISIONS.md D-T2-017). Pixel-regression gate: DEFERRED — NTA assets pending.
- Exam profile: `exam_profile_key` hook ready; FK when `exam_profiles` exists.

## D6 amended (shipped)

- **Paper skin:** scrollable paper, section headers, Type / Photo / On-paper modes, floating palette, same timer/offline/leave contract as D5.
- **`nta` enum reserved:** still validates/selectable; `resolveRenderSkin('nta') === 'standard'`; calm dismissible note; no `players/nta/*` module.
- **No skin enum/schema change.** Future frozen NTA is a component swap on the resolver.
- Part B §5 NTA-pixel acceptance items: recorded **DEFERRED — NTA assets pending**, not failed/waived.

## Test commands

```bash
pnpm --filter @edrion/database migrate
pnpm --filter api exec vitest run src/modules/student/exam-engine/mock-scorer.spec.ts
pnpm --filter @edrion/schemas exec vitest run src/student/mock/skin-resolver.spec.ts
pnpm --filter student-web exec vitest run src/components/mock-exams/players/MockExamPlayer.spec.ts
```

## Deviations / follow-ups

- Institution-web Academics → Blueprints/Banks UI pages are API-ready; full builder UI polish remaining
- Today `kind=mock` obligation writer on schedule not fully wired
- Cards-from-misses / Fix-with-Edrion-Learn remediation payload helpers not yet on results page
- Psychometrics rollup job (5 min) not scheduled — read path present on demand
- Frozen NTA player + visual regression: deferred (D-T2-017)
