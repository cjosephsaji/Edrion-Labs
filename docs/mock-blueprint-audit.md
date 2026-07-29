# Mock Exams — Blueprint / Bank Audit (PLAN-MOCK-EXAMS D1 / Part A §1.1)

Verdicts against live schema in `packages/database/src/schema/student-knowledge.ts`.
**Zero new blueprint / pattern / bank / attempt / mistakes tables.**

| Target capability | Substrate | Verdict |
|---|---|---|
| Named pattern presets | `exam_paper_patterns` | **REUSE** — system pack seed extends rows (D2) |
| sections[] counts/marks/types | `exam_blueprints.blueprint` JSON | **REUSE + extend** section fields |
| Negative marking | absent | **ADD** `negative` on section JSON |
| Optionality (any N of M) | absent | **ADD** `optionality` on section JSON |
| Per-section timing | absent (global `durationMin` only) | **ADD** `sectionTimeSec` on section |
| Interface skin | absent | **ADD** column `skin` |
| Grading style | absent on blueprints | **ADD** column `grading_style` |
| Origin (sys/inst/student) | dual-owner columns | **REUSE derive** — no `origin` column |
| Blueprint version | `exam_blueprints.version` | **REUSE** (optimistic + structural) |
| Publish flag | absent | **ADD** `is_published`, `archived_at` |
| Exam profile hook | no `exam_profiles` table | **ADD** `exam_profile_key` text (no FK) |
| Mock snapshot | absent | **ADD** `blueprint_snapshot` + `blueprint_version` on `mock_exams` |
| Attempt results cache | `mock_exam_attempts.results` | **REUSE** as versioned results cache |
| Answer evaluation | `mock_exam_answers.evaluation` | **REUSE** + extend self/ai/final_source |
| Question bank gate | absent | **ADD** `review_status`, `source`, `institution_id`, tags |
| Exposure | `question_exposure` | **REUSE** |
| Past mistakes | no mistakes table | **Projection** over `evaluation` — no shadow table |
| Teacher exams / gradebook | `exams`, `exam_*` | **UNTOUCHED** |

## Marks unit

Existing `marksPerQuestion` / `marks` are integer marks (not centimarks). Match existing unit.

## Migration

`0100_mock_exam_extensions.sql` (0098/0099 already Documents / mark batches).
