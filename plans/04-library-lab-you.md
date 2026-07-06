# Plan 04 — Library, Lab & the You Layer

> Consumer: Cursor Composer 2.5. Contracts/names from `plans/00-overview.md`; consumes Plans 01–03 exposed contracts only. Design source: `Edrion Learn Portal Design/Edrion Learn.dc.html`.

## 1. Objective & scope

Finish the product: the Library knowledge base (`knowledge_items` — uploads, processing, collections, item detail with the actions rail, generated summaries/flashcards/quizzes, "Tutor me on this" grounding, provenance nesting, save-from-Classes, flashcard study with freshness), Lab home, Visual Studio (structured graph generation on an interactive canvas), Mock Exams (builder wizard → generation → focused taking mode → counts-only results → retake-weak-areas), Debate (setup, both formats, stage UI, moderator, friend-invite lobby, qualitative feedback, voice seam), Achievements (families/tiers over the ledger), History completion (mock + debate entries, search), and the **final integration pass** (Home fed by everything, cross-links, empty states, theme verification, performance).

**Out of scope / seams only** (Overview §9): debate voice (interface + column only), image-generation Diagram mode (provider capability + "coming soon" chip state), stylus input, draw-on-screen (teaser card only), translations, Stripe.

## 2. Preconditions & contracts consumed

Plan 01: storage (`storage_objects` kinds `library_upload`, `mock_answer`, `debate_exhibit`), ledger writer + catalogue, preferences (celebration/weekly goal), shell/toast/theme.
Plan 02: session engine (`POST /learn/sessions` with `grounding: {knowledgeItemId}` — activate the field; add the FK now), `EvaluatorService` (mock evaluation incl. vision), block schemas (quiz reuses `checkpoint`-like item schema), budgets, `FreshnessChip`, `MathText`, drawer, History feed reserved types, `revision_states` (deck freshness co-computation).
Plan 03: `class_materials` (save-to-library), `student_exam_goals` (mock presets), analytics helpers (badge computation), `CountdownCard`.

## 3. Database changes

### Migration 0056 — knowledge base (Overview §5.7 naming is binding: user-facing label "Library", tables `knowledge_*`)

```sql
CREATE TABLE knowledge_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id),
  student_id uuid REFERENCES students(id),
  independent_user_id uuid REFERENCES independent_users(id),
  name text NOT NULL, color text,
  sequence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT kc_subject_ck CHECK ((student_id IS NOT NULL) <> (independent_user_id IS NOT NULL))
);

CREATE TABLE knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id),
  student_id uuid REFERENCES students(id),
  independent_user_id uuid REFERENCES independent_users(id),
  collection_id uuid REFERENCES knowledge_collections(id) ON DELETE SET NULL,
  kind text NOT NULL,               -- 'upload_pdf'|'upload_scan'|'upload_doc'|'saved_material'|'topic_pack'
  title text NOT NULL,
  object_ids jsonb NOT NULL DEFAULT '[]'::jsonb,  -- storage_objects.id[] (multi-page scans ordered)
  origin jsonb NOT NULL DEFAULT '{}'::jsonb,      -- {source:'upload'|'class_material'|'learn_session', classMaterialId?, sessionId?, label?}  — provenance
  page_count integer,
  extracted_text_ready boolean NOT NULL DEFAULT false,
  ai_read boolean NOT NULL DEFAULT false,          -- "read by Petros ✦"
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT ki_subject_ck CHECK ((student_id IS NOT NULL) <> (independent_user_id IS NOT NULL))
);
CREATE INDEX knowledge_items_owner_idx ON knowledge_items(student_id, created_at DESC);
CREATE INDEX knowledge_items_owner_i_idx ON knowledge_items(independent_user_id, created_at DESC);

CREATE TABLE knowledge_artifacts (                 -- generated things; provenance-nested under items or sessions
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id),
  student_id uuid REFERENCES students(id),
  independent_user_id uuid REFERENCES independent_users(id),
  item_id uuid REFERENCES knowledge_items(id) ON DELETE CASCADE,   -- null when from a Learn session
  source_session_id uuid REFERENCES learn_sessions(id),
  kind text NOT NULL,                -- 'summary'|'quiz'|'topic_pack'|'visual'
  title text NOT NULL,
  content jsonb NOT NULL,            -- summary: rich text; quiz: items[]; visual: graph spec (§6.2)
  topic_id uuid REFERENCES learn_topics(id),
  from_label text NOT NULL,          -- display: 'From: Unit 3 notes' | 'From your Learn session'
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT ka_subject_ck CHECK ((student_id IS NOT NULL) <> (independent_user_id IS NOT NULL))
);

CREATE TABLE flashcard_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id),
  student_id uuid REFERENCES students(id),
  independent_user_id uuid REFERENCES independent_users(id),
  item_id uuid REFERENCES knowledge_items(id) ON DELETE SET NULL,
  source_session_id uuid REFERENCES learn_sessions(id),
  topic_id uuid REFERENCES learn_topics(id),
  title text NOT NULL, from_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT fd_subject_ck CHECK ((student_id IS NOT NULL) <> (independent_user_id IS NOT NULL))
);

CREATE TABLE flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  prompt text NOT NULL, answer text NOT NULL,       -- LaTeX allowed
  next_due_at timestamptz NOT NULL DEFAULT now(),   -- spaced repetition (§4.2)
  interval_days numeric(6,2) NOT NULL DEFAULT 0,
  UNIQUE (deck_id, sequence)
);

CREATE TABLE flashcard_reviews (                    -- append-only
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  student_id uuid, independent_user_id uuid,
  result text NOT NULL,                             -- 'got_it' | 'again'
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
```

