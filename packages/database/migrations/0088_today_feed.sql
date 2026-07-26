-- Today Feed Phase 1: dual-owner personal tables and normal feature definitions.
CREATE TABLE IF NOT EXISTS user_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE, independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'self' CHECK (source IN ('self','plan_engine')),
  kind text NOT NULL CHECK (kind IN ('study_block','mock','review','custom')), title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  due_at timestamptz NOT NULL, all_day boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','dismissed','expired')),
  deep_link text, done_at timestamptz, idempotency_key text, version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_obligations_owner_xor CHECK (num_nonnulls(student_id, independent_user_id)=1)
);
CREATE INDEX IF NOT EXISTS user_obligations_student_pending_idx ON user_obligations(student_id,due_at) WHERE student_id IS NOT NULL AND status='pending';
CREATE INDEX IF NOT EXISTS user_obligations_independent_pending_idx ON user_obligations(independent_user_id,due_at) WHERE independent_user_id IS NOT NULL AND status='pending';
CREATE UNIQUE INDEX IF NOT EXISTS user_obligations_student_idem_unique ON user_obligations(student_id,idempotency_key) WHERE student_id IS NOT NULL AND idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_obligations_independent_idem_unique ON user_obligations(independent_user_id,idempotency_key) WHERE independent_user_id IS NOT NULL AND idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS feed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL, campus_id uuid,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE, independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  event_key text NOT NULL, type text NOT NULL CHECK (type IN ('announcement','marks_released','request_update','club_event','nudge')),
  source_module text NOT NULL, title text NOT NULL, body text NOT NULL CHECK (char_length(body)<=200), deep_link text NOT NULL,
  occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_events_owner_xor CHECK (num_nonnulls(student_id, independent_user_id)=1)
);
CREATE UNIQUE INDEX IF NOT EXISTS feed_events_student_event_unique ON feed_events(student_id,event_key) WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS feed_events_independent_event_unique ON feed_events(independent_user_id,event_key) WHERE independent_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS feed_events_student_timeline_idx ON feed_events(student_id,occurred_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS feed_events_independent_timeline_idx ON feed_events(independent_user_id,occurred_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS today_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE, independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  home_stat_chips text[] NOT NULL DEFAULT '{}', module_notifications jsonb NOT NULL DEFAULT '{}', ribbon_dismissed_ids text[] NOT NULL DEFAULT '{}',
  last_nudge_at timestamptz, quiet_hours_override jsonb, held_notification_events jsonb NOT NULL DEFAULT '[]', quiet_release_at timestamptz,
  version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT today_preferences_owner_xor CHECK (num_nonnulls(student_id,independent_user_id)=1)
);
CREATE UNIQUE INDEX IF NOT EXISTS today_preferences_student_unique ON today_preferences(student_id) WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS today_preferences_independent_unique ON today_preferences(independent_user_id) WHERE independent_user_id IS NOT NULL;

-- Index-served single source for both the review chip and synthetic obligation.
CREATE INDEX IF NOT EXISTS flashcards_next_due_at_idx ON flashcards(next_due_at);

INSERT INTO feature_definitions(key,name,description,module,status,default_value,available_scopes,dependencies,release_stage,owner)
VALUES
 ('student.surface.today','Today','Student daily reader','student-portal','active',true,'["global","plan","institution","campus","institution_user","independent_user"]','[]','ga','student-experience'),
 ('student.today.petros_nudge','Today Petros nudge','Signal-gated daily nudge','student-portal','active',true,'["global","plan","institution","campus","institution_user","independent_user"]','["student.surface.today"]','ga','student-experience'),
 ('student.today.status_ribbon','Today status ribbon','Urgent status ribbon','student-portal','active',true,'["global","plan","institution","campus","institution_user","independent_user"]','["student.surface.today"]','ga','student-experience')
ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,module=EXCLUDED.module,default_value=EXCLUDED.default_value,dependencies=EXCLUDED.dependencies;

GRANT SELECT,INSERT,UPDATE ON user_obligations,today_preferences TO edrion_app;
GRANT SELECT,INSERT ON feed_events TO edrion_app;
REVOKE UPDATE,DELETE,TRUNCATE ON feed_events FROM edrion_app;
