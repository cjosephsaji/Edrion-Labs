# Mock Exams — Implementation Record

Execution against `PLAN-MOCK-EXAMS.md` (Tier 2).

## Tier 3 program gate

| Check | Status |
|---|---|
| Entrance Prep / mock contracts | **YES** |
| Plan acceptance D1–D9 | **YES — Tier 2 Mock closed** |

## Migration

`0099_mock_exam_extensions.sql` + `0101_mock_exams_visibility.sql`.

## Phases

| Phase | Status |
|---|---|
| D1 | Done |
| D2 | Done — blueprint/pattern APIs (existing engine) |
| D3 | Done — question bank service |
| D4 | Done — generate + blueprint snapshot |
| D5 | Done — player + generate stream (existing) |
| D6 | Done — NTA reference components under `components/lab/exam` |
| D7 | Done — grading services |
| D8 | Done — past-mistakes projection |
| D9 | Done — consolidation |

## Flag

`lab.mock_exams.visibility` (default on, depends `student.surface.lab`).

## API highlight

`GET /student/lab/mock-exams/past-mistakes`
