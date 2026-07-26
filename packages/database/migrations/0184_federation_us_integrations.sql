-- US federation (Tier 3 WS-SSO / WS-ROSTER): OIDC IdP config + roster sync jobs per institution.

CREATE TABLE IF NOT EXISTS institution_identity_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'oidc',
  name text NOT NULL,
  issuer text NOT NULL,
  client_id text NOT NULL,
  client_secret text,
  discovery_url text,
  scopes text NOT NULL DEFAULT 'openid email profile',
  enabled boolean NOT NULL DEFAULT false,
  jit_provision boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT institution_identity_providers_kind_ck CHECK (kind IN ('oidc', 'saml'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS institution_identity_providers_inst_idx
  ON institution_identity_providers (institution_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS roster_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  stats jsonb NOT NULL DEFAULT '{}',
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roster_sync_jobs_provider_ck CHECK (provider IN ('oneroster_csv', 'clever')),
  CONSTRAINT roster_sync_jobs_status_ck CHECK (status IN ('queued', 'running', 'succeeded', 'failed'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS roster_sync_jobs_inst_created_idx
  ON roster_sync_jobs (institution_id, created_at DESC);
