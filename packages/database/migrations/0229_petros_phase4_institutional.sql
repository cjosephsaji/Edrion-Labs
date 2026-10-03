CREATE TABLE petros_material_corrections (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
 material_id uuid NOT NULL REFERENCES class_materials(id) ON DELETE CASCADE, proposed_object_id uuid NOT NULL,
 expected_material_version integer NOT NULL CHECK(expected_material_version>=0), proposed_by uuid NOT NULL REFERENCES institution_users(id),
 reviewed_by uuid REFERENCES institution_users(id), reason text NOT NULL CHECK(length(reason) BETWEEN 12 AND 1000), review_reason text,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 meaning_changed boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'preview' CHECK(status IN ('preview','approved','rejected','publishing','published')),
 version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 999999), preview jsonb NOT NULL,
 published_material_version integer, command_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
 UNIQUE(institution_id,command_id), CHECK(jsonb_typeof(preview)='object')
);
CREATE INDEX petros_material_correction_owner_idx ON petros_material_corrections(institution_id,material_id,created_at DESC);

CREATE TABLE petros_institutional_interventions (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
 class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE, subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES institution_users(id), approved_by uuid REFERENCES institution_users(id),
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 160), description text NOT NULL CHECK(length(description) BETWEEN 8 AND 1000),
 concept_key text NOT NULL CHECK(length(concept_key) BETWEEN 1 AND 160), assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL,
 delivery_status text NOT NULL DEFAULT 'preview' CHECK(delivery_status IN ('preview','staged','published','cancelled','expired')),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'preview'
 CHECK(status IN ('preview','approved','expired','cancelled')), version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 999999),
 expires_at timestamptz NOT NULL, command_id uuid NOT NULL, audience_preview jsonb NOT NULL, reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz, cancelled_at timestamptz,
 UNIQUE(institution_id,command_id), CHECK(jsonb_typeof(audience_preview)='object')
);
CREATE INDEX petros_intervention_status_idx ON petros_institutional_interventions(institution_id,status,expires_at);

ALTER TABLE petros_class_struggle_signals
 ADD COLUMN eligible_count integer NOT NULL DEFAULT 0 CHECK(eligible_count>=0),
 ADD COLUMN evidence_covered_count integer NOT NULL DEFAULT 0 CHECK(evidence_covered_count>=0),
 ADD COLUMN independent_attempt_count integer NOT NULL DEFAULT 0 CHECK(independent_attempt_count>=0),
 ADD COLUMN exclusion_counts jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(exclusion_counts)='object'),
 ADD COLUMN membership_as_of timestamptz,
 ADD COLUMN window_start timestamptz,
 ADD COLUMN window_end timestamptz,
 ADD COLUMN evidence_versions jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(evidence_versions)='object');

ALTER TABLE petros_material_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_material_corrections FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_material_correction_tenant ON petros_material_corrections FOR ALL
 USING(institution_id::text=edrion_current_institution() AND edrion_current_student() IS NULL) WITH CHECK(institution_id::text=edrion_current_institution() AND edrion_current_student() IS NULL);
ALTER TABLE petros_institutional_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_institutional_interventions FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_intervention_tenant ON petros_institutional_interventions FOR ALL
 USING(institution_id::text=edrion_current_institution() AND edrion_current_student() IS NULL) WITH CHECK(institution_id::text=edrion_current_institution() AND edrion_current_student() IS NULL);
GRANT SELECT,INSERT,UPDATE ON petros_material_corrections,petros_institutional_interventions TO edrion_app;
REVOKE DELETE,TRUNCATE ON petros_material_corrections,petros_institutional_interventions FROM edrion_app;

-- Tenant identity is proved for references, not merely declared on the new row.
ALTER TABLE class_materials ADD CONSTRAINT petros_phase4_material_tenant_uq UNIQUE(id,institution_id);
ALTER TABLE classes ADD CONSTRAINT petros_phase4_class_tenant_uq UNIQUE(id,institution_id);
ALTER TABLE subjects ADD CONSTRAINT petros_phase4_subject_tenant_uq UNIQUE(id,institution_id);
ALTER TABLE storage_objects ADD CONSTRAINT petros_phase4_object_tenant_uq UNIQUE(id,institution_id);
ALTER TABLE petros_material_corrections
 ADD FOREIGN KEY(material_id,institution_id) REFERENCES class_materials(id,institution_id),
 ADD FOREIGN KEY(proposed_object_id,institution_id) REFERENCES storage_objects(id,institution_id),
 ADD FOREIGN KEY(proposed_by,institution_id) REFERENCES institution_users(id,institution_id),
 ADD FOREIGN KEY(reviewed_by,institution_id) REFERENCES institution_users(id,institution_id);