Also: `ALTER TABLE learn_sessions ADD CONSTRAINT ls_grounding_fk FOREIGN KEY (grounding_knowledge_item_id) REFERENCES knowledge_items(id);`

### Migration 0057 — mock exams

```sql
CREATE TABLE mock_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id),
  student_id uuid REFERENCES students(id),
  independent_user_id uuid REFERENCES independent_users(id),
  title text NOT NULL,
  subject_label text NOT NULL,
  topics jsonb NOT NULL,                    -- string[] chosen in wizard
  context jsonb NOT NULL,                   -- {level, board, mix, difficulty, durationMin, totalMarks, hintsOff:true}
  reference_object_id uuid REFERENCES storage_objects(id),  -- optional past paper
  exam_goal_id uuid REFERENCES student_exam_goals(id),
  status text NOT NULL DEFAULT 'draft',     -- draft|ready|in_progress|completed
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT me_subject_ck CHECK ((student_id IS NOT NULL) <> (independent_user_id IS NOT NULL))
);

CREATE TABLE mock_exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_exam_id uuid NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  topic text NOT NULL,
  qtype text NOT NULL,                      -- 'mcq'|'short'|'long'
  prompt text NOT NULL,                     -- LaTeX allowed
  options jsonb,                            -- mcq: [{key,label}]
  correct_key text,                         -- mcq
  marking_note text,                        -- evaluator guidance for short/long
  marks integer NOT NULL DEFAULT 1,
  UNIQUE (mock_exam_id, sequence)
);

CREATE TABLE mock_exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_exam_id uuid NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,             -- started + duration
  finished_at timestamptz,
  results jsonb,                            -- {total, correct, byTopic:[{topic,total,correct,note}], suggestion}
  UNIQUE (mock_exam_id, attempt_no)
);

CREATE TABLE mock_exam_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES mock_exam_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES mock_exam_questions(id) ON DELETE CASCADE,
  choice_key text, answer_text text,
  photo_object_id uuid REFERENCES storage_objects(id),
  flagged boolean NOT NULL DEFAULT false,
  evaluation jsonb,                         -- {correct, note} filled at finish
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);
```

### Migration 0058 — debate + achievements

