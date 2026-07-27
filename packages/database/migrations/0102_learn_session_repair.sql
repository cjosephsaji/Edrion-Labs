-- 0102_learn_session_repair
-- Repairs the Edrion Learn session sequence counters and removes blocks that can
-- never be rendered. Idempotent and safe to re-run.

-- ── 1. atomic block-sequence counter ─────────────────────────────────────────
ALTER TABLE learn_sessions ADD COLUMN IF NOT EXISTS last_block_seq bigint NOT NULL DEFAULT 0;

-- ── 2. drop blocks that can never render ─────────────────────────────────────
-- A block is inserted with content '{}' at render_status 'streaming' and filled in
-- once rendering completes. A row still in that shape is mid-flight debris: it can
-- never be parsed by blockV1Schema, so it can never reach a client. DELETE (rather
-- than mark failed) keeps GET /sessions/:id and the stream planner honest — a
-- "failed" tail block would still block `shouldPlan`, permanently wedging sessions.
-- learn_attempts.block_id is ON DELETE SET NULL and an unrendered block can have no
-- attempts anyway, so no FK is broken.
DELETE FROM learn_session_blocks
WHERE render_status = 'streaming'
  AND content = '{}'::jsonb
  AND completed_at IS NULL;

-- ── 3. backfill the block counter from surviving rows ────────────────────────
-- The counter must cover BOTH sequence and stream_seq: the orchestrator now
-- allocates one value and uses it for both, and both carry unique indexes.
UPDATE learn_sessions s
SET last_block_seq = GREATEST(
  s.last_block_seq,
  COALESCE(b.max_seq, 0),
  COALESCE(b.max_stream_seq, 0)
)
FROM (
  SELECT session_id,
         MAX(sequence) AS max_seq,
         MAX(stream_seq) AS max_stream_seq
  FROM learn_session_blocks
  GROUP BY session_id
) b
WHERE b.session_id = s.id
  AND s.last_block_seq < GREATEST(COALESCE(b.max_seq, 0), COALESCE(b.max_stream_seq, 0));

-- ── 4. repair diverged event counters ────────────────────────────────────────
UPDATE learn_sessions s
SET last_event_seq = e.max_seq
FROM (
  SELECT session_id, MAX(seq) AS max_seq
  FROM learn_session_events
  GROUP BY session_id
) e
WHERE e.session_id = s.id
  AND s.last_event_seq <> e.max_seq;
