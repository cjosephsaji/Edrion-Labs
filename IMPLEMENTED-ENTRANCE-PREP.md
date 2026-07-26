# Entrance Prep — Implementation Record

**Status:** Tier 3 complete — `sat_digital` **active** with CR-1 catalog + 3×54 item corpus (`0183`).

## Migrations

`0130`–`0139`, `0182` (dev seed), `0183_prep_sat_cr1_active` (syllabus, signoffs, score scale, corpus, `active`).

## Content (CR-1)

- `exam_syllabus_nodes` / `exam_syllabus_atom_map` / `exam_score_scales` / `exam_content_signoffs`
- `question_bank`: 3 practice forms × 54 items (`sat_cr1_f*_q*`)
- `exam_profiles.sat_digital.status = active`

## API (`/student/prep`)

| Endpoint | Purpose |
|----------|---------|
| `GET plan`, `POST plan/replan` | Week plan + idempotent replan |
| `POST plan/blocks/:id/complete` | Mark block complete (`payload.completedAt`) |
| `GET/PATCH exam-day` checklist | `prep_exam_day_cards` persistence |
| `POST mock-season/schedule` | Adaptive mock season blocks |
| `POST mock-season/module-submit` | SAT two-stage routing (`prep.adaptive_routing`) |
| `GET error-notebook`, `POST …/:id/reattempt` | Notebook → mock deep link |
| Diagnostic + Today sync | Existing services |

## Student web

- `/lab/prep` — plan board, exam-day card, block completion (wire to `complete` API)

## Parent digest

- `prep.parent_digest` flag gates `prepSummary` line in weekly digest (`ParentDigestService`).

## Tests

- `exam-prep-adaptive.service.spec.ts`

## Manual smoke

Enroll `sat_digital` (active) → replan → complete block → module-submit → parent digest preview with flag on.
