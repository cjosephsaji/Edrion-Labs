/** Loopback-only synthetic engineering demo. No configured DB, real reviewer or external model. */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInStudentTenant, schema } from '@edrion/database';
import { startM5Fixture, submitM5 } from '../src/modules/student/petros-v2/petros-m5.fixture';
import { m4HttpFixture } from '../src/modules/student/petros-v2/petros-v2-http.fixture';
import { m4IsolatedQueue } from '../src/modules/student/petros-v2/petros-v2-queue.fixture';
import { StudentSessionService } from '../src/modules/student/core/student-session.service';
import type { Express, Request, Response } from 'express';
let cleanup: undefined | (() => Promise<void>);
async function main() {
  if (
    !process.env.PETROS_M5_EVIDENCE_DIR ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_MIGRATION_URL ||
    Object.keys(process.env).some((k) => k.startsWith('PG') && process.env[k])
  )
    throw new Error('M5_ISOLATED_ENVIRONMENT_REQUIRED');
  const out = resolve(process.env.PETROS_M5_EVIDENCE_DIR);
  const apiPort = Number(process.env.PETROS_M5_API_PORT ?? 4943);
  const studentPort = Number(process.env.PETROS_M5_WEB_PORT ?? 4944);
  if (
    ![apiPort, studentPort].every(
      (port) => Number.isInteger(port) && port >= 1024 && port <= 65535,
    ) ||
    apiPort === studentPort
  )
    throw new Error('M5_INVALID_LOOPBACK_PORTS');
  mkdirSync(out, { recursive: true });
  if (existsSync(resolve(out, 'demo-info.json')))
    throw new Error('M5_NEW_EVIDENCE_DIRECTORY_REQUIRED');
  const f = await startM5Fixture({ practiceRetries: true });
  cleanup = () => f.close();
  f.env.STUDENT_SESSION_COOKIE_NAME = apiPort === 4943 ? 'm4_student' : `m5_student_${apiPort}`;
  f.env.API_CORS_ORIGINS = [`http://127.0.0.1:${studentPort}`];
  f.env.SESSION_COOKIE_SECRET = randomUUID() + randomUUID();
  f.env.SESSION_TTL_SECONDS = 86400;
  const owners: Record<string, typeof f.student> = {
    'cloud-a': f.student,
    'cloud-b': f.other,
  };
  for (const role of [
    'english',
    'mobile',
    'reduced',
    'companion',
    'method-preview',
    'reading-preview',
    'relationship-preview',
    'argument-preview',
    'graph-preview',
    'process-preview',
    'experiment-preview',
  ]) {
    const id = randomUUID(),
      userId = randomUUID();
    await f.f.admin.insert(schema.institutionUsers).values({
      id: userId,
      institutionId: f.student.institutionId,
      fullName: `Synthetic M5 ${role}`,
      email: `m5-${role}@example.test`,
      status: 'active',
    });
    await f.f.admin
      .insert(schema.institutionUserRoles)
      .values({ institutionUserId: userId, roleKey: 'student' });
    await f.f.admin.insert(schema.students).values({
      id,
      institutionId: f.student.institutionId,
      institutionUserId: userId,
      classId: f.f.classId,
      admissionNo: randomUUID(),
      firstName: 'Synthetic',
      lastName: role,
    });
    await f.f.admin.insert(schema.courseEnrollments).values(
      Object.values(f.f.courses).map((courseId) => ({
        institutionId: f.student.institutionId,
        courseId,
        studentId: id,
      })),
    );
    owners[role] = await f.principal(userId);
  }
  const cloud = await f.m5Lesson('cloud'),
    english = await f.m5Lesson('argument');
  const ids: Record<string, string> = {},
    issuer = new StudentSessionService(f.f.f.db, f.env),
    queue = await m4IsolatedQueue(f);
  cleanup = async () => {
    await queue.close();
    await f.close();
  };
  const info = {
    label:
      'M5 isolated engineering: extracted CC0 sources, synthetic qualification records, deterministic evaluation, no genuine provider inference.',
    api: `http://127.0.0.1:${apiPort}`,
    student: `http://127.0.0.1:${studentPort}`,
    roles: Object.fromEntries(
      Object.keys(owners).map((k) => [k, `http://127.0.0.1:${apiPort}/demo/${k}`]),
    ),
    sessions: ids,
    sources: {
      cloud: {
        hash: cloud.file.revision.source.originalHash,
        revisionId: cloud.file.revision.id,
      },
      english: {
        hash: english.file.revision.source.originalHash,
        revisionId: english.file.revision.id,
      },
    },
    expertGate: 'pending',
    providerGate: 'unverified',
  };
  const setup = (app: Express) => {
    app.get('/demo/:role', async (req: Request, res: Response) => {
      const role = String(req.params.role),
        owner = owners[role as keyof typeof owners];
      if (!owner) return res.status(404).end();
      try {
        const publication = role === 'english' || role === 'argument-preview' ? english : cloud;
        if (ids[role] && req.query.fresh === '1') {
          const old = await f.sessions.get(owner, ids[role]!);
          if (old.status !== 'closed') await f.command(old, 'close', {}, owner);
          delete ids[role];
        }
        if (!ids[role]) {
          let s = await f.start(publication.publication.id, owner);
          if (!s.task && role !== 'reading-preview') s = await f.command(s, 'next', {}, owner);
          // One-click visual review of the real calculation workflow. This actor
          // and its submitted answer belong only to the disposable demo database.
          if (
            [
              'method-preview',
              'relationship-preview',
              'argument-preview',
              'graph-preview',
              'process-preview',
              'experiment-preview',
            ].includes(role)
          ) {
            s = await submitM5(
              f,
              s,
              {
                kind: 'structured',
                values:
                  role === 'argument-preview'
                    ? {
                        survey: 'preference',
                        reason:
                          'The survey describes the sampled learners. It does not establish what every resident thinks.',
                      }
                    : {
                        responsibility: role === 'relationship-preview' ? 'provider' : 'consumer',
                        available: 48,
                        capacity: role === 'method-preview' ? 7 : 6,
                      },
              },
              owner,
            );
            s = await f.command(s, 'teach', {}, owner);
            while (s.teaching?.status === 'presenting')
              s = await f.command(
                s,
                'teaching_step',
                {
                  actionId: s.teaching.actionId,
                  nextBeat: s.teaching.nextBeat,
                },
                owner,
              );
            const preference =
              role === 'graph-preview'
                ? 'graph'
                : role === 'process-preview'
                  ? 'process'
                  : role === 'experiment-preview'
                    ? 'experiment'
                    : null;
            if (preference) {
              s = await f.command(s, 'teach', { preference }, owner);
              while (s.teaching?.status === 'presenting')
                s = await f.command(
                  s,
                  'teaching_step',
                  { actionId: s.teaching.actionId, nextBeat: s.teaching.nextBeat },
                  owner,
                );
            }
          }
          ids[role] = s.id;
        }
        const issued = await runInStudentTenant(f.f.f.db, owner, () =>
          issuer.issue({
            kind: 'institutional',
            userId: owner.institutionUserId,
            institutionId: owner.institutionId,
            userAgent: 'M5 isolated handoff',
          }),
        );
        res.cookie(issuer.cookieName, issued.token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: false,
          path: '/',
          maxAge: 86400000,
        });
        writeFileSync(resolve(out, 'demo-info.json'), JSON.stringify(info, null, 2));
        return res.redirect(`${info.student}/petros/v2/session?session=${ids[role]}`);
      } catch (error) {
        return res
          .status(500)
          .json({ message: error instanceof Error ? error.message : 'Demo unavailable' });
      }
    });
    app.get('/demo-info', (_req: Request, res: Response) => res.json(info));
  };
  const app = await m4HttpFixture(f, queue.worker, undefined, setup);
  await app.listen(apiPort, '127.0.0.1');
  writeFileSync(resolve(out, 'demo-info.json'), JSON.stringify(info, null, 2));
  process.stdout.write(`M5 demo API ready at ${info.api}/demo/cloud-a\n`);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await app.close();
    await queue.close();
    await f.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void close());
  process.once('SIGINT', () => void close());
}
void main().catch(async (e) => {
  console.error(e);
  await cleanup?.();
  process.exitCode = 1;
});
