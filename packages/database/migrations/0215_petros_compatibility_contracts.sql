-- Additive P1-S10. No backfill, external sync, identity merge or evidence conversion.
-- 0184/0185 existed as SQL files but were omitted from the canonical Drizzle journal. Recreate
-- their additive prerequisites here so a clean journaled database and an existing database that
-- already applied them converge before the compatibility foreign keys are added.
CREATE TABLE IF NOT EXISTS institution_identity_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'oidc', name text NOT NULL, issuer text NOT NULL,
  client_id text NOT NULL, client_secret text, discovery_url text,
  scopes text NOT NULL DEFAULT 'openid email profile', enabled boolean NOT NULL DEFAULT false,
  jit_provision boolean NOT NULL DEFAULT true, metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT institution_identity_providers_kind_ck CHECK (kind IN ('oidc', 'saml'))
);
CREATE INDEX IF NOT EXISTS institution_identity_providers_inst_idx ON institution_identity_providers (institution_id);
CREATE TABLE IF NOT EXISTS roster_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  provider text NOT NULL, status text NOT NULL DEFAULT 'queued', stats jsonb NOT NULL DEFAULT '{}',
  error_message text, started_at timestamptz, finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roster_sync_jobs_status_ck CHECK (status IN ('queued', 'running', 'succeeded', 'failed'))
);
ALTER TABLE roster_sync_jobs DROP CONSTRAINT IF EXISTS roster_sync_jobs_provider_ck;
ALTER TABLE roster_sync_jobs ADD CONSTRAINT roster_sync_jobs_provider_ck
  CHECK (provider IN ('oneroster_csv', 'clever', 'classlink'));
CREATE INDEX IF NOT EXISTS roster_sync_jobs_inst_created_idx ON roster_sync_jobs (institution_id, created_at DESC);
COMMENT ON COLUMN institution_identity_providers.metadata IS
  'OIDC: optional extras. SAML: { ssoUrl, idpCertificate, spEntityId? }.';
--> statement-breakpoint
CREATE UNIQUE INDEX institution_identity_provider_tenant_uq ON institution_identity_providers(id, institution_id);
CREATE UNIQUE INDEX course_identity_tenant_uq ON courses(id, institution_id);
--> statement-breakpoint
CREATE TABLE integration_provider_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id),
  connection_id uuid NOT NULL, namespace text NOT NULL, entity_kind text NOT NULL, external_id text NOT NULL,
  version integer NOT NULL CHECK (version BETWEEN 1 AND 100000), command_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'), record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (connection_id, institution_id) REFERENCES institution_identity_providers(id, institution_id),
  CONSTRAINT provider_mapping_bounds CHECK ((
    octet_length(record::text) <= 32000 AND record->>'schemaVersion' = 'petros.provider-mapping.v1'
    AND record->'input'->>'schemaVersion' = 'petros.provider-mapping.v1'
    AND record->'input'->>'namespace' = namespace AND record->'input'->>'entityKind' = entity_kind
    AND record->'input'->>'externalId' = external_id AND record->>'version' = version::text
    AND record->'input'->>'commandId' = command_id::text
    AND record->'connection'->>'connectionId' = connection_id::text
    AND length(namespace) BETWEEN 1 AND 200 AND length(external_id) BETWEEN 1 AND 300
    AND entity_kind IN ('institution','campus','institution_user','student','staff','course','class','academic_term','assignment')
  ) IS TRUE)
);
CREATE UNIQUE INDEX integration_provider_mapping_uq ON integration_provider_mappings(connection_id, namespace, entity_kind, external_id, version);
CREATE UNIQUE INDEX integration_provider_mapping_command_uq ON integration_provider_mappings(connection_id, command_id);
ALTER TABLE roster_sync_jobs ADD COLUMN compatibility jsonb;
ALTER TABLE roster_sync_jobs ADD CONSTRAINT roster_compatibility_bound CHECK (compatibility IS NULL OR (
  jsonb_typeof(compatibility) = 'object' AND octet_length(compatibility::text) <= 192000
  AND compatibility->>'schemaVersion' = 'petros.roster-preview.v1'
) IS TRUE);
CREATE FUNCTION petros_roster_compatibility_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.compatibility IS DISTINCT FROM OLD.compatibility OR
    (OLD.compatibility IS NOT NULL AND (NEW.institution_id IS DISTINCT FROM OLD.institution_id OR NEW.provider IS DISTINCT FROM OLD.provider)) THEN
    RAISE EXCEPTION 'Roster compatibility previews are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER roster_compatibility_immutable BEFORE UPDATE ON roster_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION petros_roster_compatibility_immutable();
