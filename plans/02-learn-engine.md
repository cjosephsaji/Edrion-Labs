# Plan 02 — The Learn Engine (Petros)

> Consumer: Cursor Composer 2.5. Contracts and names come from `plans/00-overview.md`; identity, storage, ledger, shell, and tokens come from Plan 01's exposed contracts. Design source: `Edrion Learn Portal Design/Edrion Learn.dc.html`; behavioral spec is the `text/x-dc` Component script inside it.

## 1. Objective & scope

Build the centerpiece: the Learn engine and every Learn surface — Learn home with the intent router, the guided session canvas (spine + seven block types + streaming + pause/resume + completion), Concept and Practice workspaces (hint ladder, KaTeX, photo-upload evaluation), Quick Answer, Learning Paths (institution-fed and AI-generated), the revision system (freshness + queue + 10-minute refresh), the Ask Petros drawer (contextual, follow-up chat, pin-to-canvas, governance-aware plumbing), streaks & weekly goals, Petros Notes, and History (sessions/quick-answers/practice entries). Plus the full AI orchestration module powering all of it.

**Out of scope**: institutional content sections (03), Library & Lab (04), mock-exam/debate History entries (04), homework governance *enforcement UI* on homework pages (03 — but the drawer's policy plumbing ships here), Home-page enrichment beyond wiring the continue-learning tile.

## 2. Preconditions & contracts consumed

From Plan 01: `StudentAuthGuard`/`StudentTenantInterceptor`/`StudentPermissionsGuard` + `@RequireStudentPermissions`; `StudentPrincipal`; `LEARNING_EVENTS_WRITER` + catalogue (Overview §6.3); `StudentStorageService` + `storage_objects` (this plan uses kind `practice_photo`, already in Plan 01's kind list); `student_preferences` (hint_generosity, celebration, weekly_goal); `StudentClient.sse`; shell, toast, theme/persona providers. `MathText` does **not** exist yet — created here.
External: `OPENAI_API_KEY` (same config seam as Petros staff module). If unset, the module boots with a `NullLearnAiProvider` that throws typed `AI_UNAVAILABLE` errors surfaced as a friendly UI state — never fake output.

Existing tables consumed read-only: `classes`, `subjects`, `grade_levels`, `academic_terms` (institution-fed path seeding), `timetable_slots` (Home continue tile context).

## 3. Database changes

### Migration 0049 — learn core

```sql
-- Canonical topics: normalized topic nodes; institution-fed or learner-created
CREATE TABLE learn_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_key text NOT NULL,                -- slug: 'linear-equations-both-sides'
  title text NOT NULL,
  subject_label text NOT NULL,            -- 'Mathematics'
  curriculum_key text NOT NULL DEFAULT 'generic',  -- 'cbse-8' | 'generic' | course code…
  domain_archetype text NOT NULL DEFAULT 'procedural_quantitative', -- pedagogy matrix, §6.1
  institution_id uuid REFERENCES institutions(id),  -- null = shared/global topic
  source text NOT NULL DEFAULT 'ai',      -- 'ai' | 'institution' | 'student'
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topic_key, curriculum_key)
);

-- Cached generated teaching material, reused across students (Overview §5.4 cost controls)
CREATE TABLE concept_atoms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES learn_topics(id),
  atom_kind text NOT NULL,                -- 'session_plan'|'concept_card'|'visual_explainer'|'worked_example'|'checkpoint'|'practice_item'|'concept_workspace'
  variant_key text NOT NULL DEFAULT 'default', -- e.g. concept mode 'standard|simpler|analogy|real'
  content jsonb NOT NULL,                 -- conforms to block schemas
  model text NOT NULL,
  prompt_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topic_id, atom_kind, variant_key, prompt_version)
);

CREATE TABLE learning_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id),
  student_id uuid REFERENCES students(id),
  independent_user_id uuid REFERENCES independent_users(id),
  title text NOT NULL, subject_label text NOT NULL,
  source text NOT NULL,                   -- 'institution' | 'ai_goal'
  meta_line text,                         -- design pathMeta, e.g. 'Mathematics · CBSE Class 8 · Chapter 2 — shaped by your syllabus'
  goal jsonb,                             -- independent: {statement, constraints, schedule}
  status text NOT NULL DEFAULT 'active',  -- active|archived
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT lp_subject_ck CHECK ((student_id IS NOT NULL) <> (independent_user_id IS NOT NULL))
);

CREATE TABLE learning_path_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id uuid NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES learn_topics(id),
  sequence integer NOT NULL,
  why_here text,                          -- design 'WHY HERE' line
  optional_branch boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'upcoming',-- upcoming|current|completed|removed
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (path_id, sequence)
);

CREATE TABLE learn_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id),
  student_id uuid REFERENCES students(id),
  independent_user_id uuid REFERENCES independent_users(id),
  topic_id uuid NOT NULL REFERENCES learn_topics(id),
  path_item_id uuid REFERENCES learning_path_items(id),
  grounding_knowledge_item_id uuid,       -- FK added in Plan 04 migration; nullable, inert until then
  status text NOT NULL DEFAULT 'active',  -- active|paused|completed|abandoned
  spine jsonb NOT NULL,                   -- [{step, label, status:'done'|'current'|'up', meta}]
  session_plan jsonb NOT NULL,            -- planner output (§6.2)
  started_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz, completed_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,  -- strings for completion overlay
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT ls_subject_ck CHECK ((student_id IS NOT NULL) <> (independent_user_id IS NOT NULL))
);
CREATE INDEX learn_sessions_student_idx ON learn_sessions(student_id, started_at DESC);
CREATE INDEX learn_sessions_indep_idx ON learn_sessions(independent_user_id, started_at DESC);

CREATE TABLE learn_session_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES learn_sessions(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  block_type text NOT NULL,               -- the seven types, Overview §6.7
  spine_step text NOT NULL,               -- which spine step it serves
  content jsonb NOT NULL,                 -- validated against blocks.ts
  state jsonb NOT NULL DEFAULT '{}'::jsonb, -- student-visible mutable state (view toggled, why opened…)
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, sequence)
);

CREATE TABLE learn_attempts (              -- one row per checkpoint answer / practice attempt / explain-back
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES learn_sessions(id) ON DELETE SET NULL,
  block_id uuid REFERENCES learn_session_blocks(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id),
  independent_user_id uuid REFERENCES independent_users(id),
  kind text NOT NULL,                      -- 'checkpoint_mcq'|'checkpoint_explain'|'practice'|'refresh'
  input jsonb NOT NULL,                    -- {choice} | {text} | {answer, scratchpad, photoObjectId?}
  evaluation jsonb NOT NULL,               -- evaluator output (§6.4): {correct, feedback, evidenceTags[]}
  hints_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quick_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id),
  student_id uuid REFERENCES students(id),
  independent_user_id uuid REFERENCES independent_users(id),
  question text NOT NULL,
  answer_short text NOT NULL,
  answer_detail text NOT NULL,
  visual jsonb,                            -- optional declarative SVG spec (pedagogy-matrix-gated)
  on_learning_list boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qa_subject_ck CHECK ((student_id IS NOT NULL) <> (independent_user_id IS NOT NULL))
);
```

### Migration 0050 — revision, evidence, cost log

```sql
CREATE TABLE revision_states (             -- one row per (subject, topic); the freshness system
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id),
  independent_user_id uuid REFERENCES independent_users(id),
  topic_id uuid NOT NULL REFERENCES learn_topics(id),
  freshness text NOT NULL DEFAULT 'fresh', -- fresh|fading|due
  last_evidence_at timestamptz NOT NULL,
  last_refreshed_at timestamptz,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, topic_id), UNIQUE (independent_user_id, topic_id),
  CONSTRAINT rs_subject_ck CHECK ((student_id IS NOT NULL) <> (independent_user_id IS NOT NULL))
);

CREATE TABLE evidence_tags (               -- Petros Notes: strengths/growth, evidence-only
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id),
  independent_user_id uuid REFERENCES independent_users(id),
  tag_key text NOT NULL,                   -- stable slug e.g. 'sign-errors-under-time-pressure'
  label text NOT NULL,                     -- display: 'Sign errors under time pressure'
  polarity text NOT NULL,                  -- 'strength' | 'growth'
  note text NOT NULL,                      -- 'Based on 4 practice sessions…' (source line)
  evidence_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb, -- learning_events.id[]
  status text NOT NULL DEFAULT 'active',   -- active|retired
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, tag_key), UNIQUE (independent_user_id, tag_key),
  CONSTRAINT et_subject_ck CHECK ((student_id IS NOT NULL) <> (independent_user_id IS NOT NULL))
);

CREATE TABLE learn_ai_calls (              -- append-only cost/usage log
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  student_id uuid, independent_user_id uuid,
  purpose text NOT NULL,                   -- 'route'|'plan'|'block'|'evaluate'|'vision'|'quick'|'ask'|'tag'|'revise'
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cached boolean NOT NULL DEFAULT false,   -- served from concept_atoms
  duration_ms integer,
  error text
);
```

RLS for all new tables: institutional rows under `app.institution_id` + `app.student_id` self-scope; independent rows under `app.independent_user_id` (same policy shape as `learning_events`, Plan 01). `learn_ai_calls` and `revision_states` writes are service-only. Add `learn_ai_calls` to the append-only revoke list.

## 4. Backend

Module tree additions:

```
apps/api/src/modules/student/
  learn-ai/    provider.ts (LearnAiProvider interface), openai.provider.ts, null.provider.ts,
               router.service.ts, planner.service.ts, block-generator.service.ts,
               evaluator.service.ts, pedagogy-matrix.ts, budgets.service.ts, atom-cache.service.ts,
               prompts/ (versioned prompt files, PROMPT_VERSION const)
  learn/       sessions.controller.ts/service.ts, path.controller.ts/service.ts,
               quick.controller.ts/service.ts, ask.controller.ts/service.ts,
               revision.controller.ts/service.ts, streaks.service.ts, notes.controller.ts,
               history.controller.ts, learn.repository.ts
  jobs/        revision-sweep.processor.ts, evidence-tagger.processor.ts  (BullMQ 'ai' queue)
```

### 4.1 Endpoints (all `StudentAuthGuard` chain; permission `student.learn.use` unless noted)

| Endpoint | Behavior (business rules in prose) |
|---|---|
| `POST /v1/student/learn/intent` `{ text }` → `{ intent, topicGuess?, subjectLabel?, route }` | Router call (§6.1). `intent ∈ quick_question, learn_topic, practice, revise, prepare_exam, continue`. Deep-learn phrasing without a question mark (design regex heuristic is replaced by the classifier, same outcomes) → `learn_topic` and the response carries the design's helper copy switch: UI shows "Petros will map a learning path for this — press Enter" vs "Quick answer, no lesson attached — press Enter". No side effects; ledger `quick.asked` only on actual quick creation. |
| `POST /v1/student/learn/sessions` `{ topicKey?, topicTitle?, pathItemId?, source, grounding? }` → `LearnSessionDto` | Resolve/create `learn_topics` row (normalize key; attach curriculum from student context). Planner (§6.2, cached via `concept_atoms['session_plan']`) → create `learn_sessions` with spine (six steps, statuses: first `current`, rest `up`) + first blocks (concept_card, visual_explainer if warranted, worked_example) inserted immediately from atoms (cache hit) or generated. Ledger `session.started`. One active session per topic per student — resuming returns the existing row. |
| `GET /v1/student/learn/sessions/:id` → full session (spine, blocks with state, status, readOnly flag when completed) | Read-only reopen: completed sessions return `readOnly: true`; the UI blocks all mutations (History invariant). |
| `GET /v1/student/learn/sessions/:id/stream` (SSE) | Streams pending block generation: events `block.delta` (partial JSON per block — send elements as they complete, not token-level), `block.done`, `spine.update`, `session.done`. Client falls back to polling `GET` if SSE drops. |
| `POST .../sessions/:id/blocks/:blockId/answer` | Body per block type: checkpoint `{choice}` or `{explanation}`; practice `{answer, scratchpad?, photoObjectId?}`; reflection `{}` (finish acknowledgment). Runs evaluator (§6.4), writes `learn_attempts`, ledger (`session.checkpoint_answered` / `session.practice_attempted`), advances spine **only on evidence** (correct checkpoint or accepted explain-back unlocks practice; practice solve unlocks wrap-up — port the exact gating from the design's `mkStep` logic), triggers next-block generation (streamed). Wrong answers: return diagnostic feedback, spine unchanged, unlimited retries. Hints: `POST .../blocks/:blockId/hint` `{rung: 2|3}` returns the pre-generated rung (hint ladder is part of the practice block content; rung 1 always visible), increments `hints_used` on next attempt row. |
| `POST .../sessions/:id/pause` / `resume` / `finish` | Pause: status `paused`, ledger `session.paused`, toast copy handled client-side. Finish: allowed only when wrap-up reached; sets completed, computes `evidence[]` (from attempts: "Checkpoint: answered on the first try / in N tries / explained back", "Practice: solved with N hints", plus view-explored notes from block state), ledger `session.completed`, updates `revision_states` (fresh) and path item status, returns completion payload for the overlay. |
| `POST /v1/student/learn/quick` `{ question, from }` → `QuickAnswerDto` | Small-model answer (§6.3): short answer + detail paragraph + optional declarative visual (matrix-gated). Persists `quick_answers`, ledger `quick.asked`. **Never** creates a session or path (Hard Rule 5); the only escalation is the returned `visualOffer` boolean the UI renders as "Want the 2-minute visual version?" linking to Lab (04). |
| `GET /v1/student/learn/quick/:id` · `POST /v1/student/learn/quick/:id/learning-list` | Reopen from History; toggle `on_learning_list` (toast "Added to your learning list — no lesson attached."). |
| `GET /v1/student/learn/path` → `LearningPathDto` | Institutional: if no path exists, seed from institution data — subjects for the student's grade level and, when Plan 03's syllabus data exists, its module list; v1 seed = topic list from the student's subjects' names + current-term ordering, `source:'institution'`, `pathEditable:false`. Independent: `pathEditable:true`; created via `POST /learn/path` `{ goalStatement, constraints?, weeklyMinutes? }` → planner generates 5–8 items with `why_here` lines. |
| `PATCH /v1/student/learn/path` | Independent only: reorder, remove (sets `removed`, toast "It's your path — add it back anytime from History."), add item `{topicTitle}`, restore. Institutional 403. |
| `GET /v1/student/learn/revision` → `{ queue: {topicKey,title,freshness,lastTouched}[], counts:{fresh,fading,due} }` | From `revision_states` joined to topics, `due` first then `fading` (oldest first). |
| `POST /v1/student/learn/revision/:topicId/refresh` → mini-session | The "10-minute refresh": generates a 3-block micro-session (concept recap + 2 practice items) — same session machinery with `session_plan.kind='refresh10'`; completing it writes `revision.completed` and resets freshness. |
| `POST /v1/student/learn/ask` `{ context: {kind:'session'|'concept'|'practice'|'homework'|'quick', id, blockId?, contextLabel}, question }` → streamed answer | The drawer. Governance: when `context.kind==='homework'` resolve the homework row's `ai_policy` **server-side** (module boundary: calls Plan 03's `HomeworkPolicyPort` — defined here as an injectable interface with a default implementation returning `'full'` for non-homework contexts and `AI_POLICY_UNAVAILABLE` until Plan 03 binds it): `off` → typed refusal payload the UI shows as the governance note; `hints_only` → restricted prompt (concept help, no direct solutions). Ledger `drawer.asked`. Follow-up chat: `conversation: [{q,a}]` array in-body (ephemeral — not persisted beyond the request) matching "answers vanish when the session ends unless you pin them". |
| `POST /v1/student/learn/ask/pin` `{ sessionId, blockAfterId?, question, answer }` | Inserts a `note_card` block into the session (content `{question, answer}`), toast client-side, ledger via `drawer.asked` pinned=true. |
| `GET /v1/student/learn/streaks` → `{ streakDays, weeklyGoal: {done, target}, showStreak }` | Derived from ledger per Overview §6.3 rules; `target` from preferences. |
| `GET /v1/student/learn/notes` → `{ strengths: EvidenceTagDto[], growth: EvidenceTagDto[] }` (permission `student.analytics.view`) | Petros Notes = active `evidence_tags`, each `{label, note, evidence: {label, meta}[]}` resolving event ids to human lines. Never numeric. |
| `GET /v1/student/history?type=&q=&cursor=` (permission `student.history.view`) | Keyset-paginated day-grouped feed assembled from `learn_sessions`, `quick_answers`, practice `learn_attempts` (set-level), each `{day, kind, title, meta, reopen: {route}}` matching the design's `histGroups`. Types Mock tests/Debates return empty until Plan 04 (the filter chips render; empty state copy: "Nothing here yet."). |

### 4.2 Streaks/goals/freshness derivation rules (implement exactly)

- Streak: consecutive calendar days (student's institution timezone; independent: profile timezone else UTC) ending today/yesterday with ≥1 ledger event of type in `session.*completed|practice_attempted|checkpoint_answered`, `revision.completed`, `quick.asked`, `flashcards.reviewed`.
- Weekly goal: ISO-week count of `session.completed` + `revision.completed`; target from preferences (design default 8 institutional / 5 independent — set at first `/me` if preference untouched). When the count first reaches the target in a week, `StreaksService` writes ledger `goal.weekly_met`.
- Path ledger writes: `path.created` on path creation (both variants), `path.edited` on PATCH mutations, `path.item_completed` when session finish flips an item to completed.
- Freshness buckets: Overview §6.3 constants; recomputed by the nightly `revision-sweep` job (BullMQ `ai` queue, `schedule()` hourly; processes students with events since last sweep) **and** opportunistically on session/refresh completion.

### 4.3 Evidence tagger job

`evidence-tagger.processor.ts` (BullMQ `ai` queue, scheduled every 6h per active student, and enqueued after each `session.completed`): loads last 30 days of attempts+events, prompts the Small tier with the existing tags, receives `{tags: [{tagKey,label,polarity,note,evidenceEventIds}]}` (strict schema §6.5), upserts `evidence_tags`, retires tags no longer supported. Notes must cite counts ("Based on N practice sessions") — the note template is part of the prompt contract; reject (log + skip) any tag whose note contains a percentage sign or the words "score/mastery".

## 5. Frontend — routes & screens (all under the Plan 01 shell)

**Route map** (design screen keys per Overview §2.1): `/learn` (`sHome`), `/learn/session/[id]` (`sSession` + `sPh`-chunk completion overlay + drawer chrome), `.../concept/[blockId]` (`sConcept`), `.../practice/[blockId]` (`sPractice`), `/learn/practice/[setId]` (same `sPractice` component, standalone practice from intent chip), `/learn/quick/[id]` (`sQuick`), `/learn/path` (`sPath`), `/learn/revision` (new screen, anatomy: `sHome` rusty card list + `sProgress` revision-health chips as header), `/history` (`sHistory`). Also replaces the `/learn` placeholder tile behavior on `/home` (continue-learning tile now live from `GET /learn/sessions?status=paused|active&limit=1`).

Per-screen requirements (replicate the design one-to-one; component names from Overview §6.6):

- **Learn home `sHome`**: persona greeting block (eyebrow, serif greeting, goal line — real numbers from `/learn/streaks`); streak + weekly-goal chips (ring dasharray progress per design `goalDash`); "What are we doing today?" card — big input (focus ring emerald), Enter submits via `/learn/intent` then routes; intent helper line appears when non-empty (`✦ {intentLabel}`); intent chips: Continue where I left off (→ resume), Learn something new (→ `/learn/path`), Quick question, Practice, Revise (→ `/learn/revision`), Prepare for exam (institutional; → `/lab/mock-exams/new` — until Plan 04, PlaceholderScreen), Study from my notes (independent; → `/library` placeholder until 04). Resume card (eyebrow/title/meta + 6-dot step progress + CTA) when a paused/active session exists; done-chip variant when today's session completed (design `sessionDone` state). Today's-plan card (institutional; timetable + session + deadlines — deadlines join in Plan 03; render what `/home` plan feed provides) / This-week goals + Explore cards (independent; explore chips fire quick questions). Revision-due card (top-3 from `/learn/revision`, FreshnessChips). "PETROS NOTICED" recommendation card (school persona when an active growth tag exists: text from the tag's note + CTA "Start a 15-min session" → creates session on that topic; dismissible). Footer links: View learning path / Progress & insights. States: loading skeletons per card; AI-unavailable banner when `AI_UNAVAILABLE`; empty (new student: no resume card, plan card shows schedule only). |
- **Session canvas `sSession`**: header (Save-and-pause ghost button + title + meta + Ask Petros button); desktop left rail `SpineRail` (THIS SESSION, six steps with done-check/current-pulse/upcoming states, meta lines, connector lines colored by state, evidence footnote card); narrow: sticky top progress bar "STEP {n} OF 6 — {label}" + six segment ticks (design narrow variant). Canvas: `BlockRenderer` mapping `block_type` → component, each entering with `animate-block-in` on stream arrival; ✦ marks AI-authored chrome. Blocks: `ConceptCardBlock` (with "I know this — test me instead ↓" jump that smooth-scrolls to checkpoint + toast), `VisualExplainerBlock` (declarative SVG render + view-toggle button "↺ Show another view…" when `content.views.length>1`), `WorkedExampleBlock` (equation header, steps with STEP n pills, mono math line, per-step "✦ why does this work?" expanders), `NoteCardBlock` (pinned Q/A), `CheckpointBlock` (MCQ 2×2 grid; option styling states — picked-wrong terracotta, correct-locked deep green, others muted; wrong → diagnostic `cpMsg` line; right → praise banner (persona: school "Nice work! 🎉 Evidence logged…" + `animate-burst` particles when celebration=warm; college/indie "Correct. Practice unlocked."); explain-back toggle + textarea + submit (<12 chars → toast nudge, accepted → evidence)), `StreamingIndicator` ("PETROS IS BUILDING YOUR PRACTICE" + dotBounce dots) while next block streams, `PracticeLauncherBlock` (locked until checkpoint; solved summary state), `WrapUpBlock` (numbered takeaways + "Finish session ✓"; the "Turn takeaways into flashcards" button is **hidden in this plan** — Plan 04 unhides it and wires `POST /v1/student/library/decks/from-session`; no stub endpoints). Completion overlay `CompletionOverlay` (from `sPh` chunk: burst particles school-only, title/sub per persona, EVIDENCE FROM THIS SESSION list from API, Back to Learn / What's next → path). Pause → toast "Session paused — everything is saved, nothing is lost." Read-only mode: banner + all inputs disabled + original answers rendered (History reopen). |
- **Concept workspace `sConcept`**: back link ("← Back to session · progress saved"), eyebrow, serif title, four mode chips (Standard / Explain simpler / Use an analogy / Real example) swapping content (each mode = `concept_atoms` variant; generated on first request, cached), static SVG diagram slot, "Go deeper" accordion, CTA back to session. Block state records modes viewed (feeds spine meta "Explored 2 views"). |
- **Practice workspace `sPractice`**: header back link + THIS SET palette (✓/current/upcoming circles); question card (eyebrow PRACTICE · QUESTION n OF m, prompt with `MathText` KaTeX rendering, mono equation display); left column: SCRATCHPAD ("yours — Petros only peeks for feedback") textarea + answer row (`x =` input + Check my answer) + feedback states (`pfbWarn` amber 🔍 diagnostic / `pfbGood` green + CTA back to wrap-up); right column: `HintLadder` (rung 1 visible; reveal buttons for 2/3; copy per design) + "hints aren't cheating" footnote card; **photo answer mode**: segmented control Type / Photo of my notebook (upload → `StudentClient.upload('practice_photo')` → preview + "Petros is reading your working…" → evaluator vision result rendered as the same feedback states). Standalone practice route generates a 5-item set for a chosen topic (from intent chip / practice again). Math input: plain text accepted; `MathText` renders LaTeX in prompts/hints/feedback (KaTeX dependency added to student-web only). |
- **Quick answer `sQuick`**: eyebrow "QUICK ANSWER — NOT A LESSON" + ✦; serif question; answer card (bold short answer + detail paragraph + optional declarative SVG when provided — moon distance scale in design is the reference for scale-type visuals); action row: "Want the 2-minute visual version?" (→ Lab placeholder until 04), "Add to my learning list" (+ added state chip), "That's all I needed ✓" (→ `/learn`); footer promise line. |
- **Learning path `sPath`**: back link; title block (eyebrow LEARNING PATH, serif `pathTitle`, `pathMeta`); editable badge for independent ("✦ Proposed by Petros — yours to edit"); node list: number/check circles, connector line, title + FRESH/FADING `FreshnessChip`s, current node "Continue →" button, completed nodes "History →" chip (→ `/history?q=<topic>`), WHY-HERE eyebrow + line, optional-branch card (OPTIONAL BRANCH eyebrow, Remove for editable paths + toast). |
- **Revision queue `/learn/revision`** (new, design language): header with the three freshness count chips (`revChips` anatomy from `sProgress`), queue list (FreshnessChip + title + last-touched line + "10-minute refresh →" per row → creates refresh session and routes into the canvas), empty state ("Nothing is fading. Come back after you've learned a few topics."). |
- **History `sHistory`**: header (serif "Everything you've done" + count card `{n} activities this month` from ledger), search input, type chips (All/Sessions/Quick answers/Practice/Mock tests/Debates), day-grouped rows (kind glyph tile with kind color, KIND eyebrow, title, meta, → chevron; reopen routes: session → readOnly canvas, quick → `/learn/quick/[id]`, practice → practice read view), footer read-only note. Mock/Debate chips present but their feeds are empty until 04. |
- **Ask Petros drawer** (`sPh` chunk chrome): floating "✦ Ask Petros" tab on session/concept/practice routes (drawer closed); drawer = fixed right 372px `animate-slide-in-drawer` (desktop) / bottom sheet 72vh `animate-sheet-in` (narrow); header (✦ avatar, title, "A side conversation — your lesson stays put", ×), context chip ("Asking about: {contextLabel}" — updates with scroll position/current block via a context provider), suggested-question buttons (from current block content `suggestedQuestions[]` — the block generator emits 2 per block), Q/A thread (typing dots → answer), Pin to canvas button (+ pinned chip state), input with amber focus ring + footer "Ephemeral by default — pin anything worth keeping". Governance note slot: when the ask response carries a policy notice (homework contexts, Plan 03), render the amber/dim note verbatim. |

Data hooks: `useLearnSession(id)` (query + SSE subscription merging block deltas into cache), `useIntent()`, `usePath()`, `useQuick(id)`, `useRevisionQueue()`, `useStreaks()`, `useHistory(params)`, `useAsk()` (mutation with streamed response). Mobile behaviors: everything single-column ≤920px; drawer→sheet; spine→top bar; practice columns stack (scratchpad above ladder).

## 6. AI work (each call: responsibility, schema, tier, caching, budget)

Provider interface (in `learn-ai/provider.ts`):
```ts
interface LearnAiProvider {
  completeJson<T>(opts: {purpose: Purpose; tier: 'nano'|'small'|'large'|'vision';
    system: string; user: string; images?: {objectId: string}[];
    schema: ZodSchema<T>; maxOutputTokens: number}): Promise<T>;
  streamJsonArray<T>(opts: …): AsyncIterable<T>;   // block streaming
}
```
Every call goes through `BudgetsService.spend(principal, purpose, estTokens)` (Redis: daily token counter key `learn:budget:<principalId>:<date>`, RPM sliding window; over-budget → typed `AI_BUDGET_EXCEEDED` rendered as a gentle "Petros needs a breather — try again in a bit" card) and logs to `learn_ai_calls`.

1. **Intent router** — nano. In: student text + persona + subject list. Out schema `{intent, subjectLabel?, topicTitle?, depth: 'quick'|'deep', visualWarranted: boolean}`. No cache. ≤300 output tokens.
2. **Pedagogy matrix** (`pedagogy-matrix.ts`, pure code, no model): maps `(domain_archetype × stage)` → generation directives `{visualBlocks: boolean, workedExampleStyle, checkpointStyle, practiceStyle}`. Archetypes (Overview): `procedural_quantitative, conceptual_mechanistic, narrative_interpretive, language_expression, memorization_taxonomy, applied_creative`; stages: `school_junior, school_senior, college, adult_independent` (derived from persona + grade). Archetype assigned by the router (add `archetype` to its output schema). The matrix table is a code constant with all 24 cells filled (write sensible directives per cell; e.g. procedural×school_junior → visuals ON balance-scale style, checkpoint MCQ, practice numeric; narrative×college → visuals OFF by default, checkpoint explain-back-first). |
3. **Session planner** — large; cached in `concept_atoms('session_plan')` per (topic, curriculum, prompt_version). Out: `{spineMeta, blocks: [{blockType, spineStep, brief}]}` honoring matrix directives. |
4. **Block generator** — large; streamed; cached per-block-kind in `concept_atoms` for topic-generic blocks (concept_card, visual_explainer, worked_example, checkpoint); practice items generated per-student (not cached) to vary numbers. Output = the seven block schemas (`packages/schemas/src/student/blocks.ts`): write them exactly — e.g. `checkpoint: {question, math?, options: [{key,label,correct,feedbackWrong}], explainPrompt}`, `visual_explainer: {views: [{title, svgSpec}] }` where `svgSpec` is the declarative spec `{viewBox, elements: [{type:'rect'|'circle'|'line'|'path'|'text'|'group', …attrs, children?}]}` rendered by a whitelisting client renderer (no raw SVG strings — sanitization by construction). |
5. **Evaluator** — small for typed answers (checkpoint explain-back, practice text): out `{correct|accepted, feedback, evidenceNote?}`; **vision** tier when `photoObjectId` present (image fetched via storage driver, passed as image input): out adds `{transcription}`. Feedback must be diagnostic-not-judgmental — prompt includes the design's exemplar feedback lines. No cache. |
6. **Quick answer** — small. Out `{answerShort, answerDetail, visual?: svgSpec, visualOffer: boolean}` (visual only when router said warranted). No cache (persisted per row). |
7. **Ask drawer** — small. In: context block content + question + policy mode (full/hints_only). Out `{answer, refused?: boolean, refusalNote?}`. |
8. **Evidence tagger** — small, batch (§4.3). Out `{tags:[…]}` strict. |
9. **Revision selector** — pure code (no model): freshness math per §4.2.
Prompt files live in `learn-ai/prompts/` with a `PROMPT_VERSION` string bumped on any change (busts atom cache via the unique index).

## 7. Institution-web additions

None functional this plan (teacher counterparts of Learn are Plan 03's content systems). One read-only addition: **Students → detail → "Learning" tab** showing exactly what the transparency panel promises the school sees — topics-completed count, weekly-goal counts, evidence tags — via a new `GET /v1/portal/students/:id/learning-summary` (permission `students.view`), computed from the ledger. Nothing else (no chat logs, no scratchpad, no hint detail — enforce in the DTO, not the UI).

## 8. Build order

1. **Schemas & migrations** — `blocks.ts` + session/intent/path/quick/ask schemas; migrations 0049–0050 + RLS/grants.
   *Verify*: migrate from empty; unit tests for block schema examples (fixtures for all seven types parse).
2. **Provider + budgets + atom cache** — OpenAI provider with structured outputs, null provider, budgets, `learn_ai_calls` logging.
   *Verify*: unit tests with mocked OpenAI; budget exhaustion returns typed error; `OPENAI_API_KEY` unset → null provider boots, endpoints return `AI_UNAVAILABLE`.
3. **Session vertical (backend)** — topics, planner, generator, sessions/blocks/answer/pause/finish, SSE, evaluator (typed answers), ledger writes.
   *Verify*: scripted flow via curl: create session → stream blocks → wrong checkpoint → right checkpoint → practice answer → finish; assert spine gating, `learn_attempts` rows, ledger rows (`session.started/checkpoint_answered/practice_attempted/completed`).
4. **Session canvas (frontend)** — `sSession` + blocks + spine + completion + pause/resume + read-only; Concept workspace; Practice workspace (typed answers + hints).
   *Verify*: manual run-through on :3005 in all three themes + 375px; reduced-motion disables blockIn/burst; reopen completed session read-only.
5. **Quick answer + intent + Learn home** — router endpoint, quick vertical, `sHome` with all cards/chips/states wired.
   *Verify*: "why do bridges sway?" → quick; "teach me derivatives" → path route; helper line switches; quick answer renders visual when provided; "no lesson attached" — assert no session row created.
6. **Paths + revision** — path endpoints/screens (both variants), revision states + sweep job + queue screen + refresh mini-session.
   *Verify*: independent goal → generated editable path (remove/restore works); institutional path seeded read-only; force a stale `last_evidence_at` → sweep marks Due → refresh flow resets to Fresh, ledger `revision.completed`.
7. **Drawer + pin + governance plumbing** — ask endpoint (with `HomeworkPolicyPort` default), drawer UI on session/concept/practice, pin-to-canvas inserting note_card.
   *Verify*: contextual chip follows current block; pinned note appears in canvas + persists on reload; simulated `hints_only` policy (unit test on the port) restricts the prompt and returns note payload.
8. **Streaks, notes, history, photo evaluation, vision** — streaks endpoint + home chips real; evidence-tagger job + notes endpoint; history screen; practice photo upload → vision evaluation.
   *Verify*: seed events → streak/goal numbers match hand-computation; tagger produces tags with event citations (mock model in test; live once with real key); history filters/search/reopen; photo of handwritten `x = 4` (fixture image) evaluates.
9. **Smoke** — `scripts/student-p2-smoke.sh` (target ≥45 assertions: auth reuse, session flow, gating, quick, path, revision, drawer, history, budget headers).
   *Acceptance*: all green; typecheck/lint clean; every mutation writes ledger and/or audit as specified; no numeric UI element lacks a FROM source (grep the built pages for the StatCard usage rule).

## 9. Anti-goals

- No percentage/score/mastery output anywhere — evaluator and tagger schemas have no numeric-score fields; keep it that way.
- Quick answers must not create sessions, paths, or "suggested lesson" modals.
- Chat drawer never becomes a full-screen chat; no message persistence beyond pins.
- No raw-SVG strings from the model — declarative spec + whitelisting renderer only.
- No image generation; no voice; no stylus canvas (seams only, Plan 04/deferred).
- Do not reuse `petros_*` tables or the staff Petros module for the student engine (separate cost/governance domains); the shared piece is the provider config pattern only.
- Do not auto-run any state-changing AI action; every write is an explicit student action.
- Do not block session UI on SSE — always poll-fallback.
- Institutional path is not editable by students; do not add an editor behind a flag.

## 10. Escalations

- If structured-output streaming of whole blocks proves unreliable with the chosen model, fall back to per-block non-streamed generation with the `StreamingIndicator` between blocks — UX-identical; note the change.
- If KaTeX bundle size on mid-range Android is problematic (>150KB gz route impact), escalate before swapping to server-rendered math.
- Curriculum-identical atom-cache sharing across institutions is enabled for `institution_id IS NULL` topics only; if legal review requires per-institution isolation, flip `ATOM_CACHE_SCOPE=institution` env (build the env switch now, default `global`).

## Contracts exposed (to Plans 03–04)

Session engine: `POST /learn/sessions` accepts `grounding: {knowledgeItemId}` (04) and `source: 'prep_plan'` (03/04); `HomeworkPolicyPort` interface for Plan 03 to bind; drawer `context.kind='homework'` behavior; `MathText`, `BlockRenderer`, `SpineRail`, `AskPetrosDrawer`, `CompletionOverlay`, `HintLadder`, `FreshnessChip`, `StreamingIndicator` components; `useStreaks`, ledger-derived history feed with reserved Mock/Debate types; evaluator service callable for mock exams (04: `EvaluatorService.evaluate({kind:'mock', …})`); budgets service; `learn_topics`/`revision_states` for analytics (03) and flashcard freshness (04); `learning-summary` portal endpoint (03 analytics reuses its aggregation helpers).