```sql
CREATE TABLE debates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id),
  student_id uuid REFERENCES students(id),            -- creator
  independent_user_id uuid REFERENCES independent_users(id),
  motion text NOT NULL,
  side text NOT NULL,                                 -- 'for'|'against'  (resolved from 'surprise me' at start)
  format text NOT NULL,                               -- 'quick_clash'|'structured'
  mode text NOT NULL,                                 -- 'solo'|'friend'
  invite_token_hash text,                             -- friend mode share link (hashed, like resume tokens)
  stage text NOT NULL DEFAULT 'setup',                -- setup|lobby|opening|rebuttal|closing|feedback  (quick_clash: setup|lobby|live|feedback)
  turn_seconds integer NOT NULL DEFAULT 180,          -- structured per-turn timer
  feedback jsonb,                                     -- {strongest, weakest, technique, perSide?}
  audio_seam jsonb,                                   -- reserved; voice mode deferred
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT db_subject_ck CHECK ((student_id IS NOT NULL) <> (independent_user_id IS NOT NULL))
);

CREATE TABLE debate_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id uuid NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  role text NOT NULL,                                 -- 'creator'|'friend'|'petros'
  student_id uuid REFERENCES students(id),
  independent_user_id uuid REFERENCES independent_users(id),
  display_name text NOT NULL,
  side text,                                          -- for|against|moderator
  joined_at timestamptz
);

CREATE TABLE debate_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id uuid NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  round text NOT NULL,                                -- 'opening'|'rebuttal'|'closing'|'live'|'moderation'
  speaker_role text NOT NULL,                         -- 'creator'|'friend'|'petros'|'petros_moderator'
  text text NOT NULL,
  audio_object_id uuid REFERENCES storage_objects(id),  -- voice seam, unused v1
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (debate_id, sequence)
);

CREATE TABLE achievement_awards (                     -- append-only; definitions live in code
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id),
  independent_user_id uuid REFERENCES independent_users(id),
  badge_key text NOT NULL,                            -- catalogue in packages/shared-types
  tier text NOT NULL DEFAULT 'bronze',                -- bronze|silver|gold
  evidence_note text NOT NULL,                        -- 'Learned on 5 different days in one week.'
  evidence_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, badge_key, tier), UNIQUE (independent_user_id, badge_key, tier),
  CONSTRAINT aa_subject_ck CHECK ((student_id IS NOT NULL) <> (independent_user_id IS NOT NULL))
);
```

RLS on all: owner GUC policies as before; friend-mode debate rows readable by both participants (policy: creator owner GUC OR participant match). Append-only revokes: `flashcard_reviews`, `achievement_awards`.

## 4. Backend

New modules: `apps/api/src/modules/student/{library,lab-visual,lab-mock,lab-debate,achievements}` + `jobs/achievements.processor.ts`.

### 4.1 Library (`student.library.use`)