--> statement-breakpoint
CREATE TABLE course_curriculum_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id),
  course_id uuid NOT NULL, kind text NOT NULL, record_id uuid NOT NULL,
  record_version integer NOT NULL CHECK (record_version BETWEEN 1 AND 100000),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'), content jsonb NOT NULL,
  actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (course_id, institution_id) REFERENCES courses(id, institution_id),
  CONSTRAINT course_curriculum_record_bound CHECK ((
    kind IN ('objectives','frameworks','releases','items','relationships','alignments')
    AND jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 32000
    AND content->>'id' = record_id::text AND content->>'version' = record_version::text
  ) IS TRUE)
);
CREATE UNIQUE INDEX course_curriculum_record_uq ON course_curriculum_records(course_id, kind, record_id, record_version);
CREATE TABLE course_curriculum_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id),
  course_id uuid NOT NULL, revision integer NOT NULL CHECK (revision BETWEEN 1 AND 100000),
  schema_version text NOT NULL CHECK (schema_version = 'petros.curriculum-alignment.v1'),
  command_id uuid NOT NULL, request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  syllabus_hash text NOT NULL CHECK (syllabus_hash ~ '^[a-f0-9]{64}$'), subject_id uuid,
  payload jsonb NOT NULL, actor_id uuid NOT NULL, reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (course_id, institution_id) REFERENCES courses(id, institution_id),
  CONSTRAINT course_curriculum_payload_bound CHECK ((
    jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 192000
    AND payload->>'schemaVersion' = schema_version
    AND jsonb_array_length(payload->'objectives') <= 64
    AND jsonb_array_length(payload->'frameworks') <= 16
    AND jsonb_array_length(payload->'releases') <= 32
    AND jsonb_array_length(payload->'items') <= 128
    AND jsonb_array_length(payload->'relationships') <= 128
    AND jsonb_array_length(payload->'alignments') <= 128
    AND jsonb_array_length(payload->'moduleObjectives') <= 52
  ) IS TRUE)
);
CREATE UNIQUE INDEX course_curriculum_revision_uq ON course_curriculum_revisions(course_id, revision);
CREATE UNIQUE INDEX course_curriculum_command_uq ON course_curriculum_revisions(course_id, command_id);
CREATE INDEX course_curriculum_tenant_idx ON course_curriculum_revisions(institution_id, course_id);
--> statement-breakpoint
-- No unscoped or independent access to these institutional compatibility records.
ALTER TABLE roster_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_sync_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY roster_compatibility_staff ON roster_sync_jobs FOR ALL
  USING (((compatibility IS NULL AND edrion_current_institution() IS NULL) OR institution_id::text = edrion_current_institution()) AND edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  WITH CHECK (((compatibility IS NULL AND edrion_current_institution() IS NULL) OR institution_id::text = edrion_current_institution()) AND edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL);
ALTER TABLE integration_provider_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_provider_mappings FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_mapping_staff ON integration_provider_mappings FOR ALL
  USING (institution_id::text = edrion_current_institution() AND edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  WITH CHECK (institution_id::text = edrion_current_institution() AND edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL);
ALTER TABLE course_curriculum_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_curriculum_records FORCE ROW LEVEL SECURITY;
CREATE POLICY curriculum_record_staff ON course_curriculum_records FOR ALL
  USING (institution_id::text = edrion_current_institution() AND edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  WITH CHECK (institution_id::text = edrion_current_institution() AND edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL);
ALTER TABLE course_curriculum_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_curriculum_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY curriculum_revision_read ON course_curriculum_revisions FOR SELECT USING (
  institution_id::text = edrion_current_institution() AND edrion_current_independent_user() IS NULL AND (
    edrion_current_student() IS NULL OR EXISTS (SELECT 1 FROM course_enrollments e
      JOIN students s ON s.id = e.student_id AND s.institution_id = e.institution_id
      WHERE e.course_id = course_curriculum_revisions.course_id
        AND e.institution_id = course_curriculum_revisions.institution_id
        AND s.id::text = edrion_current_student() AND s.status = 'enrolled')
  )
);
CREATE POLICY curriculum_revision_write ON course_curriculum_revisions FOR INSERT WITH CHECK (
  institution_id::text = edrion_current_institution() AND edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL
);
--> statement-breakpoint
CREATE FUNCTION petros_compatibility_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Compatibility history is append-only'; END;
$$;
CREATE TRIGGER provider_mapping_immutable BEFORE UPDATE OR DELETE ON integration_provider_mappings
  FOR EACH ROW EXECUTE FUNCTION petros_compatibility_immutable();
CREATE TRIGGER curriculum_record_immutable BEFORE UPDATE OR DELETE ON course_curriculum_records
  FOR EACH ROW EXECUTE FUNCTION petros_compatibility_immutable();
CREATE TRIGGER curriculum_revision_immutable BEFORE UPDATE OR DELETE ON course_curriculum_revisions
  FOR EACH ROW EXECUTE FUNCTION petros_compatibility_immutable();
-- zzz_grants.sql reapplies grants after migrations; triggers also retain append-only protection.
GRANT SELECT, INSERT ON integration_provider_mappings, course_curriculum_records, course_curriculum_revisions TO edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON integration_provider_mappings, course_curriculum_records, course_curriculum_revisions FROM edrion_app;
