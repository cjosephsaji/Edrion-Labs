-- Phase 2 teaching-pack candidates and explicit qualified educator review.
-- No qualification or approval rows are seeded: the authority registry is empty by default.

CREATE TABLE petros_teaching_pack_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  source_item_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE RESTRICT,
  source_version text NOT NULL CHECK (source_version ~ '^[a-f0-9]{64}$'),
  curriculum_revision integer NOT NULL CHECK (curriculum_revision > 0 AND curriculum_revision <= 100000),
  pack_id uuid NOT NULL,
  pack_version integer NOT NULL CHECK (pack_version > 0 AND pack_version <= 100000),
  compiler_version text NOT NULL CHECK (length(compiler_version) BETWEEN 1 AND 180),
  schema_version text NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 262144),
  command_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_by_user_id uuid NOT NULL REFERENCES institution_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_teaching_pack_candidate_course_tenant_fk
    FOREIGN KEY (course_id, institution_id) REFERENCES courses(id, institution_id) ON DELETE RESTRICT,
  CONSTRAINT petros_teaching_pack_candidate_version_uq
    UNIQUE (institution_id, pack_id, pack_version),
  CONSTRAINT petros_teaching_pack_candidate_command_uq UNIQUE (institution_id, command_id),
  CONSTRAINT petros_teaching_pack_candidate_payload_uq UNIQUE (id, payload_hash)
);
CREATE INDEX petros_teaching_pack_candidate_lookup_idx
  ON petros_teaching_pack_candidates(institution_id, pack_id, pack_version);

CREATE TABLE petros_reviewer_qualifications (
  row_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qualification_id uuid NOT NULL,
  qualification_version integer NOT NULL CHECK (qualification_version > 0 AND qualification_version <= 100000),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  reviewer_user_id uuid NOT NULL REFERENCES institution_users(id) ON DELETE RESTRICT,
  reviewer_staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  subject_key text NOT NULL CHECK (length(subject_key) BETWEEN 1 AND 180),
  status text NOT NULL CHECK (status IN ('active', 'expired', 'revoked')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  evidence_kind text NOT NULL CHECK (evidence_kind IN ('credential', 'institution_record', 'external_verification')),
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  recorded_by_user_id uuid NOT NULL REFERENCES institution_users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_reviewer_qualification_time_ck CHECK (valid_until > valid_from),
  CONSTRAINT petros_reviewer_qualification_version_uq UNIQUE (qualification_id, qualification_version)
);
CREATE INDEX petros_reviewer_qualification_current_idx
  ON petros_reviewer_qualifications(institution_id, reviewer_user_id, subject_key, qualification_id, qualification_version DESC);

CREATE TABLE petros_teaching_pack_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  candidate_id uuid NOT NULL REFERENCES petros_teaching_pack_candidates(id) ON DELETE RESTRICT,
  source_item_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE RESTRICT,
  source_version text NOT NULL CHECK(source_version ~ '^[a-f0-9]{64}$'),
  review_version integer NOT NULL CHECK (review_version > 0 AND review_version <= 100000),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  reviewer_user_id uuid NOT NULL REFERENCES institution_users(id) ON DELETE RESTRICT,
  qualification_id uuid NOT NULL,
  qualification_version integer NOT NULL,
  authority_snapshot jsonb NOT NULL CHECK (jsonb_typeof(authority_snapshot) = 'object' AND pg_column_size(authority_snapshot) <= 16384),
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt) = 'object' AND pg_column_size(receipt) <= 294912),
  command_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_teaching_pack_review_course_tenant_fk
    FOREIGN KEY (course_id, institution_id) REFERENCES courses(id, institution_id) ON DELETE RESTRICT,
  CONSTRAINT petros_teaching_pack_review_qualification_fk
    FOREIGN KEY (qualification_id, qualification_version)
      REFERENCES petros_reviewer_qualifications(qualification_id, qualification_version) ON DELETE RESTRICT,
  CONSTRAINT petros_teaching_pack_review_version_uq UNIQUE (candidate_id, review_version),
  CONSTRAINT petros_teaching_pack_review_command_uq UNIQUE (institution_id, command_id)
);
CREATE INDEX petros_teaching_pack_review_current_idx
  ON petros_teaching_pack_reviews(institution_id, candidate_id, review_version DESC);

