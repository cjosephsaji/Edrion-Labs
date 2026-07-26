import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { debateConsentSchema } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { ownerColumns } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';
import { DebateRoundService, DEBATE_CONSENT_POLICY_VERSION } from './debate-round.service';

@Injectable()
export class DebateConsentService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly rounds: DebateRoundService,
  ) {}

  async recordConsent(principal: StudentPrincipal, debateId: string, body: unknown) {
    const debate = await this.rounds.requireDebate(principal, debateId);
    if (debate.status !== 'consent_required' && debate.status !== 'prep') {
      throw new BadRequestException({ code: 'INVALID_STATE', message: 'Consent not expected now.' });
    }
    const parsed = debateConsentSchema.parse(body);
    if (parsed.policyVersion !== DEBATE_CONSENT_POLICY_VERSION) {
      throw new BadRequestException({ code: 'POLICY_VERSION', message: 'Consent policy version mismatch.' });
    }
    const scopes = parsed.scopes;
    if (!scopes.record_audio || !scopes.store_transcript || !scopes.ai_analysis) {
      throw new BadRequestException({
        code: 'CONSENT_REQUIRED',
        message: 'Required consent scopes must be granted.',
      });
    }
    const owner = ownerColumns(principal);
    const participants = await this.db
      .select()
      .from(schema.debateParticipants)
      .where(
        and(
          eq(schema.debateParticipants.debateId, debateId),
          eq(schema.debateParticipants.participantKind, 'human'),
        ),
      );
    const participant = participants.find(
      (p) =>
        (owner.studentId && p.studentId === owner.studentId) ||
        (owner.independentUserId && p.independentUserId === owner.independentUserId),
    );
    if (!participant) {
      throw new ForbiddenException({ code: 'NOT_PARTICIPANT', message: 'Not a participant.' });
    }

    const [consent] = await this.db
      .insert(schema.debateConsents)
      .values({
        debateId,
        participantId: participant.id,
        institutionId: owner.institutionId,
        studentId: owner.studentId,
        independentUserId: owner.independentUserId,
        policyVersion: parsed.policyVersion,
        scopes,
        evidence: parsed.evidence ?? {},
      })
      .returning();

    await this.db
      .update(schema.debateParticipants)
      .set({ consentId: consent!.id })
      .where(eq(schema.debateParticipants.id, participant.id));

    const nextStatus = debate.status === 'consent_required' ? 'prep' : debate.status;
    await this.db
      .update(schema.debates)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(schema.debates.id, debateId));

    return { consentId: consent!.id, status: nextStatus };
  }

  async assertCaptureConsent(_debateId: string, participantId: string): Promise<void> {
    const [participant] = await this.db
      .select()
      .from(schema.debateParticipants)
      .where(eq(schema.debateParticipants.id, participantId))
      .limit(1);
    if (!participant?.consentId) {
      throw new ForbiddenException({ code: 'CONSENT_REQUIRED', message: 'Recording consent required.' });
    }
    const [consent] = await this.db
      .select()
      .from(schema.debateConsents)
      .where(eq(schema.debateConsents.id, participant.consentId))
      .limit(1);
    if (!consent || consent.revokedAt) {
      throw new ForbiddenException({ code: 'CONSENT_REVOKED', message: 'Consent revoked.' });
    }
    const scopes = consent.scopes as Record<string, boolean>;
    if (!scopes.record_audio || !scopes.store_transcript) {
      throw new ForbiddenException({ code: 'CONSENT_SCOPES', message: 'Missing recording consent.' });
    }
  }
}
