import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { schema, type Database } from '@edrion/database';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { EmergencyBroadcastInput } from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { basePortalAudit, type PortalActionContext } from '../portal/portal-action-context';
import { ParentNotifyService } from './parent-notify.service';

const MODULE = 'parent-emergency';
const CONFIRM_PHRASE = 'SEND EMERGENCY';

/**
 * Emergency broadcasts to guardians. Gated (in the controller) by the sensitive
 * `parent_comm.emergency.send` key — which the permissions guard couples to a fresh recent-auth
 * window. Here we additionally require a typed confirmation phrase. The broadcast row is append-only;
 * delivery is immediate on ALL channels regardless of quiet hours (critical fanout).
 */
@Injectable()
export class ParentEmergencyService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly notify: ParentNotifyService,
  ) {}

  async send(ctx: PortalActionContext, input: EmergencyBroadcastInput) {
    if (input.confirmPhrase !== CONFIRM_PHRASE) {
      throw new BadRequestException({ code: 'CONFIRM_PHRASE_MISMATCH', message: `Type "${CONFIRM_PHRASE}" to confirm.` });
    }
    const institutionId = ctx.principal.institutionId;
    const [row] = await this.db
      .insert(schema.parentEmergencyBroadcasts)
      .values({
        institutionId,
        title: input.title,
        body: input.body,
        severity: input.severity,
        audienceScope: 'institution',
        channels: { email: true, push: true, sms: true, whatsapp: true },
        sentBy: ctx.principal.institutionUserId,
      })
      .returning();

    const guardians = await this.notify.guardiansOfInstitution(institutionId);
    const recipients = await this.notify.emit(institutionId, guardians, {
      type: 'emergency_broadcast',
      title: `🚨 ${input.title}`,
      body: input.body,
      deepLink: '/family/inbox',
      priority: 'immediate',
      sourceEntity: `parent_emergency_broadcasts:${row!.id}`,
    });

    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action: 'parent_staff.emergency.send',
      module: MODULE,
      entityType: 'parent_emergency_broadcast',
      entityId: row!.id,
      newState: { severity: input.severity, recipients },
    } as AuditEventInput);
    return { broadcastId: row!.id, recipients };
  }
}
