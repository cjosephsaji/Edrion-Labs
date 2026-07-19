# Programme Structure — plan

**Status:** proposed
**Owner:** —
**Touches:** `packages/database/src/schema/academics.ts`, `packages/schemas/src/academics.ts`, `packages/shared-types/src/nomenclature.ts`, `apps/api/src/modules/portal/academics.*`, `apps/api/src/modules/portal/onboarding.*`, `apps/institution-web/src/app/(app)/onboarding`, `apps/institution-web/src/app/(app)/academics`

---

## 1. The problem

An institution cannot tell Edrion how its courses are shaped. MBBS runs 4.5 years on an **annual** system with irregular phase lengths and a 12-month internship. B.Tech runs **8 semesters**. An integrated 5-year MSc runs **10 semesters**. A 6-month skill course has no terms at all. Today every one of these is expressed by an admin hand-typing rows into a wizard, one at a time, with dates, before they have any idea what the finished structure looks like.

### 1.1 Four concrete modelling holes

**A. The programme has no shape.**
`departments` ([academics.ts:45](../packages/database/src/schema/academics.ts#L45)) is the programme (nomenclature maps `department → Programme` for college, `→ Faculty` for university). It stores `name`, `code`, `headUserId`, `description`. It does **not** store how long the programme runs or how it is divided. Nothing downstream can generate, validate, or preview a structure, because there is nothing to generate *from*.

**B. Term slots are not data.**
`programme_subjects.semesterSequence` ([academics.ts:172](../packages/database/src/schema/academics.ts#L172)) is a bare integer, documented as "an abstract slot: 1, 2, …". The UI renders it as a hardcoded 1–12 dropdown (`SEMESTER_OPTIONS`, [onboarding/page.tsx:73](../apps/institution-web/src/app/(app)/onboarding/page.tsx#L73)). So "this programme has 10 semesters" is never declared anywhere — the admin simply knows it, and types numbers. Nothing can say slot 11 is invalid for a 6-semester BSc, and nothing can render "the semesters of this programme" without guessing.

**C. `academic_terms` conflates template with instance.**
The table ([academics.ts:268](../packages/database/src/schema/academics.ts#L268)) carries both:
- *template* fields: `kind`, `sequence`, `programmeLevelId`
- *instance* fields: `academicYearId`, `startDate`, `endDate`, `isCurrent`, `status`

A template is reusable across every intake; an instance belongs to exactly one dated academic year. Because they share one table, expressing "MBBS has a Semester 3" requires inventing a **dated** row, and re-inventing it for every intake. Meanwhile the curriculum (`programme_subjects`) keys on the abstract int, so template and instance never actually join. The schema comment at [academics.ts:146-153](../packages/database/src/schema/academics.ts#L146-L153) already names this tension — it just resolves it with an int instead of a table.

**D. `grade_levels` is institution-wide but used per-programme.**
Onboarding creates a **fresh** `grade_levels` row per programme year, then links it ([onboarding.ts:68](../apps/institution-web/src/lib/onboarding.ts#L68)). Five programmes with four years each produce twenty rows, four of them named "Year 1". This is not hypothetical damage: migration `0069_fee_structure_slot.sql` had to add `grade_level_number` + `term_sequence` **integer** columns to `fee_structures` precisely because "in a university each department owns its own Year 1 row, so pointing at one bills exactly one department". The id was useless; only the number crossed departments. That migration is the disease presenting a symptom.

**E. (corollary) Nomenclature is institution-wide.**
`NOMENCLATURE_PRESETS` ([nomenclature.ts:97](../packages/shared-types/src/nomenclature.ts#L97)) resolves `term → "Semester"` for a college. An institution running MBBS (annual) **and** B.Tech (semester) can only label one of them correctly. The term label belongs to the programme, not the tenant.

### 1.2 What the admin experiences

The onboarding wizard's step list ([onboarding.service.ts:11](../apps/api/src/modules/portal/onboarding.service.ts#L11)) is:

```
academicYears → departments → programmeLevels → academicTerms → subjects → students → staff
```

Steps 3 and 4 ask the admin to hand-build a matrix, row by row, entering a `sequence` integer and start/end **dates** for every single semester of every single year of every single programme — before ever seeing the shape they are building. A 5-year integrated programme is 10 term rows. Five programmes is 40+ rows of manual data entry, each one a form submit. This is the "confusing" the whole plan exists to kill.

---

## 2. The model

One new concept — **programme structure** — and a clean split between **template** (undated, reusable, owned by the programme) and **instance** (dated, owned by an academic year).

```
departments  (= Programme: MBBS, B.Tech CSE, Grade School)
│   + termSystem, durationMonths, termsPerYear
│
└── department_grade_levels  (= Programme Year: "MBBS Year 1")   [exists — now generated]
    │
    └── programme_term_slots  ★NEW★  (= "Semester 3", "First Professional")
        │   undated. absoluteSequence 1..N across the whole programme.
        │   durationMonths nullable → irregular phases.
        │
        ├── programme_subjects.slotId   → the curriculum lives in a slot
        └── academic_terms.slotId       → the DATED instance of that slot,
                                          for one academic year / intake
```

### 2.1 `departments` — new columns

| column | type | meaning |
|---|---|---|
| `term_system` | text | `annual` \| `semester` \| `trimester` \| `quarter` \| `modular` \| `custom` |
| `duration_months` | integer, nullable | 66 for MBBS, 48 for B.Tech, 6 for a skill course. Null = open-ended (PhD). |
| `terms_per_year` | integer | derived from `term_system` (annual 1, semester 2, trimester 3, quarter 4, modular 0); free for `custom` |
| `structure_locked` | boolean | true once students are enrolled against its slots; blocks destructive regeneration |

Months, not years — 4.5-year MBBS is not representable in an integer year count, and every other programme divides cleanly.

### 2.2 `programme_term_slots` — new table

```
id
institution_id            (tenant convention)
campus_id                 (nullable, per convention)
department_id             (denormalised for cheap filtering, kept in sync — mirrors programme_subjects)
programme_level_id        → department_grade_levels, cascade
sequence_in_year          1, 2      (position within the year)
absolute_sequence         1..N      (position across the whole programme — "Semester 7")
name                      "Semester 3" | "First Professional" | "Internship"
kind                      term | semester | trimester | quarter | phase | module
duration_months           integer, nullable — null = even split of the year
is_terminal               boolean — internship / project / capstone; excluded from normal term maths
version, actorColumns, timestamps

unique (programme_level_id, sequence_in_year)
unique (department_id, absolute_sequence)
index  (institution_id), (institution_id, campus_id), (department_id)
```

`absolute_sequence` is what makes "10 semesters" a first-class fact. It is the handle that fee structures, exam schedules, and reports want, and it is stable across departments in a way `grade_levels.level` never was.

### 2.3 `programme_subjects` — one new column

`slot_id → programme_term_slots` (nullable during migration, then the truth). `semester_sequence` stays as a backfilled denormalisation so existing queries and the `programme_subjects_slot_uniq` index keep working; the service writes both.

### 2.4 `academic_terms` — one new column, changed role

`slot_id → programme_term_slots` (nullable). The row becomes purely an **instance**: "MBBS Year 1 / Semester 1, as scheduled for the 2026–27 academic year, running 2026-07-01 → 2026-12-15". `kind` and `sequence` remain, backfilled from the slot, so nothing downstream breaks.

Creating dated terms is now a **scheduling** action, not a modelling one, and it happens after go-live (§4.4).

### 2.5 Schools: the auto "General" programme

Schools get one programme, auto-created and named after the institution, `term_system = 'term'`, `terms_per_year = 3`, and their grade levels become its programme levels. **Every institution type then has exactly one code path.** No `if (school) ... else ...` in curriculum, classes, terms, fees, or exams. The programme is hidden in the school UI — nomenclature already maps `programmeStructure → "Class Structure"` for schools, so the builder reads as "set up your grades and terms" without ever saying the word "programme".

---

## 3. Coverage — every course type, verified against the model

| Programme | `term_system` | `duration_months` | Generated structure |
|---|---|---|---|
| School K–12 | `term` | — (per grade) | Grades 1–12, each × 3 term slots |
| MBBS | `annual` | 66 | 4 professional years (12/12/12/18 mo) + 12-mo internship slot (`is_terminal`) |
| BDS | `annual` | 60 | 4 years + 12-mo internship |
| B.Tech / BE | `semester` | 48 | 4 years × 2 = **8 slots** |
| BSc / BA / BCom | `semester` | 36 | 3 × 2 = **6 slots** |
| Integrated MSc / 5-yr LLB / B.Arch | `semester` | 60 | 5 × 2 = **10 slots** |
| Diploma / Polytechnic | `semester` | 36 | 6 slots |
| Annual-system degree (many state universities) | `annual` | 36 | 3 slots, one per year |
| B-school / trimester MBA | `trimester` | 24 | 2 × 3 = 6 slots |
| Skill course / training batch | `modular` | 6 | 1 level, 1 slot, no year grid |
| PhD | `modular` | null | no levels, no slots |
| Anything else | `custom` | any | admin builds the grid by hand |

**Irregular durations are why slots are a table, not a formula.** MBBS Phase III part 2 is 18 months. No `years × termsPerYear` expression produces that, and any model that tries will lie to every medical college in the country. A row with a nullable `duration_months` tells the truth and costs one column.

---

## 4. The build

### 4.1 Migration — `0070_programme_structure.sql`

1. `ALTER TABLE departments` — add `term_system` (default `'term'`), `duration_months`, `terms_per_year` (default 3), `structure_locked` (default false).
2. `CREATE TABLE programme_term_slots` per §2.2, with the tenant index convention.
3. `ALTER TABLE programme_subjects ADD COLUMN slot_id` (nullable, FK, `ON DELETE SET NULL`).
4. `ALTER TABLE academic_terms ADD COLUMN slot_id` (nullable, FK, `ON DELETE SET NULL`).
5. **Backfill**, per institution:
   - For each `department_grade_levels` row, synthesise slots from the distinct `academic_terms.sequence` values that already point at that `programme_level_id`; if none exist, synthesise a single slot from `programme_subjects.semester_sequence`; if neither, one slot.
   - Set `academic_terms.slot_id` by matching `(programme_level_id, sequence)`.
   - Set `programme_subjects.slot_id` by matching `(programme_level_id, semester_sequence)`.
   - Infer `departments.term_system` from the modal `academic_terms.kind` of its terms; default `'term'`.
   - Set `terms_per_year` = max `sequence_in_year` observed; default per system.
6. **Schools**: create the auto-`General` programme, attach orphan `grade_levels` (those with `department_id IS NULL`) to it via `department_grade_levels`.

Backfill is idempotent and runs inside the migration. No data loss: every existing column keeps working, every new column is additive.

### 4.2 Generator — shared, pure, no I/O

One function, in `packages/shared-types` (or a new `packages/programme-structure`), imported by **both** the API and `institution-web` so the preview the admin sees is byte-identical to what gets written:

```ts
generateStructure(input: {
  termSystem: TermSystem;
  durationMonths: number | null;
  termsPerYear?: number;
  overrides?: SlotOverride[];   // rename, re-duration, add, remove
}): { levels: PlannedLevel[]; slots: PlannedSlot[]; totals: { years: number; slots: number } }
```

Pure, unit-testable, and the single place where "4.5 years annual = 4 phases + internship" is encoded. Presets (`MBBS`, `B.Tech`, …) are just named argument bundles that seed the form — **they are a starting point, never a silent default**; nothing is written until the admin sees the grid and presses create.

### 4.3 API

| method | route | purpose |
|---|---|---|
| `POST` | `/portal/academics/programmes/:id/structure/preview` | pure — runs the generator, writes nothing, returns the grid for the UI |
| `POST` | `/portal/academics/programmes/:id/structure` | commits levels + slots in **one transaction** |
| `GET` | `/portal/academics/programmes/:id/structure` | current structure (levels + slots + subject counts per slot) |
| `PATCH` | `/portal/academics/programmes/:id/structure` | edit an existing structure; refuses destructive changes when `structure_locked` |
| `POST` | `/portal/academics/academic-years/:id/schedule` | §4.4 — materialise dated `academic_terms` from slots |

Schemas go in `packages/schemas/src/academics.ts` alongside the existing ones and validate both sides, per the file's stated contract.

### 4.4 Dates leave onboarding

Slots are undated. Once an academic year exists, **one action** — "Schedule 2026–27" — splits the year's date range across each programme's slots (respecting `duration_months` where set) and creates the dated `academic_terms` rows, all editable afterwards. It runs post-go-live, from the Academics module, not from the wizard.

This alone removes ~40 date pickers from a five-programme onboarding.

### 4.5 Onboarding rework

Steps ([onboarding.service.ts:11](../apps/api/src/modules/portal/onboarding.service.ts#L11)) go from seven to five:

```
before:  academicYears → departments → programmeLevels → academicTerms → subjects → students → staff
after:   academicYears → programmes(builder) → curriculum → students → staff
```

`programmeLevels` and `academicTerms` disappear as steps — both are now **output** of the builder. `OnboardingSignals` swaps its `programmeLevels` / `academicTerms` counts for a single `programmeStructures` count (programmes with ≥1 slot).

**The builder step:**

```
1. Name it            MBBS
2. How is it split?   [ Yearly ] [ Semesters ] [ Trimesters ] [ Quarters ] [ No fixed terms ] [ Custom ]
3. How long?          [ 4.5 ]  [ years ▾ ]
4. LIVE PREVIEW — rendered before anything is written:

   ┌──────────────────────────────────────────────────────────┐
   │  Year 1   ├─ Semester 1                    ✎  [12 mo]    │
   │           └─ Semester 2                    ✎  [12 mo]    │
   │  Year 2   ├─ Semester 3                    ✎             │
   │           └─ Semester 4                    ✎             │
   │  …                                                        │
   │                          + Add year    + Add slot    🗑    │
   ├──────────────────────────────────────────────────────────┤
   │  10 semesters over 5 years        [ Create structure ]    │
   └──────────────────────────────────────────────────────────┘
```

Every cell is editable — rename a slot ("First Professional"), change a duration, add a slot, delete one, add a year. The preset chooses the *starting grid*; the admin owns the final one. Commit writes levels + slots in one transaction.

**The curriculum step** becomes a grid, not a form: pick a programme, see its slots as columns, add subjects into slots. Multi-add and paste supported. No `semesterSequence` integer is ever typed, because the slots are real rows now.

### 4.6 Per-programme nomenclature

`term` label resolves from `departments.term_system` first (`semester → "Semester"`, `annual → "Year"`, `modular → "Module"`), falling back to the institution nomenclature ([nomenclature.ts:105](../packages/shared-types/src/nomenclature.ts#L105)) when no programme is in scope. `resolveNomenclature` grows an optional `programme` argument; every existing call site keeps working unchanged.

---

## 5. Order of work

1. `0070_programme_structure.sql` + drizzle schema + backfill. **Ship alone, verify backfill on a copy of prod.**
2. `generateStructure` + unit tests covering every row of the §3 table.
3. Preview / commit / get / patch endpoints + zod schemas.
4. Onboarding step-list change (API) — `programmeStructures` signal.
5. Programme Builder UI + live preview grid.
6. Curriculum grid UI.
7. `POST /academic-years/:id/schedule` + the Academics scheduling screen.
8. Per-programme nomenclature.
9. Follow-up (separate PR): migrate `fee_structures.grade_level_number` / `term_sequence` onto `slot_id` + `absolute_sequence`, retiring the `0069` workaround.

Steps 1–3 are backend-only and additive: they can land without touching a single screen.

## 6. Risks

- **Backfill on messy tenants.** Institutions that half-completed onboarding will have programme levels with no terms. The backfill synthesises a single slot for those — safe, and the builder lets them redo the structure afterwards.
- **`structure_locked`.** Regenerating a structure under live students would orphan curriculum and enrolments. Once a slot has enrolled students, destructive edits (delete slot, reduce years) are refused; renames and additions stay allowed.
- **Two sources of truth during migration.** `semester_sequence` and `slot_id` coexist. The service writes both; a later PR drops the int once every read path is on `slot_id`.