- `GET /v1/student/library` → `{ collections, uploads (recent-first), generated (artifacts+decks unified DTO with kind/fresh/from), recentAdded }` — freshness for topic-linked artifacts/decks from `revision_states`/deck due counts.
- `POST /v1/student/library/items` — `{title?, collectionId?, objectIds: [..]}` (objects previously uploaded kind `library_upload`; multi-page scans: ordered array, reorder endpoint `PATCH .../items/:id/pages`). Creates item (kind from mimes: pdf→upload_pdf, images→upload_scan, docx→upload_doc), enqueues text extraction (pdf-parse / vision OCR for scans via Vision tier when extraction is empty), sets `ai_read` on success. Ledger `library.item_uploaded`, then `library.item_processed`.
- `GET /v1/student/library/items/:id` → item + pages + nested artifacts ("ALREADY MADE FROM THIS").
- Collections CRUD (`POST|PATCH|DELETE /library/collections`).
- **Actions rail** (each returns the created artifact; all explicit-click = confirmed writes):
  - `POST .../items/:id/summarize` → artifact kind `summary` ("Your notation, kept intact" — prompt preserves the student's own symbols/wording).
  - `POST .../items/:id/flashcards` → deck + cards (8–24 based on content volume).
  - `POST .../items/:id/quiz` → artifact kind `quiz` (10–15 items, mcq+short mix).
  - `POST .../items/:id/tutor` → creates a Learn session via Plan 02 engine with `grounding: {knowledgeItemId}` — planner+generator prompts receive the extracted text and **must ground exclusively in it** ("This would start a session grounded only in this document."). Returns `{sessionId}`; client routes to the canvas.
- Save-from-Classes: `POST /v1/student/classes/materials/:materialId/save-to-library` (also mounted for courses) → item kind `saved_material`, origin `{source:'class_material', classMaterialId, label:'From: {class} · {teacher}'}`. Activates the Plan 03 Materials button.
- Auto topic-packs: on `session.completed` (Plan 02 emits; subscribe via a queue job here) create artifact kind `topic_pack` (summary content from wrap-up takeaways) + optionally a deck when the student tapped "Turn takeaways into flashcards" — that Plan 02 button now calls `POST /v1/student/library/decks/from-session {sessionId}` (unhide the button; contract activation).
- Quizzes: `POST /v1/student/library/artifacts/:id/quiz-attempt` `{answers}` → evaluator (small tier) → `{total, correct, notes}`, ledger `quiz.completed`.

### 4.2 Flashcards & spaced repetition

- `GET /v1/student/library/decks/:id` → cover (counts, due today, freshness chip, from_label) + cards.
- `POST /v1/student/library/decks/:id/review` `{cardId, result}` → append `flashcard_reviews`, ledger `flashcards.reviewed` (batched: client sends per-card, service coalesces ledger rows per deck per hour); scheduling: `again` ⇒ interval 0 (due now +10min), `got_it` ⇒ interval = max(1, interval×2.2) days (simple SM-lite; constants in shared-types). Deck freshness = Due if any card due, Fading if none due but oldest review >7d, else Fresh — mirrors the topic freshness language.
- `PATCH .../decks/:id` + card CRUD (deck editor: "Petros keeps your wording" — edits never AI-rewritten).

### 4.3 Visual Studio (`student.lab.use`)

- `POST /v1/student/lab/visuals` `{topic, format: 'mind_map'|'flowchart'}` → **one graph engine, two layout variants** (Overview): model returns graph spec (§6.2), stored as artifact kind `visual` (unsaved until save — actually: generate returns transient payload; `POST /lab/visuals/save` persists to Library under an auto-created "Visuals" collection).
- `POST /v1/student/lab/visuals/regenerate` `{spec, direction}` — "simpler" | "more detail on <branch>" | free text.
- `format:'diagram'` → 501 `{comingSoon:true}` (provider capability `rendered` deferred; UI shows the teaser state).

### 4.4 Mock exams (`student.lab.use`)

- `POST /v1/student/lab/mock-exams` — wizard payload `{subjectLabel, topics[], context:{level, board, mix, difficulty, durationMin}, referenceObjectId?, examGoalId?}`. Topic defaults come from the student's path (server suggests via `GET /lab/mock-exams/defaults`). Generation (large tier; reference paper → vision analysis of its structure first): writes questions (count/marks derived from duration+mix: 30min→10q, 60→20q, 90→30q; totalMarks per design 25 school/40 college defaults scaled by marks-per-question), status `ready`. Generation is async (BullMQ `ai` queue) with status polling `GET /lab/mock-exams/:id` → `generating|ready`.
- `POST .../:id/start` → attempt row (`ends_at = now + duration`), status `in_progress`. Server-authoritative timer; answers accepted until `ends_at + 30s` grace.
- `PUT .../:id/answers/:qid` `{choiceKey?|answerText?|photoObjectId?, flagged?}` — autosave; **no hints, no drawer** in taking mode (route omits the Ask tab).
- `POST .../:id/finish` → evaluator batch (mcq keys locally; short/long via small tier with `marking_note`; photos via vision) → `results` = **counts only** `{total, correct, byTopic:[{topic,total,correct,note}], suggestion}` where `note`/`suggestion` are qualitative evidence lines (design: "Two sign slips under time pressure", "Both sign slips happened after the 15-minute mark…"). Ledger `mock.completed` with byTopic payload. **No predicted scores, no percentile, ever.**
- `POST .../:id/retake-weak` → new mock pre-filled with topics where correct/total < 0.7 (threshold constant; used only for selection, never displayed), title "Retake — weak areas".

### 4.5 Debate (`student.lab.use`; friend mode behind flag `student.lab.debate_friend`)

- `POST /v1/student/lab/debates` `{motion, side, format, mode}` — motion free-text or from suggestions (`GET /lab/debates/motions` returns persona-appropriate samples; **any motion allowed**, topicality screen only blocks abuse via the shared moderation check, not topic choice). `surprise me` → server picks side at creation. Solo → stage `opening` (or `live`), creates Petros participant. Friend → stage `lobby`, generates invite token (`edrion.app` link path `/lab/debate/join/[token]`; hashed storage).
- `POST /v1/student/lab/debates/join/:token` — authenticated student/independent joins as `friend` (opposite side), stage advances when both present. Lobby polling `GET .../:id/lobby`.
- `POST .../:id/turns` `{text}` — validates it's the caller's turn (structured: opening→rebuttal→closing alternation with per-turn timer; expired turn auto-advances with a moderator note; quick_clash: free alternation, 12-turn cap); solo mode: after each student turn, Petros moderator note + opposing argument generated (large tier, streamed); friend mode: Petros only moderates (fairness notes, round transitions). Turn events via polling `GET .../:id?after=<seq>` (3s interval; SSE optional reuse of Plan 02 helper).
- `POST .../:id/finish` (or auto after closing) → feedback (large tier): `{strongest, weakest, technique}` (+ `perSide` both-participants variant in friend mode; "no winner banner" — schema has no winner field). Ledger `debate.completed`.
- Voice seam: `SpeechProvider { stt(audioStream): AsyncIterable<string>; tts(text): Promise<AudioRef> }` interface file + `debate_turns.audio_object_id` — **no implementation**.

### 4.6 Achievements (`student.achievements.view`)

Badge catalogue in `packages/shared-types/src/student-badges.ts`: 5 families × 3+ badges with **bronze/silver/gold tier thresholds**, definitions as pure predicate specs over ledger aggregates. Seed the catalogue with the design's 15 badges (§2.1 design `sAchieve` data: Steady week, Back for more [comeback badge — guilt-free], Full fortnight, Weekly goal, Chapter done, Path pioneer, Explainer, Detective, Hint-free solve, Curious mind, Lab visitor, First debate, First session, First deck, First mock) + tier ladders (e.g. Steady week: bronze = 5 active days in a week ×1, silver ×4 weeks lifetime, gold ×12). Rewards **learning behaviors, never raw time-on-app; never comparative** — predicates may only consume event counts/kinds, never durations-on-screen or cross-student data.
`achievements.processor.ts` (BullMQ, enqueued after ledger writes of relevant types + nightly sweep): evaluates predicates incrementally, inserts `achievement_awards` with `evidence_note` + event ids, ledger `achievement.unlocked`. Endpoint `GET /v1/student/achievements` → families with badges `{key, glyph, name, sub (earned date | progress label), earned, tier, progress?: {done,target}, note}` + `{earnedCount, total}`. Unlock moment: `/me`-adjacent poll — the app's toast layer shows unlock (persona-scaled: school = `popIn` badge toast + burst when celebration=warm; others = quiet toast).

### 4.7 History completion

Plan 02's `GET /v1/student/history` gains the two reserved feeds: Mock tests (`mock_exam_attempts` finished → "31/40 · sign errors flagged on Q4, Q7"-style meta from results counts+notes) and Debates (finished debates → format + one feedback fragment). Reopen: mock → results screen; debate → read-only room with feedback preserved.

## 5. Frontend — student-web

Route map (Overview §2.1): `/library` (`sLibrary`), `/library/[id]` (`sLibItem`), `/library/decks/[id]` (`sCards`), `/lab` (`sLab`), `/lab/visual` (`sVisual`), `/lab/mock-exams/new` (`sExSetup`), `/lab/mock-exams/[id]` (`sMockExam`), `/lab/mock-exams/[id]/results` (`sMockResults`), `/lab/debate` (`sDebate`), `/lab/debate/[id]/lobby` (`sDebateLobby`), `/lab/debate/[id]` (`sDebateRoom`), `/lab/debate/join/[token]` (redirect flow), `/achievements` (`sAchieve`), `/history` final (`sHistory`).

Screen specs (one-to-one with design):

1. **Library `sLibrary`**: header (eyebrow LIBRARY, serif "Your knowledge space", persona lead line `libLead`, ＋ Upload button); **empty state** exactly as designed (icon, "Your library starts with your first upload", camera-first CTA "📷 Take a photo of notes" + "Upload a PDF or doc"); search input (searches items+artifacts, server `?q=`); COLLECTIONS grid (color dot, name, count); RECENTLY ADDED chips row; MY UPLOADS list (kind chip PDF/SCAN with kind colors, title, meta line incl. "read by Petros ✦" when `ai_read`); GENERATED FOR ME ✦ grid (kind ✦ chip + `FreshnessChip`, title, meta, from-line). Upload flow: camera-first on mobile (input capture=environment, multi-page: sequential captures with thumbnail strip + drag-reorder before submit), PDF/doc picker on desktop; progress + processing state ("Petros is reading…") until `ready`.
2. **Item detail `sLibItem`**: back link, kind chip + title + meta header; document viewer pane (PDF: embedded pages with pager per design; scans: image pages with pager; extracted-text fallback view); **actions rail** "DO SOMETHING WITH THIS ✦": Summarize / Make flashcards / Make a quiz / **Tutor me on this** (primary, amber icon tile, "A Learn session grounded here") — each fires its endpoint with a working state, then routes (deck → `/library/decks/[id]`; tutor → session canvas; summary/quiz → inline artifact viewer sheet); "ALREADY MADE FROM THIS · {n}" nested artifact cards (provenance).
3. **Flashcards `sCards`**: deck cover (FLASHCARD DECK ✦ + freshness chip, serif title, CARDS/DUE TODAY count tiles, from-line, Study now → / Edit deck, freshness footnote line) → study mode (position "n of m", tap-to-flip card — PROMPT ivory / ANSWER deep-green inversion per design, ←/→, "Show me again soon" / "I've got this ✓" with toasts, spaced-repetition footnote). Deck editor sheet (reorder/rewrite/delete; plain CRUD).
4. **Lab home `sLab`**: eyebrow + serif "The workshop" + lead; three instrument cards (INSTRUMENT 01–03 tags, colored icon tiles, title/desc, Open →, YOUR RECENT chips from real latest rows); COMING SOON teaser card (draw-on-screen copy verbatim, no interaction).
5. **Visual Studio `sVisual`**: back link, serif title; input row (topic input + Generate ✦) + format chips (Mind map / Flowchart / **Diagram** → renders the coming-soon card state); output canvas card: header (subtitle line "Mind map · linked to {topic}" when topic matched to a `learn_topics` row, title; ↻ Regenerate + Save to Library); **`GraphCanvas`**: pannable/zoomable (pointer drag + wheel/pinch; CSS transform), mind-map layout (center node + radial branches with connector lines) and flowchart layout (vertical boxes + arrows + decision diamond) from the same graph spec; node tap → expand detail card ("tap to go deeper" hint); regenerate prompt sheet (chips "Simpler" / "More detail on…" + free text). Footer hint line per design.
6. **Mock wizard `sExSetup`**: eyebrow (when launched from exam context: "✦ PREPARE FOR EXAM · {exam} {date}"), serif "Build your mock test", 4-segment progress bar; Step 1 subject+topics (pre-picked chips from path — toggleable, from `defaults` endpoint); Step 2 context (level chips, board/curriculum chips — persona-appropriate lists from the design); Step 3 format (length/mix/difficulty chips); Step 4 reference paper (upload zone → uploaded card with "✓ Read — Petros will mirror its structure & weighting", ×) + summary rows (TOPICS/CONTEXT/FORMAT) + trust line ("Timed, but pausable. The result is evidence for you…") + Start. Generation wait state (streaming indicator card).
7. **Taking mode `sMockExam`**: header (MOCK TEST · {subject} ✦, "Question n of m", mono timer — red under 5:00 per design `exLow`, End test); question card (prompt with `MathText`, MCQ options / short-answer textarea / long-answer textarea + photo upload for handwritten per qtype), flag toggle (⚑ amber state), Next; right rail QUESTIONS `ExamPalette` (answered green / current ring / upcoming muted; tap to jump) + "n answered · on x · y to go"; footer "No hints during the test — Petros explains everything after…". Timer expiry → auto-finish with notice. No drawer on this route.
8. **Results `sMockResults`**: eyebrow MOCK TEST · FINISHED, serif "{correct} of {total} — and a clear picture", "Counts, not scores…" line; BY TOPIC rows (name, count colored by band, qualitative note); ✦ PETROS SUGGESTS card (suggestion text + CTAs: 10-min drill → refresh session on weakest topic, Another mock test → wizard, Review every question → per-question sheet with answers/evaluations).
9. **Debate setup `sDebate`**: back, serif "Set up a debate", lead; PICK A MOTION cards (motion + tag chip; free-text motion input row appended — "Or write your own motion…"); YOUR SIDE chips (For/Against/Surprise me); FORMAT cards (Quick clash "Free-flow, no timers" / Structured "Opening → rebuttal → closing"); CTAs Debate Petros → / Invite a friend.
10. **Lobby `sDebateLobby`**: eyebrow VERSUS A FRIEND · PETROS MODERATES, motion serif, share-link row (link + Copy link → toast), waiting state (podium pair, "Waiting for your friend to join" pulse) → joined state (both podiums, "Enter the debate stage →"). Join route: friend opens link → auth → joined.
11. **Debate room `sDebateRoom`**: stage chrome — header (← Leave, rounds tracker dots Opening/Rebuttal/Closing with state colors, mono turn timer), THE MOTION pinned card, podium row (you vs opponent, side tags), transcript (bubbles: yours right/green, opponent violet, moderator amber "✦ PETROS · MODERATOR"), YOUR REBUTTAL composer (textarea + "Petros moderates — it won't take a side…" + Submit turn →), post-debate feedback card (✦ heading per mode, Strongest argument / Weakest moment / One technique to try next, mode note, Debate again / Back to The Lab). Styled as a stage (centered column, elevated cards), **not** a chat app frame.
12. **Achievements `sAchieve`**: header (eyebrow, serif "Earned, with evidence", lead line, earned-count card "{earned} / {total} badges earned"); family chips; badge cards (glyph tile, name, sub = earned date or progress "9 of 14 days", progress bar when in-progress, locked at 60% opacity, tap → evidence note reveal + tier row Bronze/Silver/Gold with current tier filled). Unlock toast/moment per §4.6.
13. **History final `sHistory`**: Mock tests + Debates feeds live; search covers all types.

### Final integration pass (this plan, last milestone)

- **Home enrichment**: tiles now fully fed (continue-learning with real session, deadlines from 03, library due-decks tile for independents per design `phTiles`); Learn home rusty strip ↔ revision queue ↔ calendar learn-items cross-links verified; stream covered-topics → Learn; exam → prep plan → mock wizard chain; quick answer → "visual version" → `/lab/visual` prefilled (activate the Plan 02 link).
- **Empty states everywhere**: audit every route for zero-data render (new student, no institution data, flags off) — each gets designed empty copy (write them in the design voice; no bare "No data").
- **Theme verification**: run all routes in Ivory/Dim/Ink + match-system + reduced-motion + S/L text sizes; fix token leaks (any hardcoded hex in student-web is a defect — grep gate `grep -rn '#[0-9A-Fa-f]\{6\}' apps/student-web/src --include='*.tsx' | grep -v tokens` must return empty).
- **Performance pass**: route-level code splitting for KaTeX/GraphCanvas/PDF viewer (dynamic imports); list virtualization for history/library >100 rows; SSE/polling backoff; images lazy; Lighthouse mobile ≥85 on /learn, /library, /home with mid-tier throttling; bundle budget: first-load JS ≤ 250KB gz per route (report table in PR).

## 6. AI work

1. **Summary/flashcards/quiz generation** — small tier; input = extracted text (chunked ≤12k tokens; longer docs: map-reduce summarize); schemas: `summary {title, sections:[{heading, body}]}`, `deck {title, cards:[{prompt, answer}]}`, `quiz {items:[{qtype:'mcq'|'short', prompt, options?, correctKey?, markingNote?}]}`. Cached: no (per-document). Budgeted.
2. **Grounded tutoring** — Plan 02 planner/generator with grounding context; system prompt hard-scopes to the document ("If the document doesn't cover it, say so — do not import outside material silently").
3. **Graph generation** — large tier; schema `graph {layout:'mind_map'|'flowchart', center?:{label}, nodes:[{id,label,detail,color?,kind?:'process'|'decision'|'terminal'}], edges:[{from,to,label?}]}`; regenerate takes prior spec + direction. Client renders; no SVG strings from the model.
4. **Mock generation** — large tier (+vision pre-pass on reference paper → `{structureNote, weighting}` fed into the prompt); output = `mock_exam_questions[]` schema. Uniqueness: prompt requires fresh numbers each generation.
5. **Mock evaluation** — Plan 02 `EvaluatorService`; batch at finish; vision for photos; per-question `{correct, note}` + topic rollup + one `suggestion` paragraph (qualitative, time-pattern aware — timestamps of answers are available server-side).
6. **Debate turns/moderation/feedback** — large tier; turn schema `{argument}` (solo opponent), `{moderation}` (round notes), feedback schema `{strongest, weakest, technique, perSide?}` — **no winner/score fields**.
7. **OCR for scans** — vision tier when pdf text extraction empty; output plain text into `derived.extractedTextKey` object.
All calls: budgets + `learn_ai_calls` logging (purposes: `library_gen`, `visual`, `mock_gen`, `mock_eval`, `debate`, `ocr` — extend the purpose enum).

## 7. Institution-web additions

None — this plan's features are student-owned. (Save-from-Classes consumes Plan 03's materials read-only.) The only staff-visible change: nothing new appears in `learning-summary`/analytics DTOs (Library/Lab data is **never** shared — assert in DTO tests, matching the transparency panel).

