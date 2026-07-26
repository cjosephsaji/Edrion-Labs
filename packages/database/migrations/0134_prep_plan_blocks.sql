CREATE INDEX IF NOT EXISTS prep_plan_blocks_plan_date_idx
  ON prep_plan_blocks (plan_id, block_date, sort_order);
