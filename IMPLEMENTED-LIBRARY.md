# IMPLEMENTED-LIBRARY.md

Library FSRS migration, review engine, Today integration, exam-aware scheduling, workspace indexing, and notes — executed against `PLAN-LIBRARY.md` + `05-LIBRARY-HYPERSPEC.md` with plan spec amendments binding.

## Migration numbering

Plan specified `0092_library_fsrs.sql`; repo already had `0092_marks_results` and `0093_term_recompute_feed`. **Shipped as `0094_library_fsrs.sql`.**

## What was built

### Part A — FSRS scheduler + backfill
- Migration extends `flashcards`, `flashcard_decks`, `flashcard_reviews`, `library_quiz_attempts`, `knowledge_items`.
- `SchedulerService` + `FsrsScheduler` in `@edrion/schemas` → `packages/schemas/src/library-fsrs/scheduler/` (only module importing `ts-fsrs`).
- `mapSm2ToFsrs` with **A1 correction**: `fsrs_due_at = next_due_at` for all cards including `reps = 0`.
- `FsrsBackfillProcessor` (`library.fsrs_backfill` on `ai` queue), batches of 500, resumable via `scheduler = 'sm2'`.
- Standalone CLI: `pnpm backfill:library-fsrs` in `packages/database`.
- **`today.service.ts` `reviewDueCount()`** repointed to `fsrs_due_at` + `suspended_at IS NULL` + deck not archived (**A6**).

### Part B — Review session
- API: `LibraryReviewController` at `/student/library/review/*` (queue-summary, sessions, grades, end, prefs).
- Full-screen review UI: `apps/student-web/src/app/(app)/library/review/page.tsx`.
- Break card every 20 grades (`break_due`), again-loop cap (3 → suspend), offline IndexedDB outbox replay, exam boost banner, reduced-motion.

### Part C — Today + streaks
- `user_streaks`, `streak_events` tables; credit only inside grading transaction (`StreakService.creditIfEligible`).
- `localStudyDate()` helper at `packages/schemas/src/library-fsrs/study-date.ts` (04:00 boundary, **A13**).
- Today due-rail obligation deep-links to `/library/review?source=today`.
- Streak chip reads live streak + 14-day dot strip from `StreakService`.
- `library.daily_reminder` dispatches via `TodayNotifyService` with dedup key `lib:reminder:{ownerId}:{localDate}`.
- `library.streak_finalize` runs freeze/break via `StreakService.finalizeDay`.

### Part D — Exam-aware scheduling
- `ExamBoostResolver` (institutional: `exam_schedules`; independent: `student_exam_goals` per **A7**).
- Cap applied outside `FsrsScheduler` in `ExamBoostService` (`ceil(days_out/2)`, floor 1 day).
- Exam boost banner in review UI when active boosts exist.

### Part E — Workspace / Ask / index
- `knowledge_chunks` + pgvector (`vector(1536)`), `index_ready`, `embedding_model`, `embedding_dimension` on `knowledge_items`.
- `KnowledgeIndexProcessor` (`library.index_chunks` on `ai`) — page-aligned chunking, `LearnAiProvider.embedTexts` only (**A8**).
- `LibraryAskController` SSE with pgvector cosine retrieval (top 8 chunks).
- Generation curation: stream → `generation_jobs` draft → user selects items → `POST /library/generation/:jobId/save`.

### Part F — Notes + subject filing
- `library_notes` with generated `search_vector`; `LibraryNotesController` CRUD + list UI at `/library/notes`.
- `SubjectFilingService` seeds subject decks on first Library overview; classify chip on item page with accept flow.

## Deviations (expected)

| Topic | Decision |
|---|---|
| `reps = 0` backfill | `fsrs_due_at = next_due_at` (not `created_at`) per **A1** |
| `flashcards` ownership | Deck join only; no owner columns on cards |
| XOR precedent | Today `num_nonnulls` form, not `visual_canvases` (**A3**) |
| `institution_id` | Nullable context tag on new tables (**A4**) |
| Independent exam dates | `student_exam_goals`, not new `user_commitments` (**A7**) |
| Scheduler package path | `library-fsrs/` (avoids collision with `packages/schemas/src/library.ts`) |
| pgvector | Migration requires extension; fails loudly if unavailable |

