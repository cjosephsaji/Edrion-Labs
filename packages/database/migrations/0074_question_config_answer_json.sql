ALTER TABLE "exam_paper_questions" ADD COLUMN IF NOT EXISTS "config" jsonb;
ALTER TABLE "exam_answers" ADD COLUMN IF NOT EXISTS "answer_json" jsonb;
ALTER TABLE "assignment_questions" ADD COLUMN IF NOT EXISTS "config" jsonb;
ALTER TABLE "assignment_answers" ADD COLUMN IF NOT EXISTS "answer_json" jsonb;
