-- PROPOSAL ONLY: separate target-specific M0-R and M1 deployment approval required.
-- 0234 is occupied by M0-R. Apply after its final restricted-role overlay.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
CREATE UNIQUE INDEX IF NOT EXISTS m1_institution_users_tenant_uq ON institution_users(id,institution_id);
-- Withdrawal changes current entitlement while retaining cited original bindings.
ALTER TABLE class_materials ADD COLUMN source_revoked_at timestamptz;
CREATE FUNCTION edrion_petros_m1_withdraw_material() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN
 UPDATE public.knowledge_preparations SET state='cancelled',lease_until=NULL,fence=fence+1,version=version+1,
  retryable=false,error_code='PETROS_SOURCE_DELETED',updated_at=now()
 WHERE material_id=OLD.id AND state IN('queued','running');
 RETURN NEW;
END $$;
CREATE TRIGGER m1_material_withdrawal BEFORE UPDATE ON class_materials FOR EACH ROW
 WHEN (OLD.source_revoked_at IS NULL AND NEW.source_revoked_at IS NOT NULL) EXECUTE FUNCTION edrion_petros_m1_withdraw_material();
ALTER TABLE petros_document_source_revisions ADD COLUMN format_version text NOT NULL DEFAULT 'v1';
ALTER TABLE petros_document_source_revisions ADD COLUMN original_source_id uuid;
ALTER TABLE petros_document_source_revisions ADD COLUMN v2_revision jsonb;
ALTER TABLE petros_document_source_revisions DROP CONSTRAINT m0r_source_key_check;
ALTER TABLE petros_document_source_revisions ADD CONSTRAINT m0r_source_key_check CHECK ((
 (format_version='v1' AND ((class_material_id IS NOT NULL AND source_key='material:'||class_material_id::text)
  OR (class_material_id IS NULL AND canonical_knowledge_item_id IS NOT NULL AND source_key='knowledge:'||canonical_knowledge_item_id::text)))
 OR (format_version='v2' AND original_source_id IS NOT NULL AND v2_revision IS NOT NULL
  AND v2_revision->>'schemaVersion'='petros.v2.source-revision.v1'
  AND v2_revision->>'id'=id::text AND v2_revision->'source'->>'id'=original_source_id::text
  AND v2_revision->'source'->>'institutionId'=institution_id::text
  AND v2_revision->'source'->>'originalHash'=checksum
  AND (v2_revision->'processing'->>'extractor')||'/'||(v2_revision->'processing'->>'interpretationVersion')||
    CASE WHEN v2_revision->'source'->'binding'->>'kind'='guidance_attachment' THEN '/'||(v2_revision->'source'->'binding'->>'assignmentId') ELSE '' END=parser_version
  AND ((v2_revision->'source'->'binding'->>'kind'='material' AND class_material_id IS NOT NULL
   AND original_source_id=class_material_id
   AND source_key='material:'||class_material_id::text AND v2_revision->'source'->'binding'->>'materialId'=class_material_id::text
   AND v2_revision->'source'->'binding'->>'materialVersion'=document_version::text)
  OR (v2_revision->'source'->'binding'->>'kind'='guidance_attachment' AND class_material_id IS NULL AND canonical_knowledge_item_id IS NULL
   AND original_source_id::text=v2_revision->'source'->'binding'->>'objectId'
   AND source_key='guidance_attachment:'||(v2_revision->'source'->'binding'->>'objectId')||':'||(v2_revision->'source'->'binding'->>'publicationVersion')
   AND (v2_revision->'source'->'binding'->>'publicationVersion')::integer+1=document_version)))) IS TRUE);
CREATE UNIQUE INDEX m1_revision_processing_uq ON petros_document_source_revisions
 (institution_id,original_source_id,document_version,parser_version)
 WHERE format_version='v2';

-- Invoker security: underlying M0-R recipient, storage and enrollment policies also apply.
CREATE FUNCTION edrion_petros_m1_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'M1_IMMUTABLE_VERSION' USING ERRCODE='23514';
END $$;
CREATE TRIGGER m1_revision_immutable BEFORE UPDATE OR DELETE ON petros_document_source_revisions
 FOR EACH ROW WHEN (OLD.format_version='v2') EXECUTE FUNCTION edrion_petros_m1_immutable();

