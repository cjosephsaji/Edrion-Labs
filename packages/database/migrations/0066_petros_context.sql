-- Petros context/cost economics.
--
-- `summary` has existed since 0039 and the prompt has always read it, but nothing ever WROTE it:
-- the model input was a hard `slice(-20)` of messages, so a long conversation was both expensive
-- (20 full turns resent every request) and lossy (turn 21 silently forgot turn 1). Rolling
-- summarization now compacts the dropped prefix into `summary`; `summary_through` is the watermark
-- telling us how many of the conversation's messages that summary already covers, so we
-- re-summarize incrementally instead of from scratch.
ALTER TABLE "petros_conversations" ADD COLUMN IF NOT EXISTS "summary_through" integer DEFAULT 0 NOT NULL;

-- Cost accounting: the token columns on petros_messages are already there, but nothing stored the
-- resulting spend. Persisting it per message makes the savings measurable (and is the seam a
-- future per-institution budget cap hangs off).
ALTER TABLE "petros_messages" ADD COLUMN IF NOT EXISTS "cost_micro_usd" integer DEFAULT 0 NOT NULL;
