-- knowledge_chunks_replay.sql
-- Replays the 15 objects that failed during the edrionlabs import.
-- Prerequisite: pgvector must be installed for PostgreSQL 18 first.
-- Run: psql -h localhost -U postgres -d edrionlabs -v ON_ERROR_STOP=1 -f knowledge_chunks_replay.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TABLE public.knowledge_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    knowledge_item_id uuid NOT NULL,
    institution_id uuid,
    student_id uuid,
    independent_user_id uuid,
    page integer NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding public.vector(1536),
    CONSTRAINT knowledge_chunks_owner_xor CHECK ((num_nonnulls(student_id, independent_user_id) = 1))
);

ALTER TABLE ONLY public.knowledge_chunks FORCE ROW LEVEL SECURITY;

ALTER TABLE public.knowledge_chunks OWNER TO macbook;

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_item_chunk_uq UNIQUE (knowledge_item_id, page, chunk_index);

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_pkey PRIMARY KEY (id);

CREATE INDEX knowledge_chunks_item_page_idx ON public.knowledge_chunks USING btree (knowledge_item_id, page, chunk_index);

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_independent_user_id_fkey FOREIGN KEY (independent_user_id) REFERENCES public.independent_users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_knowledge_item_id_fkey FOREIGN KEY (knowledge_item_id) REFERENCES public.knowledge_items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_chunks_owner_private ON public.knowledge_chunks USING ((((public.edrion_current_student() IS NULL) AND (public.edrion_current_independent_user() IS NULL)) OR ((public.edrion_current_student() IS NOT NULL) AND ((student_id)::text = public.edrion_current_student()) AND ((institution_id IS NULL) OR (public.edrion_current_institution() IS NULL) OR ((institution_id)::text = public.edrion_current_institution()))) OR ((public.edrion_current_independent_user() IS NOT NULL) AND ((independent_user_id)::text = public.edrion_current_independent_user())))) WITH CHECK ((((public.edrion_current_student() IS NULL) AND (public.edrion_current_independent_user() IS NULL)) OR ((public.edrion_current_student() IS NOT NULL) AND ((student_id)::text = public.edrion_current_student()) AND ((institution_id IS NULL) OR (public.edrion_current_institution() IS NULL) OR ((institution_id)::text = public.edrion_current_institution()))) OR ((public.edrion_current_independent_user() IS NOT NULL) AND ((independent_user_id)::text = public.edrion_current_independent_user()))));

CREATE POLICY knowledge_chunks_tenant_isolation ON public.knowledge_chunks USING (((public.edrion_current_institution() IS NULL) OR ((institution_id)::text = public.edrion_current_institution()))) WITH CHECK (((public.edrion_current_institution() IS NULL) OR ((institution_id)::text = public.edrion_current_institution())));

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.knowledge_chunks TO edrion_app;

COMMIT;