## 8. Build order

1. Migrations 0056–0058 + schemas + RLS. *Verify*: clean migrate; RLS owner isolation; friend-participant read policy.
2. **Library core** — items/collections CRUD, upload+processing (incl. OCR path), item detail, save-from-classes activation. *Verify*: photo multi-page upload→reorder→ready with extracted text; PDF; save a Plan 03 material → provenance label; search.
3. **Generation rail + decks** — summarize/flashcards/quiz/tutor + deck study/review/scheduling + from-session deck button activation (Plan 02 wrap-up). *Verify*: all four actions produce artifacts with from-lines; quiz attempt scores as counts; SM-lite scheduling (again → due now, got-it ×2 → interval growth); "Tutor me" session cites only document content (spot prompt test); ledger rows (`library.*`, `flashcards.reviewed`, `quiz.completed`).
4. **Visual Studio** — generate/regenerate/save + GraphCanvas both layouts + Diagram coming-soon. *Verify*: pan/zoom/expand on touch + mouse; regenerate "simpler" reduces node count; saved visual appears in Library "Visuals".
5. **Mock exams** — wizard/generation/taking/finish/results/retake-weak + exam-goal prefill (03). *Verify*: timer authority (finish after `ends_at` rejected), palette/flag states, photo answer evaluated via vision fixture, results are counts+notes only (schema test: no score/percent fields), retake pre-fills weak topics, `mock.completed` ledger.
6. **Debate** — solo full loop; friend lobby/join/turns; feedback; voice seam files. *Verify*: structured round progression + timer auto-advance; quick clash cap; friend join via link second account; feedback lacks winner; read-only reopen; `debate.completed` ledger.
7. **Achievements** — catalogue, processor, screen, unlock moments. *Verify*: seed events → expected badges/tiers (unit-test every predicate); comeback badge fires after a gap+return; no badge references time-on-app; evidence tap shows note+events.
8. **History completion + integration pass** (cross-links, empty states, themes, perf gates as §5). *Verify*: history all five types + search; hex-grep gate empty; Lighthouse + bundle table; all 28 design screens reachable and themed.
9. **Smoke** `scripts/student-p4-smoke.sh` (target ≥55 assertions).
   *Acceptance*: all green; typecheck/lint; Library/Lab data absent from all staff-facing DTOs (tests); every ledger event type in the Overview catalogue is now emitted by at least one code path (assert with a coverage map test).