CREATE TABLE petros_concepts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id),
 course_id uuid, created_by uuid NOT NULL REFERENCES institution_users(id), created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT m1_concept_course_fk FOREIGN KEY(course_id,institution_id) REFERENCES courses(id,institution_id),
 CONSTRAINT petros_concepts_tenant_uq UNIQUE(id,institution_id),
 CONSTRAINT m1_concept_actor_fk FOREIGN KEY(created_by,institution_id) REFERENCES institution_users(id,institution_id)
);
CREATE INDEX petros_concepts_namespace_idx ON petros_concepts(institution_id,course_id);
CREATE TABLE petros_concept_versions (
 concept_id uuid NOT NULL, institution_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 payload jsonb NOT NULL, canonical_body text NOT NULL, content_hash text NOT NULL,
 created_by uuid NOT NULL REFERENCES institution_users(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(concept_id,version), CONSTRAINT petros_concept_versions_tenant_uq UNIQUE(concept_id,version,institution_id),
 FOREIGN KEY(concept_id,institution_id) REFERENCES petros_concepts(id,institution_id),
 FOREIGN KEY(created_by,institution_id) REFERENCES institution_users(id,institution_id),
 CHECK(payload->>'schemaVersion'='petros.v2.concept-version.v1' AND jsonb_typeof(payload)='object' AND octet_length(canonical_body)<=98304),
 CHECK(canonical_body::jsonb=payload AND content_hash=encode(sha256(convert_to(canonical_body,'UTF8')),'hex'))
);
CREATE TABLE petros_content_units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL, source_revision_id uuid NOT NULL,
 parent_id uuid REFERENCES petros_content_units(id), ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 9999),
 kind text NOT NULL CHECK(kind IN('heading','paragraph','list','table','figure','diagram','equation','code','caption','chart','unresolved')),
 manifest jsonb NOT NULL, canonical_body text NOT NULL, content_hash text NOT NULL, searchable_text text NOT NULL,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(source_revision_id,institution_id) REFERENCES petros_document_source_revisions(id,institution_id),
 CONSTRAINT petros_content_units_identity_uq UNIQUE(id,institution_id,source_revision_id), CONSTRAINT petros_content_units_ordinal_uq UNIQUE(source_revision_id,ordinal),
 FOREIGN KEY(parent_id,institution_id,source_revision_id) REFERENCES petros_content_units(id,institution_id,source_revision_id),
 FOREIGN KEY(created_by,institution_id) REFERENCES institution_users(id,institution_id),
 CHECK(parent_id IS DISTINCT FROM id),
 CHECK(octet_length(canonical_body)<=98304 AND octet_length(searchable_text)<=64000),
 CHECK(content_hash ~ '^[a-f0-9]{64}$' AND content_hash=encode(sha256(convert_to(canonical_body,'UTF8')),'hex')),
 CHECK(canonical_body::jsonb=manifest-'id'-'contentHash'),
 CHECK(manifest ?& ARRAY['sourceId','sourceHash','representationHash','parentId','locator','processing','quality','capabilities','assets','concepts','relationships','claims']),
 CHECK(manifest->>'schemaVersion'='petros.v2.content-unit.v1' AND manifest->>'id'=id::text
  AND manifest->>'institutionId'=institution_id::text AND manifest->>'sourceRevisionId'=source_revision_id::text
  AND manifest->>'ordinal'=ordinal::text AND manifest->'payload'->>'kind'=kind AND manifest->>'contentHash'=content_hash
  AND manifest->>'searchableText'=searchable_text),
 CHECK(manifest->'capabilities'->'explain'->>'status'='unsupported' AND manifest->'capabilities'->'compute'->>'status'='unsupported'
  AND manifest->'capabilities'->'assess'->>'status'='unsupported')
);
CREATE INDEX petros_content_units_source_idx ON petros_content_units(institution_id,source_revision_id,ordinal);
CREATE INDEX petros_content_units_lexical_idx ON petros_content_units USING gin(to_tsvector('simple',searchable_text));
CREATE FUNCTION edrion_petros_m1_unit_provenance() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE r public.petros_document_source_revisions; l jsonb; BEGIN
 SELECT * INTO r FROM public.petros_document_source_revisions WHERE id=NEW.source_revision_id AND institution_id=NEW.institution_id AND format_version='v2';
 IF NOT FOUND OR NEW.manifest->>'sourceId'<>r.original_source_id::text OR NEW.manifest->>'sourceHash'<>r.checksum
  OR NEW.manifest->>'representationHash'<>r.v2_revision->>'representationHash' OR NEW.manifest->'processing'<>r.v2_revision->'processing'
  OR (NEW.manifest->>'parentId') IS DISTINCT FROM NEW.parent_id::text THEN RAISE EXCEPTION 'M1_SOURCE_PIN_MISMATCH' USING ERRCODE='23514'; END IF;
 l:=NEW.manifest->'locator';
 IF (l->>'kind'='pdf' AND (r.v2_revision->'source'->>'kind'<>'pdf' OR (l->>'page')::integer NOT BETWEEN 1 AND (r.v2_revision->>'pageCount')::integer))
 OR (l->>'kind'='slide' AND (r.v2_revision->'source'->>'kind'<>'pptx' OR (l->>'slide')::integer NOT BETWEEN 1 AND (r.v2_revision->>'slideCount')::integer))
 OR (l->>'kind'='synthetic' AND r.v2_revision->'source'->>'kind'<>'synthetic')
 OR l->>'kind' NOT IN('pdf','slide','synthetic','converted_slide') THEN RAISE EXCEPTION 'M1_INVALID_LOCATOR' USING ERRCODE='23514'; END IF;
 IF l->>'kind'='converted_slide' AND (r.v2_revision->'source'->>'kind'<>'legacy_ppt' OR l->>'convertedHash'<>r.v2_revision->'conversion'->>'convertedHash'
  OR NOT (r.v2_revision->'conversion'->'slideMap' @> jsonb_build_array(jsonb_build_object('originalSlide',(l->>'originalSlide')::integer,'convertedPage',(l->>'convertedPage')::integer))))
 THEN RAISE EXCEPTION 'M1_INVALID_CONVERSION_LINEAGE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER m1_unit_provenance BEFORE INSERT ON petros_content_units FOR EACH ROW EXECUTE FUNCTION edrion_petros_m1_unit_provenance();
