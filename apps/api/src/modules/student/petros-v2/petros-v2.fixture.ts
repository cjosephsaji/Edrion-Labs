/** Disposable synthetic institutional records. Not imported by application modules. */
import type { ApiEnv } from '@edrion/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq, runInScopedTenant, runInStudentTenant, schema } from '@edrion/database';
import { initialSharedCanvas, type M3Proposal, type M3ModelProposal } from '@edrion/schemas';
import { startM3Fixture, m3FixtureRoot } from '../../integrations/petros-m3-fixture';
import { controlledSourceProposal } from '../../portal/teaching/petros-learning-proposal.fixture';
import { PetrosTeachingPackRepository } from '../knowledge/petros-teaching-pack.repository';
import { PetrosV2PublicationService } from '../knowledge/petros-v2-publication.service';
import { PetrosV2SessionRepository } from './petros-v2-session.repository';
import { PetrosV2SessionService } from './petros-v2-session.service';
import { PetrosV2AssessmentService } from './petros-v2-assessment.service';
import { PetrosV2CommandWorker } from './petros-v2-command.worker';
import { PetrosEvidenceAdmissionService } from '../../petros-learner-model/petros-evidence-admission.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { SurfacesService } from '../surfaces/surfaces.service';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import { FeatureControlsRepository } from '../../feature-controls/feature-controls.repository';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { m4Hash, m4InstrumentSchema, type M4Instrument } from './petros-v2-contracts.server';
import { PetrosSessionIntentRepository } from '../petros-session-intent/petros-session-intent.repository';

