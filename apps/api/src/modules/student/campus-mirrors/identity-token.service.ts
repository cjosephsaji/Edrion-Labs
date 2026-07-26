import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';

@Injectable()
export class IdentityTokenService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async issueToken(studentId: string, institutionId: string, version = 1): Promise<string> {
    const payload = `${studentId}.${institutionId}.${version}.${Date.now()}`;
    const sig = createHmac('sha256', process.env.IDENTITY_TOKEN_HMAC_SECRET ?? 'dev-identity-secret')
      .update(payload)
      .digest('base64url');
    return `${Buffer.from(payload).toString('base64url')}.${sig}`;
  }

  async verifyScan(input: {
    institutionId: string;
    token: string;
    nonce: string;
    deviceId?: string;
    contextKind: string;
  }) {
    const parts = input.token.split('.');
    if (parts.length !== 2) {
      await this.audit(input, 'deny', 'malformed_token');
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid token' });
    }
    const payload = Buffer.from(parts[0]!, 'base64url').toString('utf8');
    const expected = createHmac('sha256', process.env.IDENTITY_TOKEN_HMAC_SECRET ?? 'dev-identity-secret')
      .update(payload)
      .digest('base64url');
    const ok =
      parts[1]!.length === expected.length &&
      timingSafeEqual(Buffer.from(parts[1]!), Buffer.from(expected));
    if (!ok) {
      await this.audit(input, 'deny', 'bad_signature');
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid token' });
    }
    const [studentId] = payload.split('.');
    const [card] = await this.db
      .select()
      .from(schema.studentIdCards)
      .where(
        and(
          eq(schema.studentIdCards.studentId, studentId!),
          eq(schema.studentIdCards.institutionId, input.institutionId),
          eq(schema.studentIdCards.status, 'active'),
        ),
      )
      .limit(1);
    if (!card) {
      await this.audit(input, 'deny', 'no_active_card');
      throw new UnauthorizedException({ code: 'REVOKED', message: 'ID card not active' });
    }
    await this.audit(input, 'allow', null, studentId);
    return { studentId, cardId: card.id };
  }

  private async audit(
    input: { institutionId: string; nonce: string; deviceId?: string; contextKind: string },
    result: string,
    denyReason: string | null,
    studentId?: string,
  ) {
    void denyReason;
    await this.db.insert(schema.identityScanAudit).values({
      institutionId: input.institutionId,
      studentId: studentId ?? null,
      scanNonce: input.nonce,
      result,
      contextKind: input.contextKind,
      deviceId: input.deviceId ?? null,
    });
  }
}
