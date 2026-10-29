import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '@edrion/database';
import { studentChangePasswordSchema } from '@edrion/schemas';
import { hashPassword, verifyPassword } from '../../authentication/password.util';
import { StudentAuthService } from './student-auth.service';
import { StudentAuthController } from './student-auth.controller';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentSessionService } from '../core/student-session.service';
import { StudentMeController } from '../me/student-me.controller';
import type { InstitutionalStudentPrincipal } from '../student.types';

const principal = { kind: 'institutional', institutionId: 'institution', institutionUserId: 'user',
  studentId: 'student', passwordChangeRequired: true } as InstitutionalStudentPrincipal;
const req = { ip: '127.0.0.1', userAgent: 'test' } as never;

async function fixture(required = true, duplicateIds = false) {
  const user = { id: 'user', institutionId: 'institution', email: 'alex@example.com',
    fullName: 'Alex Student', status: 'active', disabledAt: null, failedLoginAttempts: 0,
    lockedUntil: null, passwordHash: await hashPassword('ADM-1024'),
    passwordResetRequiredAt: required ? new Date() : null };
  const writes: Array<{ table: unknown; patch: Record<string, unknown> }> = [];
  const db = {
    select: () => ({ from: (table: unknown) => {
      const chain = { innerJoin: () => chain, where: () => ({ limit: async (limit: number) => {
        if (table === schema.institutions) return [{ id: 'institution' }];
        if (table === schema.students) {
          const student = { id: 'student', institutionUserId: 'user', admissionNo: 'ADM-1024' };
          return duplicateIds && limit === 2 ? [student, { ...student, institutionUserId: 'other-user' }] : [student];
        }
        if (table === schema.institutionUsers) return [user];
        if (table === schema.institutionUserRoles) return [{ roleKey: 'student' }];
        return [];
      } }) };
      return chain;
    } }),
    update: (table: unknown) => ({ set: (patch: Record<string, unknown>) => ({ where: () => {
      writes.push({ table, patch });
      return Object.assign(Promise.resolve(), { returning: async () => [{ id: 'user' }] });
    } }) }),
    transaction: vi.fn(async (work) => work(db)),
  };
  const sessions = { issue: vi.fn(async () => ({ token: 'session-token', sessionId: 'session' })) };
  const auth = new StudentAuthService(db as never, { logAudit: vi.fn() } as never,
    {} as never, sessions as never, {} as never, {} as never);
  return { auth, user, writes, sessions, db };
}

