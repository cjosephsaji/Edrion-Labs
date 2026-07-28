-- 0110_ai_capability_values
-- Enum ADD VALUE must be its own migration: Drizzle wraps each file in a
-- transaction, and a newly added enum value cannot be referenced in the same
-- transaction that creates it.

ALTER TYPE ai_capability ADD VALUE IF NOT EXISTS 'curriculum_bounds';
ALTER TYPE ai_capability ADD VALUE IF NOT EXISTS 'answer_directness';
ALTER TYPE ai_capability ADD VALUE IF NOT EXISTS 'session_visibility';
