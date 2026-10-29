/** Loopback-only M4 engineering demo. Refuses configured targets; all owners use a disposable cluster. */
import 'reflect-metadata';
import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq, runInStudentTenant, schema } from '@edrion/database';
import { startM4Fixture } from '../src/modules/student/petros-v2/petros-v2.fixture';
import { m4HttpFixture } from '../src/modules/student/petros-v2/petros-v2-http.fixture';
import { m4IsolatedQueue } from '../src/modules/student/petros-v2/petros-v2-queue.fixture';
import { m4V1Owners } from '../src/modules/student/petros-v2/petros-v2-v1.fixture';
import { StudentSessionService } from '../src/modules/student/core/student-session.service';
import type { InstitutionalStudentPrincipal } from '../src/modules/student/student.types';
let closeOnFailure: undefined | (() => Promise<void>);
function localPort(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!/^\d{4,5}$/.test(value) || Number(value) < 1024 || Number(value) > 65535)
    throw new Error('M4_INVALID_LOOPBACK_PORT');
  return Number(value);
}
async function main() {
  if (
    process.argv.length !== 2 ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_MIGRATION_URL ||
    Object.keys(process.env).some((k) => k.startsWith('PG') && process.env[k])
  )
    throw new Error('M4_CONFIGURED_TARGET_REFUSED');
  if (!process.env.PETROS_M4_EVIDENCE_DIR)
    throw new Error('M4_TIMESTAMPED_EVIDENCE_DIRECTORY_REQUIRED');
  const apiPort = localPort(process.env.PETROS_STUDIO_API_PORT, 4943);
  const webPort = localPort(process.env.PETROS_STUDIO_WEB_PORT, 4944);
  if (apiPort === webPort) throw new Error('M4_DISTINCT_PORTS_REQUIRED');
  const apiBase = `http://127.0.0.1:${apiPort}`;
  const output = resolve(process.env.PETROS_M4_EVIDENCE_DIR);
  if (existsSync(resolve(output, 'demo-info.json')))
    throw new Error('M4_NEW_EVIDENCE_DIRECTORY_REQUIRED');
  mkdirSync(output, { recursive: true });
  const f = await startM4Fixture();
  closeOnFailure = () => f.close();
  f.env.STUDENT_SESSION_COOKIE_NAME = `m4_student_${apiPort}`;
  f.env.API_CORS_ORIGINS = [`http://127.0.0.1:${webPort}`];
  f.env.SESSION_COOKIE_SECRET = randomUUID() + randomUUID();
  f.env.SESSION_TTL_SECONDS = 86400;
  const users: Record<string, InstitutionalStudentPrincipal> = { entry: f.student };
  for (const role of [
    'delivery',
    'question',
    'pending',
    'feedback',
    'paused',
    'blocked',
    'mobile',
    'english',
    'english-delivery',
    'unavailable',
    'empty',
  ]) {
    const id = randomUUID(),
      userId = randomUUID();
    let studentClassId = f.f.classId;
    if (role === 'empty') {
      const [originalClass] = await f.f.admin
        .select()
        .from(schema.classes)
        .where(eq(schema.classes.id, f.f.classId));
      studentClassId = randomUUID();
      await f.f.admin
        .insert(schema.classes)
        .values({ ...originalClass!, id: studentClassId, name: 'Studio — no released lesson' });
    }
    await f.f.admin.insert(schema.institutionUsers).values({
      id: userId,
      institutionId: f.student.institutionId,
      fullName: `Sample student · ${role}`,
      email: `m4-${role}@example.test`,
      status: 'active',
    });
    await f.f.admin
      .insert(schema.institutionUserRoles)
      .values({ institutionUserId: userId, roleKey: 'student' });
    await f.f.admin.insert(schema.students).values({
      id,
      institutionId: f.student.institutionId,
      institutionUserId: userId,
      classId: studentClassId,
      admissionNo: randomUUID(),
      firstName: 'Sample',
      lastName: role,
    });
    if (role !== 'empty')
      await f.f.admin.insert(schema.courseEnrollments).values(
        Object.values(f.f.courses).map((courseId) => ({
          institutionId: f.student.institutionId,
          studentId: id,
          courseId,
        })),
      );
    users[role] = await f.principal(userId);
  }
  const cloud = await f.lesson('cloud', true),
    english = await f.lesson('argument'),
    withdrawn = await f.lesson('cloud');
  const sessions: Record<string, string> = {};
  for (const role of [
    'delivery',
    'question',
    'pending',
    'feedback',
    'paused',
    'blocked',
    'mobile',
    'english',
    'english-delivery',
    'unavailable',
  ]) {
    const owner = users[role]!,
      publication = role.startsWith('english') ? english : role === 'blocked' ? withdrawn : cloud;
    let s = await f.start(publication.publication.id, owner);
    if (!['delivery', 'english-delivery'].includes(role)) s = await f.command(s, 'next', {}, owner);
    if (role === 'paused') {
      s = await f.command(
        s,
        'canvas_checkpoint',
        {
          draft: JSON.stringify({ responsibility: 'consumer', reason: '' }),
          canvasRevision: s.canvas?.revision ?? 0,
        },
        owner,
      );
      s = await f.command(s, 'pause', {}, owner);
    }
    if (['feedback', 'blocked'].includes(role)) {
      await f.sessions.commit(owner, s.id, s.task!.taskId, {
        commandId: randomUUID(),
        expectedRevision: s.revision,
        epoch: s.epoch,
        canvasRevision: s.canvas?.revision ?? 0,
        taskInstanceHash: s.task!.instanceHash,
        response: {
          kind: 'structured',
          values: {
            responsibility: 'consumer',
            reason: role === 'feedback' ? 'data_access' : 'all_transferred',
          },
        },
      });
      await f.worker.process({ sessionId: s.id, requestedBy: owner.institutionUserId });
    }
    sessions[role] = s.id;
  }
  await f.f.admin
    .update(schema.classMaterials)
    .set({ sourceRevokedAt: new Date() })
    .where(eq(schema.classMaterials.id, withdrawn.file.id));
  await f.sessions.get(users.blocked!, sessions.blocked!);
  const v1 = m4V1Owners(f);
  sessions.v1 = await v1.seed();
  users.v1 = f.student;
  // Delay only the synthetic pending actor to make the durable pending state inspectable.
  const evaluate = f.assessment.evaluate.bind(f.assessment);
  f.assessment.evaluate = async (input) => {
    if (input.studentId === users.unavailable!.studentId)
      throw new Error('M4_EVALUATOR_UNAVAILABLE');
    if (input.studentId === users.pending!.studentId) await new Promise((r) => setTimeout(r, 8000));
    return evaluate(input);
  };
  const queue = await m4IsolatedQueue(f),
    issuer = new StudentSessionService(f.f.f.db, f.env);
  closeOnFailure = async () => {
    await queue.close();
    await f.close();
  };
  const base = `http://127.0.0.1:${webPort}`;
  const setup = (expressApp: Express) => {
    expressApp.get('/demo/:role', async (req: Request, res: Response) => {
      const role = String(req.params.role),
        owner = users[role];
      if (!owner) return res.status(404).end();
      try {
        if (['question', 'english', 'delivery', 'english-delivery', 'mobile'].includes(role)) {
          const old = await f.sessions.get(owner, sessions[role]!);
          if (
            old.submission ||
            old.status === 'closed' ||
            (['delivery', 'english-delivery'].includes(role) && old.task)
          ) {
            if (old.status !== 'closed')
              await f.sessions.command(owner, old.id, {
                commandId: randomUUID(),
                expectedRevision: old.revision,
                epoch: old.epoch,
                type: 'close',
              });
            let fresh = await f.start(
              (role.startsWith('english') ? english : cloud).publication.id,
              owner,
            );
            if (!['delivery', 'english-delivery'].includes(role))
              fresh = await f.command(fresh, 'next', {}, owner);
            sessions[role] = fresh.id;
            info.sessions[role] = `${base}/petros/v2/session?session=${fresh.id}`;
          }
        }
        if (['pending', 'unavailable'].includes(role)) {
          const old = await f.sessions.get(owner, sessions[role]!);
          if (old.status !== 'closed')
            await f.sessions.command(owner, old.id, {
              commandId: randomUUID(),
              expectedRevision: old.revision,
              epoch: old.epoch,
              type: 'close',
            });
          let s = await f.start(cloud.publication.id, owner);
          s = await f.command(s, 'next', {}, owner);
          sessions[role] = s.id;
          info.sessions[role] = `${base}/petros/v2/session?session=${s.id}`;
          await f.sessions.commit(owner, s.id, s.task!.taskId, {
            commandId: randomUUID(),
            expectedRevision: s.revision,
            epoch: s.epoch,
            canvasRevision: s.canvas?.revision ?? 0,
            taskInstanceHash: s.task!.instanceHash,
            response: {
              kind: 'structured',
              values: { responsibility: 'consumer', reason: 'data_access' },
            },
          });
          void queue.worker.dispatch(s.id, owner.institutionUserId).catch(() => undefined);
        }
        const issued = await runInStudentTenant(f.f.f.db, owner, () =>
          issuer.issue({
            kind: 'institutional',
            userId: owner.institutionUserId,
            institutionId: owner.institutionId,
            userAgent: 'M4 isolated synthetic handoff',
          }),
        );
        res.cookie(issuer.cookieName, issued.token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: false,
          path: '/',
          maxAge: 86400000,
        });
        return res.redirect(
          ['entry', 'empty'].includes(role)
            ? `${base}/petros/v2`
            : `${base}/petros/${role === 'v1' ? 'session' : 'v2/session'}?session=${sessions[role]}`,
        );
      } catch (error) {
        return res
          .status(500)
          .json({ message: error instanceof Error ? error.message : 'Demo handoff unavailable' });
      }
    });
    expressApp.get('/demo-info', (_req: unknown, res: Response) => res.json(info));
  };
  const info = {
    label:
      'Isolated Living Learning Studio M4; synthetic institutional records. Pending actor has an eight-second inspection delay; unavailable actor simulates a real evaluator failure. No model inference, grades, deployment or academic qualification.',
    studentUrl: base + '/petros/v2',
    login: `${apiBase}/demo/entry`,
    testRole: 'Synthetic institutional student',
    roles: Object.fromEntries(Object.keys(users).map((role) => [role, `${apiBase}/demo/${role}`])),
    sessions: Object.fromEntries(
      Object.entries(sessions).map(([role, id]) => [
        role,
        `${base}/petros/${role === 'v1' ? 'session' : 'v2/session'}?session=${id}`,
      ]),
    ),
    sourceHashes: { cloud: cloud.p.source.originalHash, english: english.p.source.originalHash },
    privateProviderCalls: 0,
  };
  writeFileSync(resolve(output, 'demo-info.json'), JSON.stringify(info, null, 2) + '\n', {
    flag: 'wx',
  });
  const app = await m4HttpFixture(f, queue.worker, v1.loop, setup);
  await app.listen(apiPort, '127.0.0.1');
  process.stdout.write(JSON.stringify({ ready: true, ...info }) + '\n');
  async function close() {
    await app.close();
    await queue.close();
    await f.close();
    process.exit(0);
  }
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());
}
main().catch(async (error) => {
  await closeOnFailure?.().catch(() => undefined);
  console.error(error);
  process.exitCode = 1;
});
