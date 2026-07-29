# PLAN — Library: FSRS Migration, Review Engine, Workspace (Tier 1)

**Companion hyperspec:** `05-LIBRARY-HYPERSPEC.md`. Read both. This plan sequences and corrects the
hyperspec; the hyperspec carries the behavioral detail. Where they conflict, **this plan wins**,
because it is reconciled against the live repo.

**Build order:** parallel-safe with Timetable/Attendance/Marks — it shares no domain tables with
them. Its **one** hard coupling is Today's review-due query (see A6), which must be updated in the
same PR as Part A.

---

## 1. Feature summary & why it exists

Students already upload documents and generate flashcards, but the scheduler is a naive SM-2, there
is no review session UI, no streaks, and no way to ask questions of a document. This feature (a)
migrates spaced repetition from SM-2 to **FSRS** behind a swappable interface, (b) builds the
full-screen **review session**, (c) wires the daily queue into Today with server-credited streaks,
(d) adds exam-aware interval capping, (e) builds the **document workspace** with retrieval-grounded
"Ask this document" and a curation pass over all AI generation, and (f) adds minimal notes.

**Naming trap, read this first:** `packages/database/src/schema/library.ts` is the **physical book
library** (`library_books`, `library_loans`) and `student.surface.campus_library` is its student
surface. **Nothing in this plan touches it.** The personal learning library lives in
`packages/database/src/schema/student-knowledge.ts` and is surfaced at `student.surface.library`.

---

## 2. Spec Amendments

### A1 — `flashcards` has no owner, no timestamps, no version — **binding, affects everything**
`packages/database/src/schema/student-knowledge.ts:149`. The **entire** table is:

```
id, deck_id (NOT NULL → flashcard_decks, cascade), sequence (NOT NULL),
prompt, answer, next_due_at timestamptz NOT NULL DEFAULT now(),
interval_days numeric(6,2) NOT NULL DEFAULT '0', ease numeric(4,2) NOT NULL DEFAULT '2.50',
reps int NOT NULL DEFAULT 0, lapses int NOT NULL DEFAULT 0, source_page int
```
with unique `flashcards_deck_seq_uq (deck_id, sequence)`.

**There is no `student_id`, no `independent_user_id`, no `institution_id`, no `created_at`, no
`updated_at`, no `version`, no `suspended_at`, no `source_ref`.** Ownership is derived **only** by
joining `flashcard_decks` (which does carry the owner pair) — exactly as Today already does at
`apps/api/src/modules/student/today/today.service.ts:185`.

**Do this:**
- Every owner-predicate query on cards **must** `innerJoin(flashcardDecks)`. Do not add owner columns
  to `flashcards` — that would create two sources of ownership truth.
- §1.2's backfill rule "`reps = 0` → `fsrs_due_at = created_at`" is **not implementable**: there is no
  `created_at`. **Use `fsrs_due_at = next_due_at`** for `reps = 0` as well (it defaults to `now()` at
  insert, so it is already "due immediately" and it preserves F2's continuity guarantee uniformly).
- Add `created_at`/`updated_at` to `flashcards` in the same migration (harmless, useful for the
  new-card "oldest first" ordering in §2.1, which otherwise has only `sequence` to sort by).
  Backfill both to `next_due_at`.
- Add `suspended_at`, `srs_state`, `stability`, `difficulty`, `fsrs_due_at`, `last_review_at`,
  `scheduler`, `fsrs_params_version` per §1.1.
- §2.1's new-card budget ordering becomes: `srs_state='new'` ordered by `(created_at, deck_id, sequence)`.

### A2 — `flashcard_reviews` shape differs from the spec's assumptions
`student-knowledge.ts:195`: `id, card_id (NOT NULL cascade), student_id NULL, independent_user_id
NULL, result text NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT now()`. **No `created_at`, no
`grade`, no state columns, no `client_review_id`.**

**Do this:**
- §1.2's "`last_review_at` = latest `flashcard_reviews.created_at`" → use **`reviewed_at`**.
- Add all §1.1 columns (`grade`, `state_before`, `state_after`, `due_before`, `due_after`,
  `elapsed_ms`, `session_id`, `client_review_id`) as **nullable**; historical rows keep `result` only.
- The idempotency unique index is specified on "(owner-pair, `client_review_id`)". Since owner is
  nullable-either, implement as **two partial unique indexes** (one per owner column where non-null),
  matching the pattern Today uses at `today.py`→`schema/today.ts:53-54`. Do **not** rely on a single
  composite index over two nullable columns.
- Keep writing `result` alongside `grade` so existing readers do not break.

### A3 — Owner XOR checks do **not** follow `visual_canvases`
The hyperspec's constraint 2 says to copy "the XOR CHECK constraint in the form `visual_canvases`
uses". **`visual_canvases` has no owner XOR check.** Its checks are `visual_canvases_subject_ck`,
`_archetype_ck`, `_origin_ck` — domain enums (`packages/database/src/schema/visual-studio.ts:56-67`).
A repo-wide grep for `num_nonnulls` matches **only `packages/database/migrations/0088_today_feed.sql`**.

**Do this:** the real precedent is **Tier 0 Today** (`packages/database/src/schema/today.ts:8-9`):
```ts
const ownerCheck = (s, i) => sql`num_nonnulls(${s}, ${i}) = 1`;
check('<table>_owner_xor', ownerCheck(t.studentId, t.independentUserId))
```
Copy that. **Amend AC E-11** to reference the Today form, not `visual_canvases`.

### A4 — `institution_id` on learning artifacts is the existing convention — **repo wins**
Constraint 2 says "Never `institution_id` on learning artifacts." But `knowledge_items`,
`knowledge_collections`, `knowledge_artifacts`, `flashcard_decks`, and `library_quiz_attempts` **all
carry a nullable `institution_id`**, and so do Today's `user_obligations`/`feed_events` (documented
there as "a nullable institutional-context tag, never owner identity").

