import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { and, closeDatabase, createDatabase, eq, isNull, schema as s } from '@edrion/database';
import { hashPassword, verifyPassword } from '../../apps/api/src/modules/authentication/password.util';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: join(repoRoot, '.env'), override: true, quiet: true });
const BACKFILL_VERSION = 'student-id-password.v1';

async function main() {
  const apply = process.argv.includes('--apply');
  const db = createDatabase({ url: process.env.DATABASE_URL });
  const counts = { created: 0, reset: 0, alreadyReady: 0, previouslyApplied: 0, skipped: 0 };
  try {
    const students = await db.select().from(s.students);
    for (const candidate of students) {
      await db.transaction(async (tx) => {
        const [student] = await tx.select().from(s.students).where(eq(s.students.id, candidate.id)).for('update');
        if (!student?.admissionNo || (!student.institutionUserId && student.status !== 'enrolled')) {
          counts.skipped++; return;
        }
        let user = student.institutionUserId ? (await tx.select().from(s.institutionUsers).where(and(
          eq(s.institutionUsers.id, student.institutionUserId), eq(s.institutionUsers.institutionId, student.institutionId),
        )).for('update'))[0] : undefined;
        if (student.institutionUserId && !user) { counts.skipped++; return; }
        if (user) {
          const roles = await tx.select().from(s.institutionUserRoles).where(eq(s.institutionUserRoles.institutionUserId, user.id));
          const linked = await tx.select({ id: s.students.id }).from(s.students).where(eq(s.students.institutionUserId, user.id));
          // Preserve disabled accounts and accounts shared with staff/admin identities.
          if (user.disabledAt || !['active', 'invited'].includes(user.status) ||
            roles.some((role) => role.roleKey !== 'student') || linked.length !== 1) {
            counts.skipped++; return;
          }
          if (user.metadata?.studentIdPasswordBackfill === BACKFILL_VERSION) { counts.previouslyApplied++; return; }
          if (user.passwordResetRequiredAt && await verifyPassword(student.admissionNo, user.passwordHash)) {
            counts.alreadyReady++; return;
          }
        }
        if (!apply) { counts[user ? 'reset' : 'created']++; return; }
        const now = new Date();
        const passwordHash = await hashPassword(student.admissionNo);
        const credentials = { passwordHash, status: 'active' as const, activatedAt: user?.activatedAt ?? now,
          passwordResetRequiredAt: now, activationTokenHash: null, activationTokenExpiresAt: null,
          passwordResetTokenHash: null, passwordResetExpiresAt: null, failedLoginAttempts: 0, lockedUntil: null,
          sessionsRevokedAt: now, metadata: { ...(user?.metadata ?? {}), studentIdPasswordBackfill: BACKFILL_VERSION },
        };
        const created = !user;
        if (user) {
          await tx.update(s.institutionUsers).set(credentials).where(eq(s.institutionUsers.id, user.id));
        } else {
          let email = student.email?.toLowerCase();
          if (email) {
            const [existing] = await tx.select({ id: s.institutionUsers.id }).from(s.institutionUsers)
              .where(and(eq(s.institutionUsers.institutionId, student.institutionId), eq(s.institutionUsers.email, email))).limit(1);
            if (existing) email = undefined;
          }
          [user] = await tx.insert(s.institutionUsers).values({ ...credentials,
            institutionId: student.institutionId, email: email ?? `stu-${student.id}@${student.institutionId}.edrion.local`,
            fullName: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' '),
          }).returning();
          if (!user) throw new Error('Student account could not be created');
          await tx.update(s.students).set({ institutionUserId: user.id }).where(eq(s.students.id, student.id));
        }
        await tx.insert(s.institutionUserRoles).values({ institutionUserId: user.id, roleKey: 'student' }).onConflictDoNothing();
        await tx.update(s.portalSessions).set({ revokedAt: now, revokedReason: 'student_temporary_password_backfill' })
          .where(and(eq(s.portalSessions.institutionUserId, user.id), isNull(s.portalSessions.revokedAt)));
        await tx.insert(s.auditEvents).values({ actorType: 'system', actorName: 'Student login backfill',
          institutionId: student.institutionId, entityType: 'institution_user', entityId: user.id,
          action: created ? 'student.portal.account_created' : 'student.portal.temporary_password_reset',
          module: 'student-auth', riskLevel: 'medium',
          reason: 'Requested existing students use student ID as temporary password and change it on first login.',
          newState: { studentId: student.id, passwordChangeRequired: true, backfillVersion: BACKFILL_VERSION },
        });
        counts[created ? 'created' : 'reset']++;
      });
    }
    console.log(JSON.stringify({ applied: apply, ...counts }));
  } finally { await closeDatabase(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'Backfill failed'); process.exitCode = 1; });
