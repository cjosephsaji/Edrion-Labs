-- Debate P1 phase 1: core schema, canvas FK, artefact tables (flags/seeds in 0111–0112).

ALTER TABLE debates
  ADD COLUMN IF NOT EXISTS format_key text,
  ADD COLUMN IF NOT EXISTS format_version integer,
  ADD COLUMN IF NOT EXISTS motion_id uuid,
  ADD COLUMN IF NOT EXISTS motion_text text,
  ADD COLUMN IF NOT EXISTS motion_info_slide text,
  ADD COLUMN IF NOT EXISTS prep_seconds integer,
  ADD COLUMN IF NOT EXISTS scaffolds_enabled boolean,
  ADD COLUMN IF NOT EXISTS ai_opponent_difficulty text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS consent_policy_version text,
  ADD COLUMN IF NOT EXISTS retention_policy jsonb,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_turn_index integer,
  ADD COLUMN IF NOT EXISTS score_confidence text;
--> statement-breakpoint

UPDATE debates SET status = CASE
  WHEN stage IN ('setup', 'lobby') THEN 'draft'
  WHEN stage = 'opening' THEN 'prep'
  WHEN stage = 'live' THEN 'speaking'
  WHEN stage = 'done' THEN 'report_ready'
  ELSE COALESCE(status, 'draft')
END
WHERE status IS NULL;
--> statement-breakpoint

UPDATE debates SET motion_text = motion WHERE motion_text IS NULL;
--> statement-breakpoint