CREATE TABLE petros_teaching_pack_review_revocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  review_id uuid NOT NULL REFERENCES petros_teaching_pack_reviews(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  source_item_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  revoked_by_user_id uuid NOT NULL REFERENCES institution_users(id) ON DELETE RESTRICT,
  revoked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_teaching_pack_review_revocation_uq UNIQUE (review_id),
  CONSTRAINT petros_teaching_pack_review_revocation_command_uq UNIQUE (institution_id, command_id)
);

CREATE FUNCTION edrion_guard_petros_teaching_pack_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Petros teaching-pack history is immutable';
END $$;
CREATE TRIGGER petros_teaching_pack_candidate_immutable
  BEFORE UPDATE OR DELETE ON petros_teaching_pack_candidates
  FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_teaching_pack_immutable();
CREATE TRIGGER petros_reviewer_qualification_immutable
  BEFORE UPDATE OR DELETE ON petros_reviewer_qualifications
  FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_teaching_pack_immutable();
CREATE TRIGGER petros_teaching_pack_review_immutable
  BEFORE UPDATE OR DELETE ON petros_teaching_pack_reviews
  FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_teaching_pack_immutable();
CREATE TRIGGER petros_teaching_pack_review_revocation_immutable
  BEFORE UPDATE OR DELETE ON petros_teaching_pack_review_revocations
  FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_teaching_pack_immutable();

ALTER TABLE petros_teaching_pack_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_teaching_pack_candidates FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_teaching_pack_candidate_tenant ON petros_teaching_pack_candidates FOR ALL
  USING (edrion_current_institution() IS NOT NULL AND institution_id::text = edrion_current_institution())
  WITH CHECK (edrion_current_institution() IS NOT NULL AND institution_id::text = edrion_current_institution());

ALTER TABLE petros_reviewer_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_reviewer_qualifications FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_reviewer_qualification_tenant ON petros_reviewer_qualifications FOR ALL
  USING (edrion_current_institution() IS NOT NULL AND institution_id::text = edrion_current_institution())
  WITH CHECK (edrion_current_institution() IS NOT NULL AND institution_id::text = edrion_current_institution());

ALTER TABLE petros_teaching_pack_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_teaching_pack_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_teaching_pack_review_tenant ON petros_teaching_pack_reviews FOR ALL
  USING (edrion_current_institution() IS NOT NULL AND institution_id::text = edrion_current_institution())
  WITH CHECK (edrion_current_institution() IS NOT NULL AND institution_id::text = edrion_current_institution());

ALTER TABLE petros_teaching_pack_review_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_teaching_pack_review_revocations FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_teaching_pack_review_revocation_tenant ON petros_teaching_pack_review_revocations FOR ALL
  USING (edrion_current_institution() IS NOT NULL AND institution_id::text = edrion_current_institution())
  WITH CHECK (edrion_current_institution() IS NOT NULL AND institution_id::text = edrion_current_institution());

