/** Local demonstration ONLY. Disposable cluster and loopback listener; production bootstrap is never used. */
import 'reflect-metadata';
import express from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expandEffectiveKeys } from '@edrion/permissions';
import { ALL_INSTITUTION_PERMISSION_KEYS } from '@edrion/permissions/institution';
import { resolveNomenclature } from '@edrion/shared-types';
import { randomUUID } from 'node:crypto';
import {
  startM3Fixture,
  m3FixtureRoot,
} from '../src/modules/integrations/petros-m3-fixture';
import { PetrosTeacherGuidanceService } from '../src/modules/portal/teaching/petros-teacher-guidance.service';
import { PortalTeachingService } from '../src/modules/portal/teaching/portal-teaching.service';
import { controlledSourceProposal } from '../src/modules/portal/teaching/petros-learning-proposal.fixture';
import { eq, schema } from '@edrion/database';
async function main() {
  const ordinary = await startM3Fixture(),
    app = express();
  let reviewerFixture: Awaited<ReturnType<typeof startM3Fixture>> | null = null;
  const f = ordinary;
  const fixtureFor = (req: express.Request) =>
    req.headers.cookie?.includes('petros_ux_actor=reviewer') && reviewerFixture
      ? reviewerFixture
      : ordinary;
  // The disposable database has strict short lock deadlines. Queue harness requests
  // per fixture so React development-mode duplicate reads cannot exhaust them.
  // Every request still enters its original App-role authority and transaction.
  const queues = new WeakMap<
    Awaited<ReturnType<typeof startM3Fixture>>,
    Promise<unknown>
  >();
  const runFor = <T>(
    req: express.Request,
    work: (
      ctx: import('../src/modules/portal/portal-action-context').PortalActionContext,
    ) => Promise<T>,
  ) => {
    const target = fixtureFor(req);
    const task = (queues.get(target) ?? Promise.resolve()).then(() =>
      target === ordinary ? ordinary.run(work) : target.runReviewer(work),
    );
    queues.set(
      target,
      task.catch(() => undefined),
    );
    return task;
  };
  const evidenceRoot = resolve(
    m3FixtureRoot,
    'docs/verification/petros-v2/m3-teacher-ux-final-evidence',
  );
  mkdirSync(evidenceRoot, { recursive: true });
  const cloud = await f.document('cloud-models.pptx', 'cloud'),
    english = await f.document('argument.pdf', 'argument');
  await f.document('m2fa/cloud-notes.docx', 'cloud');
  await f.document('m2fa/cloud-notes.txt', 'cloud');
  await f.document('m2fa/argument-notes.md', 'argument');
  for (const [domain, file] of [
    ['cloud', cloud],
    ['argument', english],
  ] as const)
    await f.run((ctx) =>
      f.service.prepareControlled(
        ctx,
        f.classId,
        f.subjects[domain],
        { commandId: randomUUID(), sourceRevisionId: file.revision.id },
        (units) => controlledSourceProposal(units, domain),
      ),
    );
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (
      origin &&
      !['http://127.0.0.1:4914', 'http://localhost:4914'].includes(origin)
    )
      return res.status(403).end();
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader(
      'Access-Control-Allow-Headers',
      'content-type,x-institution-scope,x-institution-user-email',
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  // Explicit isolated synthetic handoff only. This endpoint never belongs to an application module.
  app.get('/demo/reviewer', async (_req, res) => {
    try {
      if (!reviewerFixture) {
        const rf = await startM3Fixture();
        reviewerFixture = rf;
        const privateSource = await rf.document(
          'm3/private-review-source.txt',
          'cloud',
        );
        await rf.qualification('cloud', 'active', undefined, true);
        let proposal = (
          await rf.run((ctx) =>
            rf.service.prepare(ctx, rf.classId, rf.subjects.cloud, {
              commandId: randomUUID(),
              sourceRevisionId: privateSource.revision.id,
            }),
          )
        ).proposal;
        proposal = (
          await rf.run((ctx) =>
            rf.service.edit(ctx, rf.classId, proposal.subjectId, proposal.id, {
              commandId: randomUUID(),
              expectedVersion: proposal.version,
              change: { kind: 'submit_review' },
            }),
          )
        ).proposal;
        await rf.admin
          .update(schema.storageObjects)
          .set({ ownerStaffUserId: rf.reviewer })
          .where(eq(schema.storageObjects.id, privateSource.objectId));
        await rf.admin
          .update(schema.classSubjectTeachers)
          .set({ teacherId: rf.reviewerStaff })
          .where(eq(schema.classSubjectTeachers.subjectId, proposal.subjectId));
        const task = proposal.taskCandidates.find(
          (t) => t.kind === 'held_out_verification',
        )!;
        await rf.runReviewer((ctx) =>
          rf.service.prepareVerification(
            ctx,
            rf.classId,
            proposal.subjectId,
            proposal.id,
            task.id,
            {
              commandId: randomUUID(),
              expectedVersion: proposal.version,
              expectedFamilyVersion: 0,
            },
          ),
        );
      }
      res.cookie('petros_ux_actor', 'reviewer', {
        httpOnly: true,
        sameSite: 'lax',
      });
      res.redirect(
        `http://127.0.0.1:4914/teaching/${reviewerFixture.classId}/${reviewerFixture.subjects.cloud}#petros-reviews`,
      );
    } catch (e) {
      res.status(500).json({
        message: e instanceof Error ? e.message : 'Synthetic setup failed',
      });
    }
  });
  app.get('/demo/teacher', (_req, res) => {
    res.clearCookie('petros_ux_actor');
    res.redirect(
      `http://127.0.0.1:4914/teaching/${ordinary.classId}/${ordinary.subjects.cloud}#petros-lessons-material`,
    );
  });
  app.get('/demo-info', (_req, res) =>
    res.json({
      classId: f.classId,
      subjects: f.subjects,
      institutionId: f.institutionId,
      label: 'Controlled fixtures; disposable authorization-path demonstration',
    }),
  );
  app.get('/v1/portal/me', async (req, res) => {
    const principal = await runFor(req, (ctx) =>
      Promise.resolve(ctx.principal),
    );
    res.json({
      ...principal,
      fullName: fixtureFor(req) === ordinary ? 'Sample teacher' : 'Sample reviewer',
      permissions: expandEffectiveKeys(
        principal.permissions,
        ALL_INSTITUTION_PERMISSION_KEYS,
      ),
      institutionName: 'Isolated lesson preview',
      institutionStatus: 'active',
      onboardingStatus: 'completed',
      institutionType: 'school',
      institutionCountry: 'IN',
      campuses: [],
      featureFlags: {},
      nomenclature: resolveNomenclature('school'),
      navigation: {},
      timeZone: 'Asia/Kolkata',
    });
  });
  app.all(
    '/v1/portal/teaching/:classId/:subjectId/proposals/:id?/:action?/:detail?',
    async (req, res) => {
      const { classId, subjectId, id, action, detail } = req.params;
      try {
        const f = fixtureFor(req);
        const value = await runFor(req, (ctx) => {
          if (req.method === 'GET' && id === 'sources')
            return f.service.sources(ctx, classId, subjectId);
          if (req.method === 'POST' && !id)
            return f.service.prepare(ctx, classId, subjectId, req.body);
          if (req.method === 'GET' && id && !action)
            return f.service.view(ctx, classId, subjectId, id);
          if (req.method === 'GET' && action === 'evidence')
            return f.service.evidence(ctx, classId, subjectId, id!, detail!);
          if (req.method === 'GET' && action === 'readiness')
            return f.service.readiness(ctx, classId, subjectId, id!);
          if (req.method === 'GET' && action === 'revisions')
            return f.service.view(ctx, classId, subjectId, id!, Number(detail));
          if (req.method === 'POST' && action === 'edits')
            return f.service.edit(ctx, classId, subjectId, id!, req.body);
          if (req.method === 'POST' && action === 'reviews')
            return f.service.review(ctx, classId, subjectId, id!, req.body);
          if (req.method === 'GET' && action === 'verification')
            return f.service.verificationPreview(
              ctx,
              classId,
              subjectId,
              id!,
              detail!,
            );
          if (req.method === 'POST' && action === 'verification')
            return f.service.prepareVerification(
              ctx,
              classId,
              subjectId,
              id!,
              detail!,
              req.body,
            );
          if (req.method === 'POST' && action === 'release')
            return f.service.release(ctx, classId, subjectId, id!, req.body);
          throw new Error('Unsupported isolated demonstration request');
        });
        res.json(value);
      } catch (e) {
        const err = e as {
          getStatus?: () => number;
          getResponse?: () => unknown;
          message?: string;
        };
        const response = err.getResponse?.();
        res
          .status(err.getStatus?.() ?? 500)
          .json(
            typeof response === 'object'
              ? { ...(response as object), message: err.message }
              : { message: err.message },
          );
      }
    },
  );
  app.get('/v1/portal/teaching/:classId/:subjectId/guidance', async (req, res) => {
    try {
      const data = await runFor(req, ctx => {
        const db=fixtureFor(req).f.db;
        return new PetrosTeacherGuidanceService(db,new PortalTeachingService(db),fixtureFor(req).f.auditWriter,null as never)
          .workspace(ctx,req.params.classId,req.params.subjectId);
      });
      res.json({...data, assignmentAvailability:{available:false,reason:'Student assignment is disabled in this isolated lesson preview. The enrolled students are permitted fixture recipients; no learning goal has been created.'}});
    } catch (e) {
      const err=e as {getStatus?:()=>number;message?:string};
      res.status(err.getStatus?.()??500).json({message:err.message});
    }
  });
  app.post('/v1/portal/teaching/:classId/:subjectId/guidance', (_req,res)=>res.status(403).json({message:'Student assignment is disabled in this isolated lesson preview.'}));
  app.get('/v1/portal/teaching/:classId/:subjectId', async (req, res) => {
    try {
      res.json(
        await runFor(req, (ctx) =>
          new PortalTeachingService(fixtureFor(req).f.db).assignment(
            ctx,
            req.params.classId,
            req.params.subjectId,
          ),
        ),
      );
    } catch {
      res.status(404).json({ message: 'Unavailable' });
    }
  });
  // Surrounding portal chrome receives empty synthetic lists. Proposal operations above are real App-role service calls.
  app.get('/v1/portal/auth/institutions', (_req, res) =>
    res.json({ institutions: [] }),
  );
  app.get('/v1/*', (_req, res) => res.json({ items: [], rows: [], total: 0 }));
  const server = app.listen(4913, '127.0.0.1', () => {
    const info = {
      reviewer: 'http://127.0.0.1:4913/demo/reviewer',
      teacher: 'http://127.0.0.1:4913/demo/teacher',
      cloud: `http://127.0.0.1:4914/teaching/${f.classId}/${f.subjects.cloud}`,
      english: `http://127.0.0.1:4914/teaching/${f.classId}/${f.subjects.argument}`,
    };
    writeFileSync(
      resolve(evidenceRoot, 'demo-info.json'),
      JSON.stringify(info, null, 2),
    );
    console.log(JSON.stringify(info));
  });
  const stop = () =>
    server.close(() => {
      void Promise.all([ordinary.f.close(), reviewerFixture?.f.close()]).then(
        () => process.exit(0),
      );
    });
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
