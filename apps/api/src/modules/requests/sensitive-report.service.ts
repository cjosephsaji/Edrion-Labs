import { createDecipheriv, createCipheriv, createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student/student.types';

function sealKey(): Buffer {
  const raw = process.env.SENSITIVE_REPORT_SEAL_KEY ?? 'dev-only-change-in-production-32bytes!!';
  return createHash('sha256').update(raw).digest();
}

@Injectable()
export class SensitiveReportService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  encryptReporterIdentity(principal: InstitutionalStudentPrincipal): Buffer {
    const payload = JSON.stringify({
      student_id: principal.studentId,
      institution_user_id: principal.institutionUserId,
      at: new Date().toISOString(),
    });
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', sealKey(), iv);
    const enc = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]);
  }

  decryptReporterIdentity(blob: Buffer): Record<string, unknown> {
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const enc = blob.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', sealKey(), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  }

  async sealAfterSubmit(requestId: string, principal: InstitutionalStudentPrincipal) {
    const sealed = this.encryptReporterIdentity(principal);
    const [seal] = await this.db
      .insert(schema.sensitiveReportSeals)
      .values({
        institutionId: principal.institutionId,
        requestId,
        sealedPayload: sealed,
        keyVersion: 1,
      })
      .returning();
    await this.db.insert(schema.studentSensitiveReportOwnership).values({
      institutionId: principal.institutionId,
      studentId: principal.studentId,
      requestId,
    });
    await this.audit(principal.institutionId, seal!.id, requestId, principal.institutionUserId, 'sealed', {});
  }

  async audit(
    institutionId: string,
    sealId: string | null,
    requestId: string | null,
    actorUserId: string,
    action: string,
    detail: Record<string, unknown>,
  ) {
    await this.db.insert(schema.sensitiveReportAuditLog).values({
      institutionId,
      sealId,
      requestId,
      actorUserId,
      action,
      detail,
    });
  }

  async countDistinctApprovers(sealId: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(distinct ${schema.sensitiveReportUnsealApprovals.approverUserId})` })
      .from(schema.sensitiveReportUnsealApprovals)
      .where(
        and(
          eq(schema.sensitiveReportUnsealApprovals.sealId, sealId),
          sql`${schema.sensitiveReportUnsealApprovals.createdAt} >= ${since}`,
          isNull(schema.sensitiveReportUnsealApprovals.consumedAt),
        ),
      );
    return Number(row?.n ?? 0);
  }
}
