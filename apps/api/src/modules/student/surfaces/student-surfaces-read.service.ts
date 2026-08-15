import { Inject, Injectable } from '@nestjs/common';
import { and, eq, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';

@Injectable()
export class StudentSurfacesReadService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async fees(principal: InstitutionalStudentPrincipal) {
    const [institution] = await this.db
      .select({ currency: schema.institutions.currency })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, principal.institutionId))
      .limit(1);

    const rows = await this.db
      .select()
      .from(schema.feeInvoices)
      .where(and(eq(schema.feeInvoices.studentId, principal.studentId), eq(schema.feeInvoices.institutionId, principal.institutionId)));

    return {
      currency: institution?.currency ?? 'USD',
      invoices: rows.map((inv) => ({
        invoiceNo: inv.invoiceNo,
        label: inv.invoiceNo,
        amountMinor: inv.amount,
        paidMinor: inv.amountPaid,
        status: inv.status,
        dueDate: inv.dueDate,
      })),
    };
  }

  async transport(principal: InstitutionalStudentPrincipal) {
    const [row] = await this.db
      .select({
        assignmentId: schema.transportAssignments.id,
        routeId: schema.transportAssignments.routeId,
        routeName: schema.transportRoutes.name,
        stopName: schema.transportAssignments.stopName,
        vehicleRegistration: schema.transportVehicles.registrationNo,
        driverName: schema.transportVehicles.driverName,
        driverPhone: schema.transportVehicles.driverPhone,
        status: schema.transportAssignments.status,
      })
      .from(schema.transportAssignments)
      .innerJoin(schema.transportRoutes, eq(schema.transportAssignments.routeId, schema.transportRoutes.id))
      .leftJoin(schema.transportVehicles, eq(schema.transportVehicles.routeId, schema.transportRoutes.id))
      .where(eq(schema.transportAssignments.studentId, principal.studentId))
      .limit(1);

    return row ?? {
      assignmentId: null,
      routeId: null,
      routeName: null,
      stopName: null,
      vehicleRegistration: null,
      driverName: null,
      driverPhone: null,
      status: null,
    };
  }

  async hostel(principal: InstitutionalStudentPrincipal) {
    const [row] = await this.db
      .select({
        blockName: schema.hostelBlocks.name,
        roomNo: schema.hostelRooms.roomNo,
        warden: schema.hostelBlocks.warden,
      })
      .from(schema.hostelAllocations)
      .innerJoin(schema.hostelRooms, eq(schema.hostelAllocations.roomId, schema.hostelRooms.id))
      .leftJoin(schema.hostelBlocks, eq(schema.hostelRooms.blockId, schema.hostelBlocks.id))
      .where(and(eq(schema.hostelAllocations.studentId, principal.studentId), eq(schema.hostelAllocations.status, 'active')))
      .limit(1);

    return row ?? { blockName: null, roomNo: null, warden: null };
  }

  async documents(principal: InstitutionalStudentPrincipal) {
    const rows = await this.db
      .select()
      .from(schema.institutionDocuments)
      .where(and(eq(schema.institutionDocuments.institutionId, principal.institutionId), eq(schema.institutionDocuments.published, true)));
    return {
      items: rows.map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        url: d.url,
      })),
    };
  }

  async pages(principal: InstitutionalStudentPrincipal) {
    const rows = await this.db
      .select({ key: schema.studentContentPages.pageKey, title: schema.studentContentPages.title })
      .from(schema.studentContentPages)
      .where(and(eq(schema.studentContentPages.institutionId, principal.institutionId), eq(schema.studentContentPages.status, 'published')));
    return { items: rows.map((r) => ({ key: r.key, title: r.title })) };
  }

  async page(principal: InstitutionalStudentPrincipal, key: string) {
    const [row] = await this.db
      .select()
      .from(schema.studentContentPages)
      .where(
        and(
          eq(schema.studentContentPages.institutionId, principal.institutionId),
          eq(schema.studentContentPages.pageKey, key),
          eq(schema.studentContentPages.status, 'published'),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      key: row.pageKey,
      title: row.title,
      bodyRichtext: row.bodyRichtext,
      attachmentIds: row.attachmentIds,
    };
  }

  async governanceDefault() {
    return { homeworkDefaultPolicy: 'off' as const };
  }
}
