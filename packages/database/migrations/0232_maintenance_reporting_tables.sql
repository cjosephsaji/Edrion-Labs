-- Forward repair: 0172-0177 were never included in the Drizzle journal, so
-- normal migration runs skipped the tables used by the daily maintenance jobs.
-- Keep creation idempotent for databases where that SQL was applied manually.
CREATE TABLE IF NOT EXISTS public.principal_metric_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  as_of date NOT NULL,
  value jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT principal_metric_rollups_uq UNIQUE (institution_id, metric_key, as_of)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS principal_metric_rollups_inst_as_of_idx
  ON public.principal_metric_rollups (institution_id, as_of DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS principal_metric_rollups_metric_key_idx
  ON public.principal_metric_rollups (institution_id, metric_key, as_of DESC);
--> statement-breakpoint
COMMENT ON TABLE public.principal_metric_rollups IS 'Pre-aggregated principal dashboard metrics (WS6); no request-time scans.';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.compliance_evidence_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  kind text NOT NULL,
  storage_key text NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);