describe('mandatory student password setup', () => {
  it('accepts student ID + temporary password and issues a restricted session', async () => {
    const { auth, sessions } = await fixture();
    const result = await auth.login({ identifier: 'ADM-1024', password: 'ADM-1024' }, req);
    expect(result.passwordChangeRequired).toBe(true);
    expect(sessions.issue).toHaveBeenCalledWith(expect.objectContaining({ passwordSetupOnly: true }));
  });
  it('continues normal sign-in for students who have already changed their password', async () => {
    const { auth, sessions } = await fixture(false);
    expect((await auth.login({ identifier: 'ADM-1024', institutionCode: 'SCHOOL', password: 'ADM-1024' }, req))
      .passwordChangeRequired).toBe(false);
    expect(sessions.issue).toHaveBeenCalledWith(expect.objectContaining({ passwordSetupOnly: false }));
  });
  it('rejects student ID sign-in with a wrong password', async () => {
    const { auth, sessions } = await fixture();
    await expect(auth.login({ identifier: 'ADM-1024', institutionCode: 'SCHOOL', password: 'wrong' }, req)).rejects.toThrow();
    expect(sessions.issue).not.toHaveBeenCalled();
  });
  it('asks for an institution code only when the ID matches multiple active student accounts', async () => {
    const { auth, sessions } = await fixture(true, true);
    await expect(auth.login({ identifier: 'ADM-1024', password: 'ADM-1024' }, req))
      .rejects.toMatchObject({ response: { code: 'INSTITUTION_CODE_REQUIRED' } });
    expect(sessions.issue).not.toHaveBeenCalled();
    expect(await auth.login({ identifier: 'ADM-1024', institutionCode: 'SCHOOL', password: 'ADM-1024' }, req))
      .toMatchObject({ passwordChangeRequired: true });
  });
  it('allows only pending setup and rejects reusing the student ID', async () => {
    const { auth, db } = await fixture();
    const completed = await fixture(false);
    await expect(completed.auth.changePassword(principal, { newPassword: 'NewSecret123', confirmPassword: 'NewSecret123' }, req))
      .rejects.toMatchObject({ response: { code: 'PASSWORD_SETUP_UNAVAILABLE' } });
    expect(completed.db.transaction).not.toHaveBeenCalled();
    await expect(auth.changePassword(principal, { newPassword: 'ADM-1024', confirmPassword: 'ADM-1024' }, req))
      .rejects.toMatchObject({ response: { code: 'PASSWORD_UNCHANGED' } });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(studentChangePasswordSchema.safeParse({ newPassword: 'short', confirmPassword: 'short' }).success).toBe(false);
    expect(studentChangePasswordSchema.safeParse({ newPassword: 'NewSecret123', confirmPassword: 'Different123' }).success).toBe(false);
  });
  it('replaces the hash, clears mandatory setup, revokes old sessions, and issues a full session', async () => {
    const { auth, writes, sessions } = await fixture();
    await auth.changePassword(principal, { newPassword: 'NewSecret123', confirmPassword: 'NewSecret123' }, req);
    const account = writes.find((write) => write.table === schema.institutionUsers)!.patch;
    expect(account.passwordResetRequiredAt).toBeNull();
    expect(await verifyPassword('NewSecret123', account.passwordHash as string)).toBe(true);
    expect(await verifyPassword('ADM-1024', account.passwordHash as string)).toBe(false);
    expect(writes.find((write) => write.table === schema.portalSessions)?.patch)
      .toMatchObject({ revokedAt: expect.any(Date), revokedReason: 'password_change' });
    expect(sessions.issue).toHaveBeenCalledWith(expect.not.objectContaining({ passwordSetupOnly: true }));
  });
  it('never promotes an old setup session when another session completes the password change', async () => {
    const { auth } = await fixture(false);
    const result = await auth.resolvePrincipal({ kind: 'institutional', userId: 'user', sessionId: 'session',
      lastAuthAt: new Date(), passwordSetupOnly: true });
    expect(result).toMatchObject({ passwordChangeRequired: true });
  });
  it('does not allow an email reset to reuse the temporary password and clear setup', async () => {
    const { auth, writes } = await fixture();
    await expect(auth.resetPassword({ token: 'reset-token', password: 'ADM-1024' }, req))
      .rejects.toMatchObject({ response: { code: 'PASSWORD_UNCHANGED' } });
    expect(writes).toEqual([]);
  });
  it('preserves the setup restriction in a signed session cookie', async () => {
    const session = { id: 'session', institutionUserId: 'user', institutionId: 'institution',
      lastAuthAt: new Date(), expiresAt: new Date(Date.now() + 60_000), revokedAt: null as Date | null };
    const db = {
      insert: () => ({ values: () => ({ returning: async () => [session] }) }),
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [session] }) }) }),
    };
    const sessions = new StudentSessionService(db as never, {
      SESSION_COOKIE_SECRET: 'student-password-setup-test-secret', SESSION_TTL_SECONDS: 60,
    } as never);
    const issue = await sessions.issue({ kind: 'institutional', userId: 'user', institutionId: 'institution', passwordSetupOnly: true });
    expect(await sessions.verify(issue.token)).toMatchObject({ passwordSetupOnly: true });
    session.revokedAt = new Date();
    await expect(sessions.verify(issue.token)).rejects.toMatchObject({ response: { code: 'SESSION_REVOKED' } });
  });
});

describe('server access gate during password setup', () => {
  function guard(required: boolean) {
    return new StudentAuthGuard({ resolvePrincipal: async () => ({ ...principal, passwordChangeRequired: required }) } as never,
      { cookieName: 'student', verify: async () => ({ sessionId: 'session' }) } as never, {} as never);
  }
  function context(handler: Function) {
    return { switchToHttp: () => ({ getRequest: () => ({ headers: { cookie: 'student=token' } }) }),
      getHandler: () => handler } as never;
  }
  it('blocks normal portal endpoints even when called directly', async () => {
    await expect(guard(true).canActivate(context(() => null)))
      .rejects.toMatchObject({ response: { code: 'PASSWORD_CHANGE_REQUIRED' } });
  });
  it('allows password change, session inspection and sign-out', async () => {
    for (const handler of [StudentAuthController.prototype.changePassword, StudentAuthController.prototype.logout,
      StudentMeController.prototype.getMe]) {
      expect(await guard(true).canActivate(context(handler))).toBe(true);
    }
  });
  it('allows normal portal access once setup is complete', async () => {
    expect(await guard(false).canActivate(context(() => null))).toBe(true);
  });
});
