-- ClassLink roster provider + SAML metadata column convenience (full SAML config in metadata jsonb).

ALTER TABLE roster_sync_jobs DROP CONSTRAINT IF EXISTS roster_sync_jobs_provider_ck;
--> statement-breakpoint
ALTER TABLE roster_sync_jobs ADD CONSTRAINT roster_sync_jobs_provider_ck
  CHECK (provider IN ('oneroster_csv', 'clever', 'classlink'));
--> statement-breakpoint

COMMENT ON COLUMN institution_identity_providers.metadata IS
  'OIDC: optional extras. SAML: { ssoUrl, idpCertificate, spEntityId? }.';
