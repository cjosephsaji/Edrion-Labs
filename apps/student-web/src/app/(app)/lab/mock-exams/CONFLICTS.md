# Mock Exam Engine — brief vs codebase resolutions

1. **Tables**: Evolved `mock_*` + added `exam_paper_patterns`, `exam_blueprints`, `question_bank`, `question_exposure`. Did not create student `exams` / `exam_attempts` (institutional ownership).
2. **AI models**: OpenAI via `LearnAiProvider` (`OPENAI_SMALL_MODEL` / `OPENAI_BIG_MODEL`) — not Gemini.
3. **Usage guard**: `BudgetsService.spend(...)` for student AI — not Copilot `AiUsageLimiter`.
4. **Verdicts**: `solid | slipped | missed` (Library). Brief’s `incorrect` ≡ `missed`.
5. **Routes**: `/lab/mock-exams/*` and `/v1/student/lab/mock-exams/*`; Nest folder `exam-engine`.
6. **Events**: `exam.*` types plus alias `mock.completed` for History/achievements.
7. **Pause**: only `quick_check`.
8. **Abandonment**: attempts expire **24h** after `ends_at` (`exam.prune_expired` on maintenance).
9. **Autosave**: **600ms** debounce.
10. **Bank mix**: up to **40%**; exposure tracked per student.
11. **Dedup**: Jaccard ≥ **0.85** on normalized prompt tokens.
12. **Topicality**: student `ExamTopicalityService` (regex + nano classifier).
13. **Migration number**: exam engine SQL is `0064_exam_engine.sql` because `0063_visual_studio.sql` already existed.
14. **Schema name**: Lab questions use `labExamQuestionSchema` — institutional portal already owned `examQuestionSchema`.
15. **Non-goals**: no proctoring, teacher-assigned mocks, PDFs, marketplace, or image questions.