CREATE TRIGGER m1_unit_immutable BEFORE UPDATE OR DELETE ON petros_content_units FOR EACH ROW EXECUTE FUNCTION edrion_petros_m1_immutable();
CREATE TRIGGER m1_concept_immutable BEFORE UPDATE OR DELETE ON petros_concepts FOR EACH ROW EXECUTE FUNCTION edrion_petros_m1_immutable();
CREATE TRIGGER m1_concept_version_immutable BEFORE UPDATE OR DELETE ON petros_concept_versions FOR EACH ROW EXECUTE FUNCTION edrion_petros_m1_immutable();
CREATE TRIGGER m1_units_no_truncate BEFORE TRUNCATE ON petros_content_units FOR EACH STATEMENT EXECUTE FUNCTION edrion_petros_m1_immutable();
CREATE TRIGGER m1_concepts_no_truncate BEFORE TRUNCATE ON petros_concepts FOR EACH STATEMENT EXECUTE FUNCTION edrion_petros_m1_immutable();
CREATE TRIGGER m1_versions_no_truncate BEFORE TRUNCATE ON petros_concept_versions FOR EACH STATEMENT EXECUTE FUNCTION edrion_petros_m1_immutable();
ALTER TABLE petros_content_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_content_units FORCE ROW LEVEL SECURITY;
ALTER TABLE petros_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_concepts FORCE ROW LEVEL SECURITY;
ALTER TABLE petros_concept_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_concept_versions FORCE ROW LEVEL SECURITY;
-- Concepts remain staff-only until M3's released scope supplies student concept admission.
ALTER TABLE knowledge_preparations ALTER COLUMN material_id DROP NOT NULL;
ALTER TABLE knowledge_preparations ALTER COLUMN material_version DROP NOT NULL;
ALTER TABLE knowledge_preparations ADD COLUMN operation_version text NOT NULL DEFAULT 'v1';
ALTER TABLE knowledge_preparations ADD COLUMN source_kind text NOT NULL DEFAULT 'material';
ALTER TABLE knowledge_preparations ADD COLUMN source_binding jsonb;
ALTER TABLE knowledge_preparations ADD COLUMN guidance_assignment_id uuid;
ALTER TABLE knowledge_preparations ADD COLUMN guidance_publication_version integer;
ALTER TABLE knowledge_preparations ADD CONSTRAINT m1_knowledge_preparation_binding CHECK ((
 (source_kind='material' AND operation_version IN('v1','v2') AND material_id IS NOT NULL AND material_version>0 AND guidance_assignment_id IS NULL)
 OR (operation_version='v2' AND source_kind='guidance_attachment' AND material_id IS NULL AND material_version IS NULL
 AND guidance_assignment_id IS NOT NULL AND guidance_publication_version>=0 AND source_binding IS NOT NULL
 AND source_binding->>'kind'='guidance_attachment' AND source_binding->>'assignmentId'=guidance_assignment_id::text
 AND source_binding->>'publicationVersion'=guidance_publication_version::text AND source_binding->>'objectId'=object_id::text)) IS TRUE);
