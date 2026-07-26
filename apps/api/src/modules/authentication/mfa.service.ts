import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { authenticator } from 'otplib';
import { schema, type Database } from '@edrion/database';
import type { InstitutionPrincipal } from '@edrion/auth';
import { DATABASE } from '../../common/tokens';

function encKey(): Buffer {
  return createHash('sha256')
    .update(process.env.MFA_SECRET_ENCRYPTION_KEY ?? 'dev-mfa-key-change-me')
    .digest();
}

function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function sealSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

function openSecret(blob: string): string {
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

@Injectable()
export class MfaService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async enrollBegin(principal: InstitutionPrincipal) {
    const secret = authenticator.generateSecret();
    const [row] = await this.db
      .insert(schema.mfaFactors)
      .values({
        institutionUserId: principal.institutionUserId,
        secretEncrypted: sealSecret(secret),
        label: 'Authenticator',
      })
      .returning();
    const otpauth = authenticator.keyuri(principal.email, 'Edrion', secret);
    return { factorId: row!.id, otpauthUrl: otpauth, secret };
  }

  async enrollVerify(principal: InstitutionPrincipal, factorId: string, code: string) {
    const factor = await this.requireFactor(principal, factorId);
    const secret = openSecret(factor.secretEncrypted);
    if (!authenticator.check(code, secret)) {
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'Invalid authenticator code.' });
    }
    await this.db
      .update(schema.mfaFactors)
      .set({ verifiedAt: new Date() })
      .where(eq(schema.mfaFactors.id, factorId));
    await this.db
      .update(schema.institutionUsers)
      .set({ mfaEnrolled: true })
      .where(eq(schema.institutionUsers.id, principal.institutionUserId));
    return { ok: true };
  }

  async challenge(principal: InstitutionPrincipal, code: string) {
    const [factor] = await this.db
      .select()
      .from(schema.mfaFactors)
      .where(
        and(
          eq(schema.mfaFactors.institutionUserId, principal.institutionUserId),
          isNull(schema.mfaFactors.revokedAt),
        ),
      )
      .limit(1);
    if (!factor?.verifiedAt) {
      throw new BadRequestException({ code: 'MFA_NOT_ENROLLED', message: 'MFA not configured.' });
    }
    const secret = openSecret(factor.secretEncrypted);
    if (!authenticator.check(code, secret)) {
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'Invalid authenticator code.' });
    }
    return { aal: 'aal2' as const };
  }

  async generateRecoveryCodes(principal: InstitutionPrincipal) {
    const codes: string[] = [];
    const rows: Array<{ institutionUserId: string; codeHash: string }> = [];
    for (let i = 0; i < 10; i++) {
      const code = randomBytes(5).toString('hex').slice(0, 10);
      codes.push(code);
      rows.push({
        institutionUserId: principal.institutionUserId,
        codeHash: hashRecoveryCode(code),
      });
    }
    await this.db.delete(schema.mfaRecoveryCodes).where(
      and(
        eq(schema.mfaRecoveryCodes.institutionUserId, principal.institutionUserId),
        isNull(schema.mfaRecoveryCodes.usedAt),
      ),
    );
    await this.db.insert(schema.mfaRecoveryCodes).values(rows);
    return { codes };
  }

  async consumeRecoveryCode(principal: InstitutionPrincipal, code: string) {
    const hash = hashRecoveryCode(code.trim());
    const [row] = await this.db
      .select()
      .from(schema.mfaRecoveryCodes)
      .where(
        and(
          eq(schema.mfaRecoveryCodes.institutionUserId, principal.institutionUserId),
          eq(schema.mfaRecoveryCodes.codeHash, hash),
          isNull(schema.mfaRecoveryCodes.usedAt),
        ),
      )
      .limit(1);
    if (!row) {
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'Invalid recovery code.' });
    }
    await this.db
      .update(schema.mfaRecoveryCodes)
      .set({ usedAt: new Date() })
      .where(eq(schema.mfaRecoveryCodes.id, row.id));
    return { aal: 'aal2' as const };
  }

  async revokeFactor(principal: InstitutionPrincipal, factorId: string) {
    const factor = await this.requireFactor(principal, factorId);
    await this.db
      .update(schema.mfaFactors)
      .set({ revokedAt: new Date() })
      .where(eq(schema.mfaFactors.id, factor.id));
    const [active] = await this.db
      .select({ id: schema.mfaFactors.id })
      .from(schema.mfaFactors)
      .where(
        and(
          eq(schema.mfaFactors.institutionUserId, principal.institutionUserId),
          isNull(schema.mfaFactors.revokedAt),
        ),
      )
      .limit(1);
    if (!active) {
      await this.db
        .update(schema.institutionUsers)
        .set({ mfaEnrolled: false })
        .where(eq(schema.institutionUsers.id, principal.institutionUserId));
    }
    return { ok: true };
  }

  private async requireFactor(principal: InstitutionPrincipal, factorId: string) {
    const [factor] = await this.db
      .select()
      .from(schema.mfaFactors)
      .where(
        and(eq(schema.mfaFactors.id, factorId), eq(schema.mfaFactors.institutionUserId, principal.institutionUserId)),
      )
      .limit(1);
    if (!factor) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Factor not found.' });
    return factor;
  }
}
