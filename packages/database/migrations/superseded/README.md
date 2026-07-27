# Superseded migrations

Migration files that were written but **never entered `meta/_journal.json`**, and which can no longer be
applied because a later migration removed the objects they depend on. They are kept for history and moved
out of `migrations/` so they stop reading as unapplied schema drift.

Drizzle drives entirely off `meta/_journal.json`, so nothing here is or ever was applied.

| file | why it is dead |
|---|---|
| `0082_timetable_period_backfill.sql` | Backfills `timetable_slots.period_id` from `bell_schedules` / `bell_periods` / `bell_period_types`. Migration `0083_strip_bell_schedules.sql` drops **every** object it touches — the `period_id` column (`0083:11`) and all three tables (`0083:42,44,46`). Applying it today would fail outright. Its absence from the journal is correct, not an error. |