GRANT SELECT, INSERT ON petros_teaching_pack_candidates TO edrion_app;
GRANT SELECT ON petros_reviewer_qualifications TO edrion_app;
GRANT SELECT, INSERT ON petros_teaching_pack_reviews, petros_teaching_pack_review_revocations TO edrion_app;
--> statement-breakpoint
-- Narrow boolean policy helper avoids recursive RLS while exposing no draft payload.
-- All identity comes from transaction-local tenant settings. No caller-supplied tenant.
CREATE FUNCTION petros_student_pack_visible(candidate_uuid uuid, review_uuid uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.petros_teaching_pack_candidates c
  JOIN public.knowledge_items k ON k.id=c.source_item_id AND k.institution_id=c.institution_id
  JOIN public.courses course ON course.id=c.course_id AND course.institution_id=c.institution_id
  JOIN public.course_enrollments e ON e.course_id=c.course_id AND e.institution_id=c.institution_id
  JOIN public.students s ON s.id=e.student_id AND s.institution_id=e.institution_id
  JOIN LATERAL (SELECT r.* FROM public.petros_teaching_pack_reviews r WHERE r.candidate_id=c.id
    ORDER BY r.review_version DESC LIMIT 1) latest ON true
  JOIN LATERAL (SELECT q.* FROM public.petros_reviewer_qualifications q
    WHERE q.qualification_id=latest.qualification_id AND q.institution_id=c.institution_id
    ORDER BY q.qualification_version DESC LIMIT 1) qualification ON true
  JOIN public.institution_users reviewer ON reviewer.id=latest.reviewer_user_id AND reviewer.institution_id=c.institution_id
  JOIN public.staff reviewer_staff ON reviewer_staff.id=qualification.reviewer_staff_id AND reviewer_staff.institution_id=c.institution_id
  JOIN LATERAL (SELECT v.* FROM public.knowledge_item_versions v WHERE v.item_id=k.id
    ORDER BY v.admissible DESC,v.ordinal DESC,v.id DESC LIMIT 1) source ON true
  WHERE c.id=candidate_uuid AND c.institution_id::text=public.edrion_current_institution()
   AND s.id::text=public.edrion_current_student() AND k.student_id=s.id
   AND k.source_revoked_at IS NULL AND s.status='enrolled' AND course.status='active'
   AND latest.decision='approved' AND (review_uuid IS NULL OR latest.id=review_uuid)
   AND qualification.qualification_version=latest.qualification_version AND qualification.status='active'
   AND qualification.valid_from<=now() AND qualification.valid_until>now()
   AND reviewer.status='active' AND reviewer_staff.status='active'
   AND source.fingerprint=c.source_version AND source.state='complete' AND source.invalidated_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.petros_teaching_pack_review_revocations v WHERE v.review_id=latest.id)
   AND NOT EXISTS(SELECT 1 FROM public.petros_teaching_pack_candidates n WHERE n.institution_id=c.institution_id
     AND n.pack_id=c.pack_id AND n.pack_version>c.pack_version)
 );
$$;
REVOKE ALL ON FUNCTION petros_student_pack_visible(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION petros_student_pack_visible(uuid,uuid) TO edrion_app;
DROP POLICY petros_teaching_pack_candidate_tenant ON petros_teaching_pack_candidates;
CREATE POLICY petros_teaching_pack_candidate_tenant ON petros_teaching_pack_candidates FOR SELECT
 USING(institution_id::text=edrion_current_institution() AND
  (edrion_current_student() IS NULL OR petros_student_pack_visible(id)));
CREATE POLICY petros_teaching_pack_candidate_write ON petros_teaching_pack_candidates FOR INSERT
 WITH CHECK(institution_id::text=edrion_current_institution() AND edrion_current_student() IS NULL);
DROP POLICY petros_teaching_pack_review_tenant ON petros_teaching_pack_reviews;
CREATE POLICY petros_teaching_pack_review_tenant ON petros_teaching_pack_reviews FOR SELECT
 USING(institution_id::text=edrion_current_institution() AND
  (edrion_current_student() IS NULL OR petros_student_pack_visible(candidate_id,id)));
CREATE POLICY petros_teaching_pack_review_write ON petros_teaching_pack_reviews FOR INSERT
 WITH CHECK(institution_id::text=edrion_current_institution() AND edrion_current_student() IS NULL);
DROP POLICY petros_teaching_pack_review_revocation_tenant ON petros_teaching_pack_review_revocations;
CREATE POLICY petros_teaching_pack_review_revocation_tenant ON petros_teaching_pack_review_revocations FOR SELECT
 USING(institution_id::text=edrion_current_institution() AND (edrion_current_student() IS NULL OR
  EXISTS(SELECT 1 FROM knowledge_items k WHERE k.id=source_item_id AND k.student_id::text=edrion_current_student())));
CREATE POLICY petros_teaching_pack_review_revocation_write ON petros_teaching_pack_review_revocations FOR INSERT
 WITH CHECK(institution_id::text=edrion_current_institution() AND edrion_current_student() IS NULL);
DROP POLICY petros_reviewer_qualification_tenant ON petros_reviewer_qualifications;
CREATE POLICY petros_reviewer_qualification_tenant ON petros_reviewer_qualifications FOR SELECT
 USING(institution_id::text=edrion_current_institution() AND (edrion_current_student() IS NULL OR
  EXISTS(SELECT 1 FROM petros_teaching_pack_reviews r WHERE r.qualification_id=petros_reviewer_qualifications.qualification_id
   AND r.reviewer_user_id=petros_reviewer_qualifications.reviewer_user_id)));
-- Authority registry ingestion is deliberately unavailable to the application role.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON petros_reviewer_qualifications FROM edrion_app;
