-- Library FSRS migration (Phase 1): extend flashcards/reviews/decks, add review workspace tables, pgvector.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'pgvector extension is required for library knowledge_chunks but could not be created — enable vector on the Supabase instance before applying this migration';
  WHEN undefined_file THEN
    RAISE EXCEPTION 'pgvector extension is not installed on this Postgres instance — install vector before applying 0094_library_fsrs';
END $$;
--> statement-breakpoint

-- flashcards: FSRS columns + timestamps (A1)
ALTER TABLE flashcards
  ADD COLUMN IF NOT EXISTS srs_state text,
  ADD COLUMN IF NOT EXISTS stability real,
  ADD COLUMN IF NOT EXISTS difficulty real,
  ADD COLUMN IF NOT EXISTS fsrs_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduler text NOT NULL DEFAULT 'sm2',
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS fsrs_params_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_ref jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE flashcards ADD CONSTRAINT flashcards_srs_state_ck
    CHECK (srs_state IS NULL OR srs_state IN ('new','learning','review','relearning'));
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
UPDATE flashcards
SET
  created_at = COALESCE(created_at, next_due_at),
  updated_at = COALESCE(updated_at, next_due_at),
  fsrs_due_at = COALESCE(fsrs_due_at, next_due_at)
WHERE fsrs_due_at IS NULL OR created_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS flashcards_fsrs_due_at_idx ON flashcards (fsrs_due_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS flashcards_due_predicate_idx ON flashcards (fsrs_due_at) WHERE suspended_at IS NULL;
--> statement-breakpoint

-- flashcard_decks: archive + subject link + exam boost opt-out
ALTER TABLE flashcard_decks
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS subject_ref jsonb,
  ADD COLUMN IF NOT EXISTS exam_boost_opt_out boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- flashcard_reviews: FSRS audit columns + idempotency (A2)
ALTER TABLE flashcard_reviews
  ADD COLUMN IF NOT EXISTS grade text,
  ADD COLUMN IF NOT EXISTS state_before text,
  ADD COLUMN IF NOT EXISTS state_after text,
  ADD COLUMN IF NOT EXISTS due_before timestamptz,
  ADD COLUMN IF NOT EXISTS due_after timestamptz,
  ADD COLUMN IF NOT EXISTS elapsed_ms integer,
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS client_review_id uuid;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS flashcard_reviews_student_client_uq
  ON flashcard_reviews (student_id, client_review_id)
  WHERE student_id IS NOT NULL AND client_review_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS flashcard_reviews_indep_client_uq
  ON flashcard_reviews (independent_user_id, client_review_id)
  WHERE independent_user_id IS NOT NULL AND client_review_id IS NOT NULL;
--> statement-breakpoint

-- library_quiz_attempts: widen patterns default (A5)
ALTER TABLE library_quiz_attempts ALTER COLUMN patterns SET DEFAULT '{}'::jsonb;
--> statement-breakpoint
UPDATE library_quiz_attempts
SET patterns = jsonb_build_object(
  'per_question', '[]'::jsonb,
  'per_topic', '{}'::jsonb,
  'difficulty', 1,
  'source_knowledge_item_id', null
)
WHERE jsonb_typeof(patterns) = 'array';
--> statement-breakpoint

-- knowledge_items: index stage + embedding metadata (A8, A9)
ALTER TABLE knowledge_items
  ADD COLUMN IF NOT EXISTS index_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS embedding_model text,
  ADD COLUMN IF NOT EXISTS embedding_dimension integer;
--> statement-breakpoint

-- review_sessions
CREATE TABLE IF NOT EXISTS review_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  cards_reviewed integer NOT NULL DEFAULT 0,
  source text NOT NULL,
  deck_id uuid,
  CONSTRAINT review_sessions_owner_xor CHECK (num_nonnulls(student_id, independent_user_id) = 1)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS review_sessions_student_idx ON review_sessions (student_id, started_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS review_sessions_indep_idx ON review_sessions (independent_user_id, started_at DESC);
--> statement-breakpoint

-- user_streaks
CREATE TABLE IF NOT EXISTS user_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'daily',
  current integer NOT NULL DEFAULT 0,
  best integer NOT NULL DEFAULT 0,
  freeze_tokens integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_streaks_owner_xor CHECK (num_nonnulls(student_id, independent_user_id) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS user_streaks_student_unique ON user_streaks (student_id) WHERE student_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS user_streaks_indep_unique ON user_streaks (independent_user_id) WHERE independent_user_id IS NOT NULL;
--> statement-breakpoint

-- streak_events (append-only)
CREATE TABLE IF NOT EXISTS streak_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  date date NOT NULL,
  credited_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT streak_events_owner_xor CHECK (num_nonnulls(student_id, independent_user_id) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS streak_events_student_date_uq ON streak_events (student_id, date) WHERE student_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS streak_events_indep_date_uq ON streak_events (independent_user_id, date) WHERE independent_user_id IS NOT NULL;
--> statement-breakpoint

-- knowledge_chunks (page-aligned retrieval index)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_item_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  page integer NOT NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding vector(1536),
  CONSTRAINT knowledge_chunks_owner_xor CHECK (num_nonnulls(student_id, independent_user_id) = 1),
  CONSTRAINT knowledge_chunks_item_chunk_uq UNIQUE (knowledge_item_id, page, chunk_index)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_chunks_item_page_idx ON knowledge_chunks (knowledge_item_id, page, chunk_index);
--> statement-breakpoint

-- knowledge_item_chats
CREATE TABLE IF NOT EXISTS knowledge_item_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_item_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_item_chats_owner_xor CHECK (num_nonnulls(student_id, independent_user_id) = 1)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_item_chats_item_idx ON knowledge_item_chats (knowledge_item_id, created_at);
--> statement-breakpoint

-- generation_jobs (curation pass drafts)
CREATE TABLE IF NOT EXISTS generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_item_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  proposals jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generation_jobs_owner_xor CHECK (num_nonnulls(student_id, independent_user_id) = 1)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS generation_jobs_item_idx ON generation_jobs (knowledge_item_id, created_at DESC);
--> statement-breakpoint

-- library_notes
CREATE TABLE IF NOT EXISTS library_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  title text NOT NULL,
  doc jsonb NOT NULL DEFAULT '{}'::jsonb,
  subject_ref jsonb,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(doc->>'type', '')), 'B')
  ) STORED,
  CONSTRAINT library_notes_owner_xor CHECK (num_nonnulls(student_id, independent_user_id) = 1)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS library_notes_search_idx ON library_notes USING gin (search_vector);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS library_notes_student_idx ON library_notes (student_id, updated_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS library_notes_indep_idx ON library_notes (independent_user_id, updated_at DESC);
--> statement-breakpoint

-- user_review_prefs
CREATE TABLE IF NOT EXISTS user_review_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  daily_reminder_time text,
  new_cards_per_day integer NOT NULL DEFAULT 20,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_review_prefs_owner_xor CHECK (num_nonnulls(student_id, independent_user_id) = 1),
  CONSTRAINT user_review_prefs_new_cards_ck CHECK (new_cards_per_day BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS user_review_prefs_student_unique ON user_review_prefs (student_id) WHERE student_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS user_review_prefs_indep_unique ON user_review_prefs (independent_user_id) WHERE independent_user_id IS NOT NULL;
--> statement-breakpoint

-- Feature flags (A10)
INSERT INTO feature_definitions (key, name, description, module, status, default_value, available_scopes, dependencies, release_stage, owner)
VALUES
  ('library.exam_aware_scheduling', 'Library exam-aware scheduling', 'Cap FSRS intervals before linked exams', 'student-portal', 'active', true, '["global","plan","institution","campus","institution_user"]', '["student.surface.library"]', 'ga', 'student-experience'),
  ('library.daily_reminder', 'Library daily reminder', 'Push reminder when review cards are due', 'student-portal', 'active', true, '["global","plan","institution","campus","institution_user","independent_user"]', '["student.surface.library"]', 'ga', 'student-experience'),
  ('library.mindmap_stub', 'Library mind map stub', 'Show mind map coming-soon sheet', 'student-portal', 'active', true, '["global","plan","institution","campus","institution_user","independent_user"]', '["student.surface.library"]', 'ga', 'student-experience')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  default_value = EXCLUDED.default_value,
  dependencies = EXCLUDED.dependencies;
