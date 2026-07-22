-- Mock Exams system paper pack (PLAN-MOCK-EXAMS D2 / Part A §2).
-- Idempotent on exam_paper_patterns.key. Does NOT duplicate cbse_8_10 / ktu_university / chapter_test.

INSERT INTO "exam_paper_patterns" ("id", "key", "name", "board", "level_label", "duration_min", "total_marks", "sections", "description")
VALUES
(
  'a1000000-0000-4000-8000-000000000010',
  'jee_main',
  'JEE Main',
  'NTA',
  'Entrance',
  180,
  300,
  '[
    {"id":"phy","name":"Physics","questionCount":25,"questionTypes":["mcq_single","numerical"],"marksPerQuestion":4,"negative":{"mode":"fraction","value":0.25},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":true},
    {"id":"chem","name":"Chemistry","questionCount":25,"questionTypes":["mcq_single","numerical"],"marksPerQuestion":4,"negative":{"mode":"fraction","value":0.25},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":true},
    {"id":"math","name":"Mathematics","questionCount":25,"questionTypes":["mcq_single","numerical"],"marksPerQuestion":4,"negative":{"mode":"fraction","value":0.25},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":true}
  ]'::jsonb,
  'JEE Main per subject-set: 20 MCQ + 5 numerical style mix per section @ +4/−0.25. Skin nta.'
),
(
  'a1000000-0000-4000-8000-000000000011',
  'neet_ug',
  'NEET-UG',
  'NTA',
  'Entrance',
  200,
  720,
  '[
    {"id":"phy","name":"Physics","questionCount":45,"questionTypes":["mcq_single"],"marksPerQuestion":4,"negative":{"mode":"fixed","value":1},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":true},
    {"id":"chem","name":"Chemistry","questionCount":45,"questionTypes":["mcq_single"],"marksPerQuestion":4,"negative":{"mode":"fixed","value":1},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":true},
    {"id":"bot","name":"Botany","questionCount":45,"questionTypes":["mcq_single"],"marksPerQuestion":4,"negative":{"mode":"fixed","value":1},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":true},
    {"id":"zoo","name":"Zoology","questionCount":45,"questionTypes":["mcq_single"],"marksPerQuestion":4,"negative":{"mode":"fixed","value":1},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":true}
  ]'::jsonb,
  'NEET-UG: 45 MCQ each Phy/Chem/Bot/Zoo @ +4/−1. Skin nta.'
),
(
  'a1000000-0000-4000-8000-000000000012',
  'cbse_x_maths',
  'CBSE X — Maths',
  'CBSE',
  'Class X',
  180,
  80,
  '[
    {"id":"sec-a","name":"Section A","questionCount":20,"questionTypes":["mcq_single","fill_blank"],"marksPerQuestion":1,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":false},
    {"id":"sec-b","name":"Section B","questionCount":5,"questionTypes":["short_answer"],"marksPerQuestion":2,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":false},
    {"id":"sec-c","name":"Section C","questionCount":6,"questionTypes":["short_answer"],"marksPerQuestion":3,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":false},
    {"id":"sec-d","name":"Section D","questionCount":4,"questionTypes":["long_answer"],"marksPerQuestion":5,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":false}
  ]'::jsonb,
  'CBSE X Maths 2024+ typology. Skin paper, ai_assisted.'
),
(
  'a1000000-0000-4000-8000-000000000013',
  'cbse_x_science',
  'CBSE X — Science',
  'CBSE',
  'Class X',
  180,
  80,
  '[
    {"id":"sec-a","name":"Section A","questionCount":20,"questionTypes":["mcq_single","assertion_reason"],"marksPerQuestion":1,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":false},
    {"id":"sec-b","name":"Section B","questionCount":6,"questionTypes":["short_answer"],"marksPerQuestion":2,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":false},
    {"id":"sec-c","name":"Section C","questionCount":7,"questionTypes":["short_answer"],"marksPerQuestion":3,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":false},
    {"id":"sec-d","name":"Section D","questionCount":3,"questionTypes":["long_answer","case_based"],"marksPerQuestion":5,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":false}
  ]'::jsonb,
  'CBSE X Science. Skin paper.'
),
(
  'a1000000-0000-4000-8000-000000000014',
  'cbse_xii_physics',
  'CBSE XII — Physics',
  'CBSE',
  'Class XII',
  180,
  70,
  '[
    {"id":"sec-a","name":"Section A","questionCount":16,"questionTypes":["mcq_single","assertion_reason"],"marksPerQuestion":1,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":false},
    {"id":"sec-b","name":"Section B","questionCount":5,"questionTypes":["short_answer"],"marksPerQuestion":2,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":false},
    {"id":"sec-c","name":"Section C","questionCount":7,"questionTypes":["short_answer","numerical"],"marksPerQuestion":3,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":false},
    {"id":"sec-d","name":"Section D","questionCount":3,"questionTypes":["long_answer","case_based"],"marksPerQuestion":5,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":false}
  ]'::jsonb,
  'CBSE XII Physics. Skin paper.'
),
(
  'a1000000-0000-4000-8000-000000000015',
  'university_end_sem',
  'University end-sem (generic)',
  'University',
  'Undergraduate',
  180,
  100,
  '[
    {"id":"part-a","name":"Part A","questionCount":10,"questionTypes":["short_answer"],"marksPerQuestion":2,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":false},
    {"id":"part-b","name":"Part B","questionCount":7,"questionTypes":["long_answer"],"marksPerQuestion":13,"negative":{"mode":"none","value":0},"optionality":{"answerAny":5},"sectionTimeSec":null,"shuffleQuestions":false}
  ]'::jsonb,
  'Generic end-sem: Part A 10 short @2; Part B any 5 of 7 long @13. Prefer KTU preset when matching board.'
),
(
  'a1000000-0000-4000-8000-000000000016',
  'university_mid_term',
  'University mid-term (generic)',
  'University',
  'Undergraduate',
  90,
  40,
  '[
    {"id":"part-a","name":"Part A","questionCount":5,"questionTypes":["short_answer"],"marksPerQuestion":2,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":null,"shuffleQuestions":false},
    {"id":"part-b","name":"Part B","questionCount":3,"questionTypes":["long_answer"],"marksPerQuestion":10,"negative":{"mode":"none","value":0},"optionality":{"answerAny":2},"sectionTimeSec":null,"shuffleQuestions":false}
  ]'::jsonb,
  'Generic mid-term: Part A 5 short @2; Part B any 2 of 3 long @10.'
),
(
  'a1000000-0000-4000-8000-000000000017',
  'sat_rw',
  'SAT Reading & Writing',
  'College Board',
  'SAT',
  64,
  54,
  '[
    {"id":"mod1","name":"Module 1","questionCount":27,"questionTypes":["mcq_single"],"marksPerQuestion":1,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":1920,"shuffleQuestions":true},
    {"id":"mod2","name":"Module 2","questionCount":27,"questionTypes":["mcq_single"],"marksPerQuestion":1,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":1920,"shuffleQuestions":true}
  ]'::jsonb,
  'SAT R&W: 2×27 MCQ, 32 min each. Skin standard.'
),
(
  'a1000000-0000-4000-8000-000000000018',
  'sat_math',
  'SAT Math',
  'College Board',
  'SAT',
  70,
  44,
  '[
    {"id":"mod1","name":"Module 1","questionCount":22,"questionTypes":["mcq_single","numerical"],"marksPerQuestion":1,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":2100,"shuffleQuestions":true},
    {"id":"mod2","name":"Module 2","questionCount":22,"questionTypes":["mcq_single","numerical"],"marksPerQuestion":1,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":2100,"shuffleQuestions":true}
  ]'::jsonb,
  'SAT Math: 2×22 MCQ+numeric, 35 min each.'
),
(
  'a1000000-0000-4000-8000-000000000019',
  'ap_generic',
  'AP (generic)',
  'College Board',
  'AP',
  180,
  80,
  '[
    {"id":"sec-i","name":"Section I","questionCount":40,"questionTypes":["mcq_single"],"marksPerQuestion":1,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":3600,"shuffleQuestions":true},
    {"id":"sec-ii","name":"Section II","questionCount":4,"questionTypes":["long_answer"],"marksPerQuestion":10,"negative":{"mode":"none","value":0},"optionality":null,"sectionTimeSec":5400,"shuffleQuestions":false}
  ]'::jsonb,
  'AP generic: 40 MCQ + 4 free-response. Skin paper.'
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "board" = EXCLUDED."board",
  "level_label" = EXCLUDED."level_label",
  "duration_min" = EXCLUDED."duration_min",
  "total_marks" = EXCLUDED."total_marks",
  "sections" = EXCLUDED."sections",
  "description" = EXCLUDED."description",
  "updated_at" = now();