ALTER TABLE debates
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN current_turn_index SET DEFAULT 0;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE debates ADD CONSTRAINT debates_status_ck CHECK (
    status IN (
      'draft', 'consent_required', 'prep', 'speaking', 'capture_complete',
      'adjudicating', 'report_ready', 'abandoned', 'adjudication_failed'
    )
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS debates_status_active_idx
  ON debates (status)
  WHERE status NOT IN ('report_ready', 'abandoned', 'adjudication_failed');
--> statement-breakpoint

ALTER TABLE debate_participants
  ADD COLUMN IF NOT EXISTS seat_key text,
  ADD COLUMN IF NOT EXISTS participant_kind text,
  ADD COLUMN IF NOT EXISTS ai_persona_key text,
  ADD COLUMN IF NOT EXISTS tts_voice_key text,
  ADD COLUMN IF NOT EXISTS consent_id uuid,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS left_at timestamptz;
--> statement-breakpoint

ALTER TABLE debate_turns
  ADD COLUMN IF NOT EXISTS turn_index integer,
  ADD COLUMN IF NOT EXISTS seat_key text,
  ADD COLUMN IF NOT EXISTS speech_kind text,
  ADD COLUMN IF NOT EXISTS planned_duration_ms integer,
  ADD COLUMN IF NOT EXISTS actual_duration_ms integer,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS overtime_ms integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS text_content text,
  ADD COLUMN IF NOT EXISTS capture_state text,
  ADD COLUMN IF NOT EXISTS stt_state text,
  ADD COLUMN IF NOT EXISTS transcript_id uuid,
  ADD COLUMN IF NOT EXISTS audio_seam jsonb;
--> statement-breakpoint

UPDATE debate_turns SET turn_index = sequence WHERE turn_index IS NULL;
--> statement-breakpoint

ALTER TABLE debate_turns ALTER COLUMN text DROP NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS debate_formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  version integer NOT NULL,
  origin text NOT NULL,
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  short_name text NOT NULL,
  spec jsonb NOT NULL DEFAULT '{}',
  adjudication_template_key text NOT NULL DEFAULT 'two_side_winner',
  score_scale jsonb NOT NULL DEFAULT '{}',
  calibration_state jsonb NOT NULL DEFAULT '{"confidence":"beta"}',
  is_buildable boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debate_formats_origin_ck CHECK (origin IN ('system', 'institution', 'user')),
  CONSTRAINT debate_formats_owner_ck CHECK (
    origin = 'system'
    OR (student_id IS NOT NULL AND independent_user_id IS NULL)
    OR (student_id IS NULL AND independent_user_id IS NOT NULL)
    OR (institution_id IS NOT NULL AND student_id IS NULL AND independent_user_id IS NULL)
  )
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS debate_formats_key_version_uq ON debate_formats (key, version);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS debate_motions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  origin text NOT NULL,
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  text text NOT NULL,
  info_slide text,
  themes text[] NOT NULL DEFAULT '{}',
  difficulty integer NOT NULL DEFAULT 3,
  format_hints text[] NOT NULL DEFAULT '{}',
  source text,
  is_retired boolean NOT NULL DEFAULT false,
  usage_count integer NOT NULL DEFAULT 0,
  nsfw_flags jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debate_motions_origin_ck CHECK (origin IN ('system', 'institution', 'user', 'ai_generated')),
  CONSTRAINT debate_motions_difficulty_ck CHECK (difficulty BETWEEN 1 AND 5)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS debate_motions_themes_gin ON debate_motions USING gin (themes);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE debates ADD CONSTRAINT debates_motion_id_fk
    FOREIGN KEY (motion_id) REFERENCES debate_motions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS debate_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  debate_id uuid NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES debate_participants(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  policy_version text NOT NULL,
  scopes jsonb NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL DEFAULT 'explicit_checkboxes',
  evidence jsonb NOT NULL DEFAULT '{}',
  guardian_consent_id uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE debate_participants ADD CONSTRAINT debate_participants_consent_id_fk
    FOREIGN KEY (consent_id) REFERENCES debate_consents(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS debate_participants_debate_seat_uq
  ON debate_participants (debate_id, seat_key)
  WHERE seat_key IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS debate_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  debate_id uuid NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL REFERENCES debate_turns(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_model text NOT NULL,
  language text NOT NULL DEFAULT 'en-IN',
  text text NOT NULL,
  words jsonb NOT NULL DEFAULT '[]',
  duration_ms integer NOT NULL DEFAULT 0,
  mean_confidence numeric,
  low_conf_spans jsonb NOT NULL DEFAULT '[]',
  metrics jsonb NOT NULL DEFAULT '{}',
  display_text text,
  display_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debate_transcripts_subject_ck CHECK (
    (student_id IS NOT NULL AND independent_user_id IS NULL)
    OR (student_id IS NULL AND independent_user_id IS NOT NULL)
  )
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS debate_transcripts_turn_uq ON debate_transcripts (turn_id);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE debate_turns ADD CONSTRAINT debate_turns_transcript_id_fk
    FOREIGN KEY (transcript_id) REFERENCES debate_transcripts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS debate_adjudication_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  debate_id uuid NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  run_trigger text NOT NULL DEFAULT 'auto',
  pipeline_version text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  stage_states jsonb NOT NULL DEFAULT '{}',
  total_cost_micros integer NOT NULL DEFAULT 0,
  total_latency_ms integer NOT NULL DEFAULT 0,
  error jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debate_adjudication_runs_trigger_ck CHECK (run_trigger IN ('auto', 'manual_rejudge', 'calibration_replay')),
  CONSTRAINT debate_adjudication_runs_status_ck CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed', 'partial')
  ),
  CONSTRAINT debate_adjudication_runs_subject_ck CHECK (
    (student_id IS NOT NULL AND independent_user_id IS NULL)
    OR (student_id IS NULL AND independent_user_id IS NOT NULL)
  )
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS debate_adjudication_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  run_id uuid NOT NULL REFERENCES debate_adjudication_runs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  subject_turn_id uuid REFERENCES debate_turns(id) ON DELETE SET NULL,
  prompt_template_key text NOT NULL,
  prompt_template_version integer NOT NULL,
  model text NOT NULL,
  temperature numeric,
  input_digest text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  cost_micros integer NOT NULL DEFAULT 0,
  attempt integer NOT NULL DEFAULT 1,
  validation_errors jsonb,
  output jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS debate_speech_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  run_id uuid NOT NULL REFERENCES debate_adjudication_runs(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL REFERENCES debate_turns(id) ON DELETE CASCADE,
  debate_id uuid NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  arguments jsonb NOT NULL DEFAULT '[]',
  rebuttals jsonb NOT NULL DEFAULT '[]',
  dropped_by_opponent jsonb NOT NULL DEFAULT '[]',
  role_fulfilment jsonb NOT NULL DEFAULT '{}',
  manner jsonb NOT NULL DEFAULT '{}',
  quotes jsonb NOT NULL DEFAULT '[]',
  anatomy_axis_scores jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS debate_clashes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  run_id uuid NOT NULL REFERENCES debate_adjudication_runs(id) ON DELETE CASCADE,
  debate_id uuid NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  order_index integer NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  prop_argument_refs jsonb NOT NULL DEFAULT '[]',
  opp_argument_refs jsonb NOT NULL DEFAULT '[]',
  winner text NOT NULL,
  margin text NOT NULL,
  reasoning text NOT NULL,
  weight numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debate_clashes_winner_ck CHECK (winner IN ('proposition', 'opposition', 'tied')),
  CONSTRAINT debate_clashes_margin_ck CHECK (margin IN ('clear', 'narrow', 'tied'))
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS debate_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  run_id uuid NOT NULL UNIQUE REFERENCES debate_adjudication_runs(id) ON DELETE CASCADE,
  debate_id uuid NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  ranking jsonb NOT NULL DEFAULT '[]',
  winner text NOT NULL,
  reasoning text NOT NULL,
  decisive_clash_id uuid REFERENCES debate_clashes(id) ON DELETE SET NULL,
  score_confidence text NOT NULL DEFAULT 'beta',
  template_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS debate_speaker_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  run_id uuid NOT NULL REFERENCES debate_adjudication_runs(id) ON DELETE CASCADE,
  debate_id uuid NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  turn_id uuid REFERENCES debate_turns(id) ON DELETE SET NULL,
  participant_id uuid REFERENCES debate_participants(id) ON DELETE SET NULL,
  score numeric NOT NULL,
  scale jsonb NOT NULL DEFAULT '{}',
  band_label text,
  axis_scores jsonb NOT NULL DEFAULT '{}',
  confidence text NOT NULL DEFAULT 'beta',
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS debate_feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  run_id uuid NOT NULL UNIQUE REFERENCES debate_adjudication_runs(id) ON DELETE CASCADE,
  debate_id uuid NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  per_speaker jsonb NOT NULL DEFAULT '[]',
  round_summary text NOT NULL DEFAULT '',
  share_token text,
  share_scope text NOT NULL DEFAULT 'private',
  pdf_object_id uuid REFERENCES storage_objects(id) ON DELETE SET NULL,
  viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debate_feedback_reports_subject_ck CHECK (
    (student_id IS NOT NULL AND independent_user_id IS NULL)
    OR (student_id IS NULL AND independent_user_id IS NOT NULL)
  ),
  CONSTRAINT debate_feedback_reports_share_scope_ck CHECK (share_scope IN ('private', 'link', 'institution'))
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS debate_prep_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  debate_id uuid NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  blocks jsonb NOT NULL DEFAULT '[]',
  scaffold_template_key text,
  ai_assist_used boolean NOT NULL DEFAULT false,
  ai_assist_events jsonb NOT NULL DEFAULT '[]',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debate_prep_notes_subject_ck CHECK (
    (student_id IS NOT NULL AND independent_user_id IS NULL)
    OR (student_id IS NULL AND independent_user_id IS NOT NULL)
  )
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS debate_prep_notes_debate_owner_uq
  ON debate_prep_notes (debate_id, COALESCE(student_id::text, independent_user_id::text));
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS debate_skill_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  format_key text NOT NULL,
  as_of date NOT NULL,
  rounds_counted integer NOT NULL DEFAULT 0,
  axis_ewma jsonb NOT NULL DEFAULT '{}',
  manner jsonb NOT NULL DEFAULT '{}',
  role_fulfilment_ewma numeric,
  focus_directive_history jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debate_skill_snapshots_subject_ck CHECK (
    (student_id IS NOT NULL AND independent_user_id IS NULL)
    OR (student_id IS NULL AND independent_user_id IS NOT NULL)
  )
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS debate_skill_snapshots_owner_format_day_uq
  ON debate_skill_snapshots (format_key, as_of, COALESCE(student_id::text, independent_user_id::text));
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS debate_ai_opponent_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  debate_id uuid NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL REFERENCES debate_turns(id) ON DELETE CASCADE,
  persona_key text NOT NULL,
  difficulty text NOT NULL,
  input_digest text NOT NULL,
  script text NOT NULL,
  plan jsonb NOT NULL DEFAULT '{}',
  tts_object_id uuid REFERENCES storage_objects(id) ON DELETE SET NULL,
  tts_provider text,
  tts_voice_key text,
  tts_duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS debate_motion_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  themes text[] NOT NULL DEFAULT '{}',
  difficulty integer NOT NULL,
  format_key text NOT NULL,
  seed text NOT NULL,
  motions jsonb NOT NULL DEFAULT '[]',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS debate_motion_suggestions_lookup_idx
  ON debate_motion_suggestions (format_key, difficulty, seed);
--> statement-breakpoint

ALTER TABLE visual_canvases
  ADD COLUMN IF NOT EXISTS debate_id uuid REFERENCES debates(id) ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS visual_canvases_debate_id_idx
  ON visual_canvases (debate_id)
  WHERE debate_id IS NOT NULL;