ALTER TABLE petros_institutional_interventions
 ADD FOREIGN KEY(class_id,institution_id) REFERENCES classes(id,institution_id),
 ADD FOREIGN KEY(subject_id,institution_id) REFERENCES subjects(id,institution_id),
 ADD FOREIGN KEY(created_by,institution_id) REFERENCES institution_users(id,institution_id),
 ADD FOREIGN KEY(approved_by,institution_id) REFERENCES institution_users(id,institution_id),
 ADD FOREIGN KEY(assignment_id,institution_id) REFERENCES assignments(id,institution_id);
-- An owner-scoped boolean permits the assignment owner to fence student delivery without
-- opening the staff workflow records to student reads. No content or identity list is returned.
CREATE FUNCTION edrion_petros_assignment_active(assignment uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.petros_institutional_interventions i
  WHERE i.assignment_id=assignment AND i.institution_id::text=public.edrion_current_institution())
 OR EXISTS(SELECT 1 FROM public.petros_institutional_interventions i
  JOIN public.students s ON s.id::text=public.edrion_current_student() AND s.institution_id=i.institution_id
  JOIN public.staff st ON st.institution_user_id=i.approved_by AND st.institution_id=i.institution_id
  JOIN public.institution_users u ON u.id=i.approved_by AND u.institution_id=i.institution_id
  JOIN public.class_subject_teachers c ON c.class_id=i.class_id AND c.subject_id=i.subject_id AND c.teacher_id=st.id AND c.institution_id=i.institution_id
  WHERE i.assignment_id=assignment AND i.institution_id::text=public.edrion_current_institution()
  AND i.status='approved' AND i.delivery_status='published' AND i.expires_at>now()
  AND s.class_id=i.class_id AND s.status='enrolled' AND u.status='active'
  -- Later restrictive policy stops native delivery even after its publication receipt.
  AND EXISTS(SELECT 1 FROM public.petros_institution_policy_versions p
    WHERE p.institution_id=i.institution_id AND p.status IN ('published','scheduled','superseded')
    AND (p.effective_from IS NULL OR p.effective_from<=now()) AND (p.effective_until IS NULL OR p.effective_until>now())
    AND p.scope_level='institution')
  AND NOT EXISTS(SELECT 1 FROM (
    SELECT DISTINCT ON(p.scope_level,p.campus_id,p.programme_id,p.grade_id,p.subject_id) p.config
    FROM public.petros_institution_policy_versions p
    JOIN public.classes cl ON cl.id=i.class_id AND cl.institution_id=i.institution_id
    WHERE p.institution_id=i.institution_id AND p.status IN ('published','scheduled','superseded')
    AND (p.effective_from IS NULL OR p.effective_from<=now()) AND (p.effective_until IS NULL OR p.effective_until>now())
    AND (p.campus_id IS NULL OR p.campus_id=s.campus_id)
    AND (p.programme_id IS NULL OR p.programme_id=cl.programme_level_id)
    AND (p.grade_id IS NULL OR p.grade_id=cl.grade_level_id)
    AND (p.subject_id IS NULL OR p.subject_id=i.subject_id)
    ORDER BY p.scope_level,p.campus_id,p.programme_id,p.grade_id,p.subject_id,p.version DESC
  ) current_policy WHERE COALESCE((current_policy.config->'classSignals'->>'enabled')::boolean,false)=false));
$$;
REVOKE ALL ON FUNCTION edrion_petros_assignment_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edrion_petros_assignment_active(uuid) TO edrion_app;

ALTER TABLE petros_class_struggle_signals ADD COLUMN affected_learner_count integer NOT NULL DEFAULT 0 CHECK(affected_learner_count>=0), ADD COLUMN successful_attempt_count integer NOT NULL DEFAULT 0 CHECK(successful_attempt_count>=0);