## 9. Anti-goals

- No image generation (Diagram = coming-soon), no voice build, no stylus canvas, no draw-on-screen beyond the teaser card.
- Mock results: no predicted scores, percentiles, grade estimates, or pass/fail verdicts — counts + evidence notes only.
- Debate: no winner banners, no scoring, no topic restrictions beyond abuse moderation; friend mode coaches both sides evenly.
- Achievements: never comparative (no leaderboards), never time-on-app, no guilt mechanics (a lapsed streak yields the comeback badge path, not a loss notice).
- Do not touch `library_books`/`library_loans` or their UI (physical library).
- Do not share any Library/Lab/History data with institution staff or parents.
- Flashcard "again" is never labeled failure; keep the design's supportive copy.
- Do not add a second spaced-repetition or freshness system — decks plug into the existing freshness language and constants.

## 10. Escalations

- Multi-page scan reorder UX on low-end devices (drag) — if unworkable, fall back to numbered tap-to-order; note it.
- Friend-debate realtime: polling at 3s is the v1 contract; if product wants sub-second, escalate (websocket infra doesn't exist in the API today).
- OCR quality on handwriting varies; if extraction confidence is unusable for grounding, the tutor action must say so explicitly (already required) — escalate only if product wants manual-transcription fallback UI.

## Contracts exposed

Terminal plan. Exposes to future work: `knowledge_items` grounding for any AI feature; `GraphCanvas` + graph spec; `SpeechProvider` seam; badge catalogue extension point; `ExamPalette`/`DeckCard`/`PodiumHeader` components; the completed ledger event coverage map.
