-- Dev/demo SAT CR-1 minimum corpus (question_bank rows tagged for sat_digital).

INSERT INTO question_bank (id, topic_key, topic_label, qtype, difficulty, curriculum_key, prompt_hash, prompt_version, payload)
SELECT
  gen_random_uuid(),
  'sat.evidence',
  'SAT Reading — Evidence',
  'mcq',
  'medium',
  'sat_digital',
  'sat_dev_rw_1',
  'exam-v1',
  '{"stem":"Which choice best states the main idea?","choices":["Climate policy is unnecessary","Renewable storage improves grid reliability","Fossil fuels are cheapest","Urban sprawl is inevitable"],"correct_index":1,"exam_profile_key":"sat_digital","module":"rw_m1"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM question_bank WHERE prompt_hash = 'sat_dev_rw_1');
--> statement-breakpoint
INSERT INTO question_bank (id, topic_key, topic_label, qtype, difficulty, curriculum_key, prompt_hash, prompt_version, payload)
SELECT
  gen_random_uuid(),
  'sat.algebra',
  'SAT Math — Algebra',
  'mcq',
  'easy',
  'sat_digital',
  'sat_dev_math_1',
  'exam-v1',
  '{"stem":"If 3x + 5 = 20, what is x?","choices":["3","5","7","15"],"correct_index":1,"exam_profile_key":"sat_digital","module":"math_m1"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM question_bank WHERE prompt_hash = 'sat_dev_math_1');
--> statement-breakpoint
UPDATE exam_profiles SET status = 'content_ready' WHERE key = 'sat_digital' AND status = 'draft';
