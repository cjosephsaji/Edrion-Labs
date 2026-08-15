-- Deterministic session seeds use the full unsigned 32-bit range.
ALTER TABLE petros_quality_runs ALTER COLUMN seed TYPE bigint USING seed::bigint;
ALTER TABLE petros_quality_sessions ALTER COLUMN seed TYPE bigint USING seed::bigint;
