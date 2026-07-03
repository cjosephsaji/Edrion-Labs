import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { CreateHostelOutingRequestInput } from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { assertWard } from './guardian-scope.guard';
import type { GuardianContext } from './guardian-context';
import { basePortalAudit, type PortalActionContext } from '../portal/portal-action-context';

const MODULE = 'parent-logistics';

/** Transport, library and hostel (boarders) for a ward. */
@Injectable()
export class ParentLogisticsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async transport(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId);
    const [asg] = await this.db
      .select()
      .from(schema.transportAssignments)
      .where(and(eq(schema.transportAssignments.studentId, studentId), eq(schema.transportAssignments.status, 'active')))
      .limit(1);
    if (!asg) return { assigned: false };
    const [route] = await this.db.select().from(schema.transportRoutes).where(eq(schema.transportRoutes.id, asg.routeId)).limit(1);
    const incidents = await this.db
      .select({ id: schema.transportIncidents.id, type: schema.transportIncidents.type, description: schema.transportIncidents.description, affectsDate: schema.transportIncidents.affectsDate, status: schema.transportIncidents.status })
      .from(schema.transportIncidents)
      .where(eq(schema.transportIncidents.routeId, asg.routeId))
      .orderBy(desc(schema.transportIncidents.createdAt))
      .limit(20);
    return {
      assigned: true,
      route: route ? { name: route.name, code: route.code } : null,
      stopName: asg.stopName,
      pickupTime: asg.pickupTime,
      dropTime: asg.dropTime,
      incidents,
    };
  }

  async library(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId);
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.db
      .select({ id: schema.libraryLoans.id, status: schema.libraryLoans.status, issueDate: schema.libraryLoans.issueDate, dueDate: schema.libraryLoans.dueDate, returnDate: schema.libraryLoans.returnDate, fineAmount: schema.libraryLoans.fineAmount, title: schema.libraryBooks.title, author: schema.libraryBooks.author })
      .from(schema.libraryLoans)
      .leftJoin(schema.libraryBooks, eq(schema.libraryBooks.id, schema.libraryLoans.bookId))
      .where(eq(schema.libraryLoans.studentId, studentId))
      .orderBy(desc(schema.libraryLoans.issueDate));
    return {
      loans: rows.map((r) => ({
        id: r.id,
        title: r.title ?? 'Book',
        author: r.author,
        status: r.status,
        issueDate: r.issueDate,
        dueDate: r.dueDate,
        returnDate: r.returnDate,
        overdue: r.status === 'issued' && !!r.dueDate && r.dueDate < today,
        fineMinor: r.fineAmount,
      })),
    };
  }

  async hostel(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId);
    const [alloc] = await this.db
      .select()
      .from(schema.hostelAllocations)
      .where(and(eq(schema.hostelAllocations.studentId, studentId), eq(schema.hostelAllocations.status, 'active')))
      .limit(1);
    if (!alloc) return { boarder: false };
    const [room] = await this.db.select().from(schema.hostelRooms).where(eq(schema.hostelRooms.id, alloc.roomId)).limit(1);
    const block = room?.blockId
      ? (await this.db.select().from(schema.hostelBlocks).where(eq(schema.hostelBlocks.id, room.blockId)).limit(1))[0]
      : undefined;
    return {
      boarder: true,
      room: room ? { roomNo: room.roomNo, floor: room.floor } : null,
      bedNo: alloc.bedNo,
      block: block ? { name: block.name, warden: block.warden } : null,
    };
  }

  async createOuting(ctx: PortalActionContext, guardian: GuardianContext, studentId: string, input: CreateHostelOutingRequestInput) {
    const scope = assertWard(guardian, studentId);
    const [row] = await this.db
      .insert(schema.hostelOutingRequests)
      .values({
        institutionId: guardian.institutionId,
        campusId: scope.campusId,
        studentId,
        guardianUserId: guardian.guardianUserId,
        type: input.type,
        fromAt: new Date(input.fromAt),
        toAt: new Date(input.toAt),
        reason: input.reason ?? null,
        status: 'requested',
      })
      .returning();
    await this.write(ctx, 'parent.hostel_outing.create', row!.id, { newState: { type: input.type } });
    return row;
  }

  async listOutings(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId);
    const rows = await this.db
      .select()
      .from(schema.hostelOutingRequests)
      .where(eq(schema.hostelOutingRequests.studentId, studentId))
      .orderBy(desc(schema.hostelOutingRequests.createdAt));
    return { items: rows };
  }

  private async write(ctx: PortalActionContext, action: string, entityId: string, extra: Partial<AuditEventInput> = {}) {
    await this.audit.logAudit({ ...basePortalAudit(ctx), action, module: MODULE, entityType: 'parent_logistics', entityId, ...extra } as AuditEventInput);
  }
}