CREATE OR REPLACE FUNCTION edrion_due_knowledge_preparations() RETURNS TABLE(id uuid,institution_id uuid,dispatch_sequence integer)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=off AS $$
 WITH due AS (SELECT p.id FROM public.knowledge_preparations p
  WHERE p.operation_version='v1' AND p.state IN('queued','running') AND p.next_dispatch_at<=now() AND p.next_attempt_at<=now()
   AND (p.lease_until IS NULL OR p.lease_until<=now()) ORDER BY p.next_dispatch_at,p.id LIMIT 20 FOR UPDATE SKIP LOCKED)
 UPDATE public.knowledge_preparations p SET next_dispatch_at=now()+interval '10 seconds',dispatch_sequence=p.dispatch_sequence+1
 FROM due WHERE p.id=due.id RETURNING p.id,p.institution_id,p.dispatch_sequence;
$$;
CREATE UNIQUE INDEX m1_guidance_preparation_uq ON knowledge_preparations(institution_id,object_id,guidance_assignment_id,guidance_publication_version,extractor_version) WHERE source_kind='guidance_attachment';
ALTER TABLE course_curriculum_revisions ADD COLUMN v2_concept_manifest jsonb;
-- Draft bindings do not establish approval. M3 owns V2 release and review writers.
ALTER TABLE petros_teaching_pack_candidates ALTER COLUMN source_item_id DROP NOT NULL;
ALTER TABLE petros_teaching_pack_candidates ADD COLUMN source_format text NOT NULL DEFAULT 'v1';
ALTER TABLE petros_teaching_pack_candidates ADD COLUMN source_revision_id uuid;
ALTER TABLE petros_teaching_pack_reviews ALTER COLUMN source_item_id DROP NOT NULL;
ALTER TABLE petros_teaching_pack_reviews ADD COLUMN source_format text NOT NULL DEFAULT 'v1';
ALTER TABLE petros_teaching_pack_reviews ADD COLUMN source_revision_id uuid;
ALTER TABLE petros_teaching_pack_candidates ADD CONSTRAINT m1_candidate_source_fk FOREIGN KEY(source_revision_id,institution_id) REFERENCES petros_document_source_revisions(id,institution_id);
ALTER TABLE petros_teaching_pack_reviews ADD CONSTRAINT m1_review_source_fk FOREIGN KEY(source_revision_id,institution_id) REFERENCES petros_document_source_revisions(id,institution_id);
ALTER TABLE petros_teaching_pack_candidates ADD CONSTRAINT m1_candidate_source_union CHECK (((source_format='v1' AND source_item_id IS NOT NULL AND source_revision_id IS NULL) OR (source_format='v2' AND source_revision_id IS NOT NULL AND schema_version='petros.v2.proposal.v1')) IS TRUE);
CREATE UNIQUE INDEX m1_candidate_v2_owner_uq ON petros_teaching_pack_candidates(id,institution_id,course_id,source_revision_id,payload_hash,source_version);
ALTER TABLE petros_teaching_pack_reviews ADD CONSTRAINT m1_review_v2_candidate_fk FOREIGN KEY(candidate_id,institution_id,course_id,source_revision_id,payload_hash,source_version)
 REFERENCES petros_teaching_pack_candidates(id,institution_id,course_id,source_revision_id,payload_hash,source_version);