**Do this:** new tables carry **nullable `institution_id`** as a context tag plus the owner XOR pair.
This is not a tenancy fork; it matches Tier 0's ratified shape. **Amend AC E-11** accordingly. What
the constraint actually forbids — a **single `user_id`**, or `institution_id` as *owner identity* —
still holds absolutely.

### A5 — `library_quiz_attempts.patterns` is typed `string[]`, not an object — **breaking**
`student-knowledge.ts:185`: `patterns: jsonb('patterns').$type<string[]>().notNull().default([])`.
§6.5's binding write shape is an **object** (`{per_question, per_topic, difficulty,
source_knowledge_item_id}`). Also `artifact_id` is **NOT NULL** → a generated quiz must exist as a
`knowledge_artifacts` row before an attempt can be written.

**Do this:** widen the Drizzle `$type` to the §6.5 object shape (a **type-level** change; the column
is already `jsonb`). Change the default from `[]` to `{}`. **Check for existing readers of
`patterns` before changing the type** — grep `apps/` for `.patterns` on this table; if any reader
assumes an array, update it in the same PR. Record in IMPLEMENTED.md whether legacy array-shaped rows
exist and how readers tolerate both.

### A6 — Today's review-due query reads `next_due_at`; repoint it in the same PR — **binding**
`apps/api/src/modules/student/today/today.service.ts:185` `reviewDueCount()` joins
`flashcards → flashcard_decks` and filters `lte(flashcards.nextDueAt, now)`. Root `IMPLEMENTED.md`
Today reconciliation verdict 4 states: "`flashcards.next_due_at` is authoritative and **one
request-level query feeds both review card and chip**; migration adds the index."

Once FSRS makes `fsrs_due_at` the live due pointer, **that query silently goes stale** — the Today
card and the `review_due_count` chip would show pre-migration numbers forever.

**Do this:** Part A's PR **must** update `reviewDueCount()` to `fsrs_due_at` **and** add
`suspended_at IS NULL` + deck-not-archived, keeping it a single query. Add the index on
`fsrs_due_at`. Do not create a second due query for Today — §3's due-rail card and the chip share
this one, by Tier 0's own contract.

### A7 — Streaks and commitments are entirely net-new (§4.1, §5)
Repo-wide grep: **no `user_streaks`, no `streak_events`, no `user_commitments`.** The nearest
existing things are `student_planner_items` and `student_exam_goals`
(`packages/database/src/schema/institutional-bridge.ts:282,304`) — **read them before building**; if
`student_exam_goals` already carries a self-declared exam date for institutional students, reuse it
for §5's independent-user path rather than creating `user_commitments`.

**Do this:** create `user_streaks` and `streak_events` per §4.1 with the **A3** XOR form. For the
independent exam-date source, prefer `student_exam_goals` if its shape fits; otherwise create
`user_commitments` minimally and record the decision. Do not build both.

### A8 — pgvector is not enabled; the embedding provider **is** available (§6.2)
Repo-wide grep for `vector`/`embedding` in schema files and migrations returns **nothing** — there is
no pgvector column, index, or `CREATE EXTENSION` anywhere.

But the embedding capability the spec assumes **does** exist:
`apps/api/src/modules/student/learn-ai/provider.ts:93` declares
`embedTexts(texts: string[]): Promise<LearnAiEmbeddingResult>`, implemented at
`openai.provider.ts:278` against `env.OPENAI_EMBEDDING_MODEL`, with a `null.provider.ts` fallback.

**Do this:**
- **Reuse `LearnAiProvider.embedTexts`.** Do not instantiate a second embedding client or model.
- The migration must `CREATE EXTENSION IF NOT EXISTS vector;`. **This requires the extension to be
  available on the Supabase instance and may require elevated privileges** — flag it as a deployment
  prerequisite in IMPLEMENTED.md and in the overview's human-decision list.
- Set `knowledge_chunks.embedding vector(N)` where **N is read from the configured model**, not
  hard-coded. Store the model id and dimension on `knowledge_items` (or a small config row) so a
  model change is detectable rather than silently corrupting similarity.
- **Fallback path if pgvector cannot be enabled:** ship Part E's workspace, reader, curation pass and
  generators (which need no vectors), and gate **only** Ask-this-document behind `index_ready`, which
  simply never flips. The UI copy for that state already exists in §6.1. Do not substitute a
  keyword-search implementation and call it Ask-this-document.

### A9 — `knowledge_items` real column set (§6.1/§6.2)
`student-knowledge.ts:41`. Present: `extracted_text_ready`, `pages_done`, `page_count`, `status`
(`queued|reading|needs_ocr_confirm|ready|error`), `ingest_stage`
(`claimed|loading_files|extracting|ocr|writing_pages|finalizing`), `ingest_heartbeat_at`,
`ingest_attempts`, `ingest_error_detail`, `object_ids jsonb`, `origin jsonb`, `ai_read`, `version`.
`knowledge_item_pages` has `ocr_confidence numeric(4,3)`, `needs_confirm`, `confirmed_at`, `text`,
`page_index`, unique `(item_id, page_index)`.

**Do this:** append `'index'` to the `ingest_stage` progression **after `finalizing`**, and add
`index_ready boolean NOT NULL DEFAULT false`. There is no `structure`/outline stage in the pipeline —
§6.1's "Outline (from the existing structure stage)" **has no source**. Derive the outline
best-effort from page text headings, or ship the outline slot empty; do not claim a stage exists.

### A10 — Feature flags are `student.surface.*`
`packages/feature-flags/src/student-modules.ts:41` registers
`{ key: 'library', minTier: 'individual', requiresInstitutionModule: null, defaultVisible: true,
individualCapable: true }`.
**Do this:** the gate is **`student.surface.library`** (exists). `library.exam_aware_scheduling`,
`library.daily_reminder`, and `library.mindmap_stub` are **new** definitions — add them the way
Module Visibility seeded its own (migration-seeded, boolean `default_value`).

### A11 — Queues are a closed set; job names only
`apps/api/src/common/queue/queue.constants.ts:7`.
**Do this:** `library.fsrs_backfill` and `library.generate` on **`ai`** (generation is AI work);
`library.index_chunks` on **`ai`**; `library.daily_reminder` and `library.streak_finalize` scheduled
on **`maintenance`**. All via the existing `JobsService`/`QueueWorkers`/`JobTracker`. **No new queue.**

### A12 — Reminder and streak notifications go through Today's dispatch
§3.4's reminder and §2.6's streak payoff must not invent a push sender. `feed_events` unique
`(student_id, event_key)` is the dedupe (`packages/database/src/schema/today.ts:53`), quiet hours are
`today_preferences.held_notification_events` + `quiet_release_at`.
**Do this:** dispatch via `apps/api/src/modules/student/today/today-notify.service.ts` with
`event_key = 'lib:reminder:' || ownerId || ':' || localDate` (§3.4's "dedupe key `owner:date`").
**Note the quiet-hours conflict:** §3.4 says respect Today's 22:30–06:30 window, while
`today_preferences.quiet_hours_override` is per-user — honor the resolved per-user window, not a
hard-coded one.

### A13 — Day boundary 04:00 vs Today's day boundary
§0 fixes the streak/budget/reminder day boundary at **04:00 local**. Today's existing surfaces use
their own (probably midnight) boundary. These will disagree on the 00:00–04:00 window.
**Do this:** implement 04:00 **only** inside the library's streak/budget/reminder logic, in **one**
exported helper (`localStudyDate(now, tz)`), and document the divergence. Do not change Today's
boundary. This is F1 in the hyperspec's review list — see the overview's human-decision list.

### A14 — `packages/ui` has `drawer.tsx`, no `sheet.tsx`
Same as the other plans. Note `apps/student-web/src/components/visual-studio/NodeActionSheet.tsx` and
`learn/AskPetrosDrawer.tsx` are existing in-app sheet/drawer patterns — read them before adding
anything to `packages/ui`.

### A15 — `ts-fsrs` is a new dependency
Not currently in the workspace. Add `ts-fsrs` (v4.x, FSRS-4.5) to the package that hosts
`FsrsScheduler`. Per §1.3 and AC A-4, **no file outside `FsrsScheduler` may import it.** Put the
scheduler in `packages/schemas/src/library/scheduler/` so both API and client can share previews, or
in the API module if the client never needs it — **decide and state which**; previews per §2.3 ship
with the card from the server, so API-only is sufficient and is the safer default.

### A16 — Subject auto-filing depends on single-class enrollment
§8 seeds "one deck per enrolled subject". Enrolled subjects resolve via
`student_enrollments.class_id → class_subject_teachers` (single class only — see the Timetable plan's
A2). Independent users get "My decks". `flashcard_decks` has no `subject_ref` or `archived_at` —
both are new columns (§5, §2.1).

### A17 — `revision_states`, `evidence_tags`, `learn_attempts` all exist
`packages/database/src/schema/learn.ts:156,190,130`. The hyperspec's constraint 1 is accurate here.
Nothing in this plan modifies them; §6.5's note that `library_quiz_attempts` feeds Tier-2
learner-model work is a forward statement only.

---

## 3. Dependencies & contracts

**Reads/writes (existing, this feature owns them):** `flashcards`, `flashcard_decks`,
`flashcard_reviews`, `library_quiz_attempts`, `knowledge_items`, `knowledge_item_pages`,
`knowledge_artifacts`, `knowledge_collections`, `storage_objects`
(`packages/database/src/schema/student.ts:62`).

**Tier 0:** Today (`feed_events`, `today_preferences`, `today-notify.service.ts`, the `review_due_count`
chip and due-rail card — **A6**); Module Visibility (`student.surface.library`, flag catalogue);
`JobsService`/`QueueWorkers`/`JobTracker`; `LearnAiProvider.embedTexts` (**A8**).

**Tier 1:** reads `exam_schedules` (`class_id` + `subject_id` + `exam_date`) for §5's institutional
exam-date resolver — same table Today already queries at `today.service.ts:173`. **No dependency on
Timetable, Attendance, or Marks.**

**Exposes downstream:** `SchedulerService` interface; the `library_quiz_attempts.patterns` object
shape (**A5** — Tier 2's learner model depends on it being fully populated from day one);
`user_streaks`/`streak_events` as the **product-wide** streak substrate (09 §3) — other features
credit streaks through it, never with a parallel counter.

---

## 4. Phases

### Phase 1 — Migration (`0092_library_fsrs`)
**Files:** `packages/database/migrations/0092_library_fsrs.sql`;
`packages/database/src/schema/student-knowledge.ts` (extend); new
`packages/database/src/schema/library-review.ts` (`review_sessions`, `user_streaks`, `streak_events`,
`knowledge_chunks`, `knowledge_item_chats`, `generation_jobs`, `library_notes`, `user_review_prefs`);
`schema/index.ts`; `sql/zzz_rls.sql`, `zzz_grants.sql`.

**Schema:**
- `flashcards`: add `srs_state text` CHECK `in ('new','learning','review','relearning')`,
  `stability real`, `difficulty real`, `fsrs_due_at timestamptz`, `last_review_at timestamptz NULL`,
  `scheduler text NOT NULL DEFAULT 'sm2'`, `suspended_at timestamptz NULL`,
  `fsrs_params_version int NOT NULL DEFAULT 1`, **`created_at`/`updated_at` (A1)**, `source_ref jsonb NULL`.
  Keep every SM-2 column. Index `(fsrs_due_at)` and a partial index for the due predicate (**A6**).
- `flashcard_decks`: add `archived_at timestamptz NULL`, `subject_ref jsonb NULL`,
  `exam_boost_opt_out boolean NOT NULL DEFAULT false`.
- `flashcard_reviews`: add the §1.1 columns as nullable (**A2**) + the two partial unique indexes on
  `client_review_id`.
- `library_quiz_attempts`: widen `patterns` `$type` + default `{}` (**A5**).
- `knowledge_items`: add `index_ready boolean NOT NULL DEFAULT false` (**A9**).
- New tables, all with **nullable `institution_id` + the Today-form owner XOR (A3, A4)**:
  `review_sessions`, `user_streaks`, `streak_events` (append-only, unique `(owner, date)`),
  `knowledge_chunks` (**A8** — `CREATE EXTENSION vector`, dimension from the configured model),
  `knowledge_item_chats`, `generation_jobs`, `library_notes` (+ generated tsvector), `user_review_prefs`.
- Grants: **no UPDATE/DELETE** on `flashcard_reviews` and `streak_events` (§0).

**DoD:** migration applies; `num_nonnulls` XOR rejects both-null and both-set inserts on every new
table; append-only grants proven by refused UPDATEs; `CREATE EXTENSION vector` succeeds **or** the
migration fails loudly with a clear message (never silently skip it).

---

### Phase 2 — FSRS scheduler + backfill (Part A)
**Files:** `packages/schemas/src/library/scheduler/` (interface + `FsrsScheduler`, **A15**),
`apps/api/src/modules/student/library/fsrs-backfill.processor.ts` (**A11**);
**`apps/api/src/modules/student/today/today.service.ts` — repoint `reviewDueCount()` (A6).**

**Behavior:** §1.2's mapping formulas with the **A1** correction for `reps = 0`; §1.3's interface;
batched 500/job, resumable via the `scheduler='sm2'` predicate.

**DoD:** AC A-1 through A-5 verbatim, with A-2 (`fsrs_due_at = next_due_at` for **every** card,
including new ones per A1) asserted by a **global due-count-before-equals-after** test. AC A-3
(kill mid-run, restart, identical final values). **Plus: Today's review count is identical before and
after the backfill** — this is the A6 regression guard and it is mandatory.

---

### Phase 3 — Review session API + UI (Part B)
**Files:** `apps/api/src/modules/student/library/library-review.{module,controller,service}.ts`;
`apps/student-web/src/app/(app)/library/review/`;
`apps/student-web/src/components/library/review/*`.

**Endpoints** (`/v1`, gated `student.surface.library`) per §2.3's table.

**Behavior:** §2 tap-by-tap, §2.1 queue construction and the binding grading transaction order,
§2.2 offline replay.

**DoD:** AC B-1 through B-9 verbatim. B-1 (idempotent double-submit) and B-9 (zero lost grades on
mid-session exit) are the two that must not be waived. B-4's `<500ms` warm first card is measured,
not assumed.

---

### Phase 4 — Today integration + streaks (Part C)
**Files:** `apps/api/src/modules/student/library/streak.service.ts`;
`library-reminder.processor.ts`, `streak-finalize.processor.ts` (**A11**);
Today due-rail card + streak chip wiring (**A12**); the `localStudyDate` helper (**A13**).

**DoD:** AC C-1 through C-6 verbatim. C-2 (a direct API call cannot create a `streak_events` row —
credit happens **only** inside the grading transaction when the queue zeroes) is the security-shaped
one; test it by calling every endpoint and asserting no row appears.

---

### Phase 5 — Exam-aware scheduling (Part D)
**Files:** `apps/api/src/modules/student/library/exam-boost.resolver.ts`; the cap applied **outside**
`FsrsScheduler`, on its output.

**Behavior:** §5. Institutional dates from `exam_schedules` (class + subject + `exam_date`, the same
join Today uses); independent dates per **A7**.

**DoD:** AC D-1 through D-5 verbatim. D-5 (exam dates never written into deck/card rows — cache only)
is the one an executor will get wrong; assert it with a schema-level test.

---

### Phase 6 — Workspace, chunk index, Ask-this-document (Part E)
**Files:** `apps/api/src/modules/student/library/knowledge-index.processor.ts` (**A8, A11**),
`ask.controller.ts` (SSE); `apps/student-web/src/app/(app)/library/items/[id]/`;
`apps/student-web/src/components/library/workspace/*`.

**Behavior:** §6.1 split view and states (**outline per A9**), §6.2 chunking (~400 tokens, 80
overlap, **page-aligned — a chunk never spans pages**), §6.3 retrieval-grounded answering with page
citations, §6.4 the curation pass, §6.5 quizzes with the **A5** write shape.

**DoD:** AC E-1 through E-11, with **E-11 amended per A3/A4** (Today's XOR form; nullable
`institution_id` permitted as a context tag). E-3 (chunks never span pages; every answer either cites
a page or says it couldn't find it; the endpoint never answers from outside the document) and E-4
(**nothing persists before Save**) are the two that define the feature's trust story.
If pgvector is unavailable, ship per **A8**'s fallback and mark E-3 N/A with the reason.

---

### Phase 7 — Notes + subject auto-filing (Part F)
**Files:** `apps/api/src/modules/student/library/notes.controller.ts`;
`apps/student-web/src/app/(app)/library/notes/`.

**Behavior:** §7 (TipTap, three block types, tsvector search, MD export), §8 (**A16** — single-class
subject seeding; the confirmable classify chip, auto-accept after 24h).

**DoD:** AC F-1 through F-4 verbatim; F-3 (re-opening never duplicates seeded decks) needs an
idempotency key or a natural unique constraint, not a "check then insert".

---

## 5. Risks & landmines

1. **Breaking Today's review count (A6).** The single highest-probability silent failure in this
   plan: everything looks fine, and the Today card shows a frozen number forever. *Guard:* the
   before/after equality test in Phase 2's DoD is mandatory and must run against seeded data.
2. **Adding owner columns to `flashcards` (A1).** Creates two ownership truths that will drift.
   *Guard:* a schema test asserting `flashcards` has no `student_id`/`independent_user_id`.
3. **A migration-day due avalanche.** If `fsrs_due_at` is recomputed from mapped stability instead of
   copied from `next_due_at`, every student wakes to hundreds of due cards. *Guard:* AC A-2's global
   due-count equality (this is hyperspec F2, and it is decided — do not "improve" it).
4. **`patterns` type change breaking readers (A5).** *Guard:* grep for readers first; handle both
   shapes if any legacy rows exist.
5. **pgvector assumed available (A8).** *Guard:* the migration fails loudly; the fallback path is
   pre-authorized so the executor does not improvise a keyword search.
6. **A second embedding client (A8).** *Guard:* grep that only `LearnAiProvider` constructs one.
7. **Interval math outside `FsrsScheduler` (A15).** *Guard:* AC A-4's grep — no file outside it
   imports `ts-fsrs` or computes intervals, including the preview path.
8. **Client-asserted streaks (C-2).** *Guard:* credit is written only inside the grading transaction.
9. **AI output auto-saving (E-4).** *Guard:* a test that runs a full generation and asserts zero rows
   in `flashcards`/quiz/notes before Save is tapped.
10. **The `library.ts` naming trap.** An executor may extend the physical book library by mistake.
    *Guard:* stated at the top of this plan; a reviewer should reject any diff touching
    `schema/library.ts` or `student.surface.campus_library`.
11. **04:00 vs Today's day boundary (A13).** *Guard:* one helper, documented divergence, no change to
    Today's boundary.

---

## 6. Acceptance & closeout

Self-check against **every numbered acceptance criterion in hyperspec Parts A–F** (A-1…A-5, B-1…B-9,
C-1…C-6, D-1…D-5, E-1…E-11, F-1…F-4), as amended (A-2 per A1; E-11 per A3/A4; E-3 per A8's fallback if
taken). Record PASS / PASS-with-deviation / N/A with reasons.

Then write **`IMPLEMENTED-LIBRARY.md`** at the repo root: what was built per part; every deviation
(expect at minimum: the `reps=0` backfill rule, `flashcards` ownership via deck join, the XOR
precedent, nullable `institution_id`, the `patterns` type widening, the missing outline stage,
`user_commitments` vs `student_exam_goals`, and the pgvector outcome); exposed contracts
(`SchedulerService` interface and import path, the `patterns` object shape, `user_streaks`/
`streak_events` as the product-wide streak substrate, endpoints with `/v1`, job names, feed
`event_key` formats, new flag keys, and the `localStudyDate` helper); the acceptance table; and
verification commands with results.

**Also state explicitly** whether Today's `reviewDueCount()` was updated and what the before/after
counts were. The next session reading this file needs that answer more than any other.
