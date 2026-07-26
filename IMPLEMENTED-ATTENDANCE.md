# IMPLEMENTED — Attendance + Forecaster

## Phases delivered (complete)

All seven phases from PLAN-ATTENDANCE.md are implemented.

### Phase 1 — Migration `0090_attendance_forecaster`
- `attendance_records.provenance` jsonb + six-value `status` CHECK
- `attendance_policies` with `left_early_counts_as` (default `present`, **A1**)
- `attendance_rollups`, `request_marks_pending`
- Policy seed, RLS + grants

### Phase 2 — Forecaster library (`packages/schemas/src/attendance/`)
- `computeRemainingSessions` → `resolveTimetable` (**A6**)
- `computeForecast`, truncation formatter, policy Zod
- Unit tests: AC7, AC9, AC11, AC14 matrix

### Phase 3 — Recompute + zone crossing
- `AttendanceRollupService`, jobs `attendance.recompute` / `attendance.marks_sweep`
- Mark emission in `AttendanceService` (**A2**)
- Zone crossing + `feed_events.event_key` (**A12**)
- Ribbon id `institution:attendance:{subjectId}:{zone}` (**A11**)
- Tests: `attendance-zone.spec.ts`

### Phase 4 — Student read API
- Summary, subject detail, coverage (full slot expansion)
- Gated `student.surface.attendance`

### Phase 5 — Request types
- `od_request`, `attendance_correction`, `leave_attendance`
- Side effect before approval (AC 12), overlap guards (AC 13/16), partial correction (AC 15)
- Tests: `attendance-requests.spec.ts`

### Phase 6 — Institution config UI
- Attendance policy settings page + approvals inbox renderers

### Phase 7 — Student UI + Today + Parent
- Full student attendance UX, `attendance.day_view` flag (`0091`)
- Today repoint (**A10**)
- Parent visibility + once-daily absence alert (AC 20–21)

## Acceptance (§11)

| AC | Status |
|----|--------|
| 1–6 | PASS |
| 7 | PASS-with-deviation |
| 8–25 | PASS |

## Verification

```bash
pnpm --filter @edrion/schemas test
pnpm --filter @edrion/api test -- attendance
```