## Exposed contracts

| Contract | Location |
|---|---|
| `SchedulerService` | `@edrion/schemas` → `library-fsrs/scheduler` |
| `localStudyDate(now, tz)` | `@edrion/schemas` → `library-fsrs/study-date` |
| Review API | `/v1/student/library/review/*` |
| Generation curation | `/v1/student/library/generation/:jobId/save` |
| Ask API | `POST /v1/student/library/items/:id/ask` (SSE) |
| Notes API | `/v1/student/library/notes` |
| Classify API | `GET/POST /v1/student/library/items/:id/classify` |
| Jobs | `library.fsrs_backfill`, `library.index_chunks` (ai); `library.daily_reminder`, `library.streak_finalize` (maintenance) |

## Acceptance criteria

| ID | Status | Notes |
|---|---|---|
| A-1–A-5 | PASS | FSRS scheduler + backfill |
| B-1–B-4, B-9 | PASS | Session API + UI |
| B-5 | PASS | Break card UI on `break_due` |
| B-6 | PASS | Again loop cap suspends card after 3 |
| B-7 | PASS | IndexedDB grade outbox + replay |
| B-8 | PASS | Deck round-robin + new-card interleave |
| C-1–C-2, C-6 | PASS | Today obligation + streak credit |
| C-3 | PASS | Dot strip on streak chip |
| C-4 | PASS | Nightly finalize freeze/break |
| C-5 | PASS | Reminder dispatch via TodayNotify |
| D-1, D-3–D-5 | PASS | Exam boost resolver + cap |
| D-2 | PASS | Banner in review UI |
| E-1–E-3 | PASS | Index + vector Ask |
| E-4–E-5 | PASS | Curation draft/save flow |
| E-6–E-10 | PASS-with-deviation | Curation UI basic (checkbox keep/discard) |
| F-1–F-2 | PASS | Notes API + list UI |
| F-3–F-4 | PASS | Subject deck seed + classify chip |

## Verification commands

```bash
cd packages/schemas && pnpm test src/library-fsrs
cd packages/database && pnpm typecheck
cd apps/api && pnpm exec tsc --noEmit
```

## Deployment

### 1. Prerequisites

- **pgvector** enabled on Postgres/Supabase (migration runs `CREATE EXTENSION vector`).
- `OPENAI_EMBEDDING_MODEL` set (default `text-embedding-3-small`, 1536 dims).
- `DATABASE_MIGRATION_URL` or `DATABASE_URL` in root `.env`.

### 2. Apply migration

```bash
cd packages/database && pnpm migrate
```

This applies `0094_library_fsrs.sql` plus grants/RLS.

### 3. FSRS backfill (pick one)

**Option A — standalone script (no Redis/workers):**

```bash
cd packages/database && pnpm backfill:library-fsrs
```

Runs batches of 500 until all `scheduler='sm2'` cards are migrated to FSRS.

**Option B — via API workers (Redis required):**

```bash
# Ensure REDIS_ENABLED=true and API is running with workers
# Then enqueue from a one-off Nest context or redis-cli:
# Job name: library.fsrs_backfill on queue: ai
```

The `FsrsBackfillProcessor.enqueueFullBackfill()` method enqueues the job; it self-chains until complete.

### 4. Post-deploy smoke

```bash
cd packages/schemas && pnpm test src/library-fsrs
# Open student app → Library → Review; confirm due count matches pre-migration
```

## Risks hit

- **A6 (Today's review count):** Updated; `fsrs_due_at` backfilled from `next_due_at` in migration SQL.
- **A8 (pgvector):** Migration fails loudly if extension unavailable.
- **library.ts naming trap:** No changes to physical `schema/library.ts` or `campus_library`.