ALTER TABLE petros_teaching_pack_reviews ADD CONSTRAINT m1_review_source_union CHECK ((
 (source_format='v1' AND source_item_id IS NOT NULL AND source_revision_id IS NULL)
 OR (source_format='v2' AND source_item_id IS NULL AND source_revision_id IS NOT NULL AND receipt->>'schemaVersion'='petros.v2.scope-review.v1')
) IS TRUE);
ALTER TABLE course_curriculum_revisions ADD CONSTRAINT m1_concept_manifest_bound CHECK(v2_concept_manifest IS NULL OR (
 v2_concept_manifest->>'schemaVersion'='petros.v2.concept-graph.v1' AND v2_concept_manifest->>'institutionId'=institution_id::text
 AND v2_concept_manifest->>'courseId'=course_id::text AND jsonb_array_length(v2_concept_manifest->'concepts') BETWEEN 1 AND 24
 AND jsonb_array_length(v2_concept_manifest->'edges')<=48 AND (v2_concept_manifest->>'traversalDepth')::integer BETWEEN 0 AND 2
) IS TRUE);
CREATE FUNCTION edrion_petros_m1_graph_manifest() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE g jsonb; pin jsonb; edge jsonb; approved boolean; BEGIN
 g:=NEW.v2_concept_manifest;
 IF g IS NULL THEN RETURN NEW; END IF;
 IF octet_length(g::text)>98304 OR jsonb_typeof(g->'concepts') IS DISTINCT FROM 'array' OR jsonb_typeof(g->'edges') IS DISTINCT FROM 'array'
  OR jsonb_array_length(g->'concepts') NOT BETWEEN 1 AND 24 OR jsonb_array_length(g->'edges')>48
  OR (SELECT count(DISTINCT p->>'id') FROM jsonb_array_elements(g->'concepts') p)<>jsonb_array_length(g->'concepts')
 THEN RAISE EXCEPTION 'M1_GRAPH_BOUNDS' USING ERRCODE='23514'; END IF;
 FOR pin IN SELECT * FROM jsonb_array_elements(g->'concepts') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.petros_concept_versions c WHERE c.concept_id::text=pin->>'id' AND c.version::text=pin->>'version' AND c.institution_id=NEW.institution_id)
  THEN RAISE EXCEPTION 'M1_UNKNOWN_CONCEPT_VERSION' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR edge IN SELECT * FROM jsonb_array_elements(g->'edges') LOOP
  IF edge->>'kind' NOT IN('hard_prerequisite','recommended','related')
   OR NOT (g->'concepts' @> jsonb_build_array(edge->'from') AND g->'concepts' @> jsonb_build_array(edge->'to'))
   OR edge->'from'->>'id'=edge->'to'->>'id'
  THEN RAISE EXCEPTION 'M1_INVALID_GRAPH_EDGE' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF EXISTS(WITH RECURSIVE edges AS (SELECT e->'from'->>'id' AS a,e->'to'->>'id' AS b FROM jsonb_array_elements(g->'edges') e WHERE e->>'kind'='hard_prerequisite'),
  reach(a,b) AS (SELECT a,b FROM edges UNION SELECT r.a,e.b FROM reach r JOIN edges e ON e.a=r.b) SELECT 1 FROM reach WHERE a=b)
 THEN RAISE EXCEPTION 'M1_GRAPH_CYCLE' USING ERRCODE='23514'; END IF;
 FOR edge IN SELECT * FROM jsonb_array_elements(g->'edges') LOOP
  SELECT EXISTS(SELECT 1 FROM public.petros_teaching_pack_reviews r
   JOIN public.petros_reviewer_qualifications q ON q.qualification_id=r.qualification_id AND q.qualification_version=r.qualification_version
   JOIN public.courses co ON co.id=NEW.course_id AND co.institution_id=NEW.institution_id
   JOIN public.institution_users u ON u.id=q.reviewer_user_id AND u.institution_id=NEW.institution_id
   JOIN public.staff st ON st.id=q.reviewer_staff_id AND st.institution_user_id=u.id AND st.institution_id=NEW.institution_id
   WHERE r.id::text=edge->'review'->>'reviewId' AND r.payload_hash=edge->'review'->>'payloadHash'
    AND r.institution_id=NEW.institution_id AND r.course_id=NEW.course_id AND r.decision='approved'
    AND q.reviewer_user_id=r.reviewer_user_id AND q.subject_key=co.subject_id::text
    AND co.status='active' AND u.status='active' AND u.disabled_at IS NULL
    AND u.password_reset_required_at IS NULL AND st.status='active'
    AND NOT (u.direct_denies ? '*' OR u.direct_denies ? 'syllabus.manage' OR u.direct_denies ? 'academics.alignments.approve')
    AND q.status='active' AND q.valid_from<=now() AND q.valid_until>now()
    AND NOT EXISTS(SELECT 1 FROM public.petros_reviewer_qualifications newer WHERE newer.qualification_id=q.qualification_id AND newer.qualification_version>q.qualification_version)
    AND NOT EXISTS(SELECT 1 FROM public.petros_teaching_pack_reviews newer WHERE newer.candidate_id=r.candidate_id AND newer.review_version>r.review_version)
    AND NOT EXISTS(SELECT 1 FROM public.petros_teaching_pack_review_revocations v WHERE v.review_id=r.id)
    AND r.receipt->'approvedConceptEdges' @> jsonb_build_array(edge-'review')) INTO approved;
  IF NOT approved THEN RAISE EXCEPTION 'M1_UNAUTHORIZED_CONCEPT_MAPPING' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER m1_graph_manifest BEFORE INSERT ON course_curriculum_revisions FOR EACH ROW EXECUTE FUNCTION edrion_petros_m1_graph_manifest();
