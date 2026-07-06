# Institution-type nomenclature

Edrion serves schools, colleges, universities, and training centers from one data model. Canonical keys (`gradeLevel`, `department`, `term`, …) never change; only display labels vary per `institution.type` and optional tenant overrides.

## Presets (`packages/shared-types/src/nomenclature.ts`)

| Type | gradeLevel | department | subject | term | teacher |
|------|------------|------------|---------|------|---------|
| school | Grade | Department | Subject | Term | Teacher |
| college | Year | Programme | Course | Semester | Lecturer |
| university | Year | Faculty | Course | Semester | Lecturer |
| training_center | Level | Department | Module | Session | Trainer |

## Resolution

1. `NOMENCLATURE_PRESETS[institution.type]` — base map
2. Stored overrides (`institution_settings`, category `nomenclature`, key `overrides`, JSON)
3. `resolveNomenclature(type, overrides)` — merged result

Portal clients read `GET /portal/settings/effective` → `{ values, nomenclature, nomenclatureOverrides }`.

Institution-web uses `useTerm()` (`apps/institution-web/src/lib/term.ts`): `t(key)` singular, `tp(key)` plural.

Overrides are edited in **Settings → Nomenclature** (`POST /portal/settings/nomenclature`).

## Academic terms (periods)

Table `academic_terms`: sub-periods within an academic year (Term 1 / Semester 1). CRUD at `/portal/academics/academic-terms`. Nullable `term_id` on `exams`, `fee_structures`, `timetable_slots` (additive; `term_label` retained).

## Programme structure (college / university / training center)

Table `department_grade_levels` links a **Programme** (`departments`) to reusable **Year/Level** labels (`grade_levels`). Semesters (`academic_terms.programme_level_id`) and sections (`classes.programme_level_id` + `term_id`) hang under that link.

- CRUD: `/portal/academics/department-grade-levels`
- Tree: `GET /portal/academics/programme-structure`
- UI: **Programme Structure** nav item (hidden for `school` tenants)
- Nomenclature key: `programmeStructure` (school preset: "Class Structure"; college/university: "Programme Structure")
- Server guard: creating a term/class with a `(department, grade_level)` pair requires a matching `department_grade_levels` row

Migration `0044_programme_levels` also adds RLS for `academic_terms` (omitted in 0043).

## Onboarding

Departments are **optional** (`required: 0`). Go-live requires academic years, subjects, students, teachers, and staff only.

## Verification

```bash
pnpm --filter @edrion/database migrate
bash scripts/nomenclature-smoke.sh
bash scripts/programme-structure-smoke.sh
```
