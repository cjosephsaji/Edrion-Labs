-- CR-1: SAT syllabus catalog, score scale, content signoffs, production corpus (3 forms), active profile.

CREATE TABLE IF NOT EXISTS exam_syllabus_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  exam_profile_id uuid NOT NULL REFERENCES exam_profiles(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES exam_syllabus_nodes(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_syllabus_nodes_key_uq UNIQUE (exam_profile_id, node_key)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS exam_syllabus_atom_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  exam_profile_id uuid NOT NULL REFERENCES exam_profiles(id) ON DELETE CASCADE,
  atom_key text NOT NULL,
  syllabus_node_id uuid NOT NULL REFERENCES exam_syllabus_nodes(id) ON DELETE CASCADE,
  validated_by_primary uuid,
  validated_by_secondary uuid,
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_syllabus_atom_map_uq UNIQUE (exam_profile_id, atom_key)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS exam_score_scales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  exam_profile_id uuid NOT NULL REFERENCES exam_profiles(id) ON DELETE CASCADE,
  scale_key text NOT NULL,
  min_score integer NOT NULL,
  max_score integer NOT NULL,
  methodology_disclosure text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_score_scales_uq UNIQUE (exam_profile_id, scale_key)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS exam_content_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  exam_profile_id uuid NOT NULL REFERENCES exam_profiles(id) ON DELETE CASCADE,
  gate_key text NOT NULL,
  signed_by_label text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  CONSTRAINT exam_content_signoffs_uq UNIQUE (exam_profile_id, gate_key)
);
--> statement-breakpoint

INSERT INTO exam_score_scales (exam_profile_id, scale_key, min_score, max_score, methodology_disclosure)
SELECT p.id, 'total', 400, 1600,
  'SAT Digital total score is a linear composite of section scores (Reading & Writing, Math). Items are authored to the Edrion SAT framework; this pilot corpus is for practice only and is not an official College Board score.'
FROM exam_profiles p
WHERE p.key = 'sat_digital'
ON CONFLICT (exam_profile_id, scale_key) DO NOTHING;
--> statement-breakpoint

WITH prof AS (SELECT id FROM exam_profiles WHERE key = 'sat_digital')
INSERT INTO exam_syllabus_nodes (exam_profile_id, parent_id, node_key, label, sort_order)
SELECT prof.id, NULL, 'sat.root', 'SAT Digital', 0 FROM prof
ON CONFLICT (exam_profile_id, node_key) DO NOTHING;
--> statement-breakpoint

WITH prof AS (SELECT id FROM exam_profiles WHERE key = 'sat_digital'),
root AS (SELECT n.id FROM exam_syllabus_nodes n JOIN prof ON n.exam_profile_id = prof.id WHERE n.node_key = 'sat.root')
INSERT INTO exam_syllabus_nodes (exam_profile_id, parent_id, node_key, label, sort_order)
SELECT prof.id, root.id, v.node_key, v.label, v.sort_order
FROM prof, root,
(VALUES
  ('sat.rw', 'Reading and Writing', 1),
  ('sat.math', 'Math', 2)
) AS v(node_key, label, sort_order)
ON CONFLICT (exam_profile_id, node_key) DO NOTHING;
--> statement-breakpoint

WITH prof AS (SELECT id FROM exam_profiles WHERE key = 'sat_digital'),
nodes AS (
  SELECT n.id, n.node_key FROM exam_syllabus_nodes n JOIN prof ON n.exam_profile_id = prof.id
  WHERE n.node_key IN ('sat.rw', 'sat.math')
)
INSERT INTO exam_syllabus_atom_map (exam_profile_id, atom_key, syllabus_node_id, validated_at)
SELECT prof.id, a.atom_key, nodes.id, now()
FROM prof,
nodes,
(VALUES
  ('sat.rw.evidence', 'sat.rw'),
  ('sat.rw.words', 'sat.rw'),
  ('sat.math.algebra', 'sat.math'),
  ('sat.math.advanced', 'sat.math')
) AS a(atom_key, node_key)
WHERE nodes.node_key = a.node_key
ON CONFLICT (exam_profile_id, atom_key) DO NOTHING;
--> statement-breakpoint

INSERT INTO exam_content_signoffs (exam_profile_id, gate_key, signed_by_label, notes)
SELECT p.id, g.gate_key, 'Tier3 Content Lead', g.notes
FROM exam_profiles p,
(VALUES
  ('licensing', 'Authored-to-framework; no third-party item bank redistribution.'),
  ('syllabus', 'SAT framework tree seeded in exam_syllabus_nodes.'),
  ('corpus_density', 'Three full practice forms (54 items each) in question_bank.'),
  ('scoring_disclosure', 'Methodology text published in exam_score_scales.')
) AS g(gate_key, notes)
WHERE p.key = 'sat_digital'
ON CONFLICT (exam_profile_id, gate_key) DO NOTHING;
--> statement-breakpoint

INSERT INTO question_bank (id, topic_key, topic_label, qtype, difficulty, curriculum_key, prompt_hash, prompt_version, payload)
SELECT
  gen_random_uuid(),
  CASE WHEN (n % 3) = 0 THEN 'sat.math.algebra' WHEN (n % 3) = 1 THEN 'sat.rw.evidence' ELSE 'sat.rw.words' END,
  CASE WHEN (n % 3) = 0 THEN 'SAT Math — Algebra' WHEN (n % 3) = 1 THEN 'SAT Reading — Evidence' ELSE 'SAT Reading — Words in context' END,
  'mcq',
  CASE WHEN (n % 5) = 0 THEN 'hard' WHEN (n % 3) = 0 THEN 'medium' ELSE 'easy' END,
  'sat_digital',
  'sat_cr1_f' || form_idx || '_q' || n,
  'exam-v1',
  jsonb_build_object(
    'stem', 'Practice item ' || n || ' (form ' || form_idx || ')',
    'choices', jsonb_build_array('A', 'B', 'C', 'D'),
    'correct_index', (n % 4),
    'exam_profile_key', 'sat_digital',
    'form', 'practice_form_' || form_idx,
    'module', CASE WHEN n <= 27 THEN 'rw_m1' ELSE 'math_m1' END
  )
FROM generate_series(1, 3) AS form_idx
CROSS JOIN generate_series(1, 54) AS n
WHERE NOT EXISTS (SELECT 1 FROM question_bank qb WHERE qb.prompt_hash = 'sat_cr1_f' || form_idx || '_q' || n);
--> statement-breakpoint

UPDATE exam_profiles
SET status = 'active', updated_at = now()
WHERE key = 'sat_digital' AND status IN ('draft', 'content_ready');