export async function startM4Fixture() {
  const f = await startM3Fixture();
  try {
    await f.f.adminSql.unsafe(
      readFileSync(
        resolve(m3FixtureRoot, 'packages/database/migrations/sql/zzzzz_petros_m4.sql'),
        'utf8',
      ),
    );
    await f.f.adminSql.unsafe('ALTER ROLE edrion_petros_v2_evaluator LOGIN');
    const env = {
      NODE_ENV: 'test',
      PETROS_V2_SESSIONS_ENABLED: true,
      PETROS_V2_EVALUATOR_DATABASE_URL: `postgres://edrion_petros_v2_evaluator@localhost/postgres?host=${encodeURIComponent(f.f.directory)}`,
      PETROS_ADAPTIVE_TEACHING_ENABLED: true,
      PETROS_TEACHER_AUTHORING_ENABLED: true,
      STUDENT_STORAGE_DIR: f.f.directory,
    } as unknown as ApiEnv;
    const publicationOwner = new PetrosV2PublicationService(
      f.f.db,
      env,
      f.packs,
      new PetrosTeachingPackRepository(f.f.db),
    );
    const auth = new StudentAuthService(
      f.f.db,
      f.f.auditWriter,
      env,
      null as never,
      null as never,
      null as never,
    );
    const surfaces = new SurfacesService(
      new FeatureControlsService(new FeatureControlsRepository(f.f.db), f.f.auditWriter),
    );
    const repo = new PetrosV2SessionRepository(
        f.f.db,
        new PetrosSessionIntentRepository(f.f.db, null as never),
      ),
      evidence = new PetrosEvidenceAdmissionService(f.f.db);
    const sessions = new PetrosV2SessionService(
        f.f.db,
        env,
        repo,
        auth,
        surfaces,
        evidence,
        f.units,
      ),
      assessment = new PetrosV2AssessmentService(env);
    await assessment.onModuleInit();
    const principal = async (userId = f.studentUser) =>
      runInScopedTenant(f.f.db, { institutionId: f.institutionId, institutionUserId: userId }, () =>
        auth.resolveInstitutionalWorker(userId),
      );
    const student = await principal(),
      other = await principal(f.otherUser);
    const worker = new PetrosV2CommandWorker(
      sessions,
      assessment,
      { enabled: false, enqueue: async () => null } as never,
      { register: () => {} } as never,
    );
    async function lesson(
      domain: 'cloud' | 'argument',
      canvasEnabled = false,
      helpPolicy: 'no_hints' | 'assisted_practice' = 'no_hints',
      extension?: {
        sourceName?: string;
        proposal?: (p: M3ModelProposal) => M3ModelProposal;
        instruments: (base: M4Instrument, p: M3Proposal) => M4Instrument[];
      },
    ) {
      await f.admin
        .update(schema.classSubjectTeachers)
        .set({ teacherId: f.staffId })
        .where(eq(schema.classSubjectTeachers.subjectId, f.subjects[domain]));
      const file = await f.document(
        extension?.sourceName ?? (domain === 'cloud' ? 'cloud-models.pptx' : 'argument.pdf'),
        domain,
      );
      let p = (
        await f.run((ctx) =>
          f.service.prepareControlled(
            ctx,
            f.classId,
            f.subjects[domain],
            { commandId: randomUUID(), sourceRevisionId: file.revision.id },
            (units) => {
              const proposal = controlledSourceProposal(units, domain);
              if (domain === 'cloud' && !extension)
                proposal.claims[0]!.statement =
                  'In SaaS, the consumer manages access policy and the provider manages the application platform.';
              return extension?.proposal ? extension.proposal(proposal) : proposal;
            },
          ),
        )
      ).proposal;
      p = (
        await f.run((ctx) =>
          f.service.edit(ctx, f.classId, p.subjectId, p.id, {
            commandId: randomUUID(),
            expectedVersion: p.version,
            change: { kind: 'submit_review' },
          }),
        )
      ).proposal;
      const authorQ = await f.qualification(domain),
        reviewQ = await f.qualification(domain, 'active', undefined, true);
      const scoped = <T>(actor: string, work: () => Promise<T>) =>
        runInScopedTenant(
          f.f.db,
          {
            institutionId: f.institutionId,
            institutionUserId: actor,
            sourceItemId: file.id,
            courseId: f.courses[domain],
          },
          work,
        );
      const canvas = initialSharedCanvas(`activity-${p.objectives[0]!.selectedActivityId}`);
      canvas.mode = 'session';
      canvas.elements = [
        {
          id: 'student-note',
          version: 1,
          label: 'Your working note',
          kind: 'text',
          text: 'Write an observation',
          sourceId: 'student-work',
          editable: true,
        },
      ];
      canvas.invitation = {
        id: 'm4-edit',
        prompt: 'Record your working observation.',
        editableIds: ['student-note'],
        allowedOperations: ['replace_content', 'erase'],
        submitted: false,
      };
      const instrument = m4InstrumentSchema.parse({
        schemaVersion: 'petros.v2.m4-private-instrument.v1',
        id: randomUUID(),
        version: 1,
        proposalId: p.id,
        proposalVersion: p.version,
        proposalHash: m4Hash(p),
        objectiveId: p.objectives[0]!.id,
        objectiveVersion: p.objectives[0]!.version,
        sourceRevisionId: p.source.revisionId,
        sourceHash: p.source.originalHash,
        equivalenceKey: `fixture-${domain}-responsibility-v1`,
        kind: 'criterion_observation',
        publicTask: {
          prompt:
            domain === 'cloud'
              ? 'A team uses ready-made cloud software. Identify the consumer’s responsibility and the boundary that explains it.'
              : 'Identify the author’s claim, the supporting evidence, and explain how the evidence supports the claim.',
          passage: domain === 'argument' ? p.claims.map((c) => c.statement).join('\n\n') : null,
          responseKind: domain === 'cloud' ? 'structured' : 'text',
          choices: [],
          fields:
            domain === 'cloud'
              ? [
                  {
                    id: 'responsibility',
                    label: 'Who manages the consumer’s access policy?',
                    kind: 'choice',
                    choices: [
                      { id: 'consumer', label: 'The consumer' },
                      { id: 'provider', label: 'The provider' },
                    ],
                  },
                  {
                    id: 'reason',
                    label: 'Which boundary explains your answer?',
                    kind: 'choice',
                    choices: [
                      {
                        id: 'data_access',
                        label: 'The consumer retains access-policy responsibilities',
                      },
                      {
                        id: 'all_transferred',
                        label: 'All responsibilities transfer to the provider',
                      },
                    ],
                  },
                ]
              : [],
          helpPolicy,
          citation:
            domain === 'cloud'
              ? 'Cloud service models · reviewed source excerpt'
              : 'English argument passage · reviewed source excerpt',
        },
        criteria:
          domain === 'cloud'
            ? [
                {
                  id: randomUUID(),
                  label: 'Consumer responsibility',
                  checker: { kind: 'exact', field: 'responsibility', accepted: ['consumer'] },
                },
                {
                  id: randomUUID(),
                  label: 'Responsibility boundary',
                  checker: { kind: 'exact', field: 'reason', accepted: ['data_access'] },
                },
              ]
            : [
                'Claim identification',
                'Evidence identification',
                'Explanation and alternatives',
              ].map((label) => ({
                id: randomUUID(),
                label,
                checker: {
                  kind: 'qualitative',
                  rubric:
                    'Use the cited passage; preserve defensible alternatives. M4_PRIVATE_SENTINEL_9817',
                  alternatives: ['A defensible interpretation requires qualified review.'],
                },
              })),
        publicCanvas: canvasEnabled ? canvas : null,
        privateDiscriminators: ['M4_PRIVATE_SENTINEL_9817'],
      });
      const instrumentList = extension ? extension.instruments(instrument, p) : [instrument];
      const candidates: Array<
        Awaited<ReturnType<PetrosV2PublicationService['registerInstrument']>>
      > = [];
      for (const item of instrumentList)
        candidates.push(
          await f.run((ctx) =>
            scoped(f.teacher, () => publicationOwner.registerInstrument(ctx, p, item, authorQ)),
          ),
        );
      const candidate = candidates[0]!;
      await f.admin
        .update(schema.storageObjects)
        .set({ ownerStaffUserId: f.reviewer })
        .where(eq(schema.storageObjects.id, file.objectId));
      await f.admin
        .update(schema.classSubjectTeachers)
        .set({ teacherId: f.reviewerStaff })
        .where(eq(schema.classSubjectTeachers.subjectId, p.subjectId));
      for (const dimension of ['teaching_scope', 'concepts', 'activities'])
        await f.runReviewer((ctx) =>
          f.service.review(ctx, f.classId, p.subjectId, p.id, {
            commandId: randomUUID(),
            expectedVersion: p.version,
            qualificationId: reviewQ,
            qualificationVersion: 1,
            dimension,
            decision: 'approved',
            reason:
              'Synthetic independent fixture review for isolated M4 engineering. No actual academic approval.',
          }),
        );
      for (const item of candidates)
        await f.runReviewer((ctx) =>
          scoped(f.reviewer, () => publicationOwner.reviewInstrument(ctx, p, item.id, reviewQ)),
        );
      const publication = await f.runReviewer((ctx) =>
        scoped(f.reviewer, () =>
          publicationOwner.publish(
            ctx,
            p,
            candidates.map((c) => c.id),
            canvasEnabled ? canvas : null,
          ),
        ),
      );
      return {
        file,
        p,
        instrument: instrumentList[0]!,
        instruments: instrumentList,
        publication,
        reviewQ,
        candidate,
      };
    }
    async function start(publicationId: string, p: InstitutionalStudentPrincipal = student) {
      const intentId = await sessions.prepareIntent(p, publicationId);
      const result = await sessions.admit(p, { intentId, commandId: randomUUID() });
      return sessions.get(p, result.id);
    }
    async function command(
      s: Awaited<ReturnType<typeof start>>,
      type: string,
      extra: Record<string, unknown> = {},
      p = student,
    ) {
      await sessions.command(p, s.id, {
        commandId: randomUUID(),
        expectedRevision: s.revision,
        epoch: s.epoch,
        type,
        ...extra,
      });
      return sessions.get(p, s.id);
    }
    return {
      f,
      env,
      auth,
      surfaces,
      repo,
      sessions,
      assessment,
      worker,
      student,
      other,
      principal,
      lesson,
      start,
      command,
      evidence,
      close: async () => {
        await assessment.onModuleDestroy();
        await f.f.close();
      },
      studentRun: <T>(work: () => Promise<T>, p = student) => runInStudentTenant(f.f.db, p, work),
    };
  } catch (error) {
    await f.f.close();
    throw error;
  }
}
export type M4Fixture = Awaited<ReturnType<typeof startM4Fixture>>;
