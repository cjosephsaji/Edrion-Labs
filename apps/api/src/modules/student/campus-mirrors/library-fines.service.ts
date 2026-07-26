import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import type { StudentPrincipal } from '../student.types';

@Injectable()
export class LibraryFinesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly features: FeatureControlsService,
  ) {}

  async postOverdueFine(
    institutionId: string,
    campusId: string,
    studentId: string,
    loanId: string,
    amountMinor: number,
  ) {
    const allowed = await this.features.resolveByKey('campus_library.fines', { institutionId, campusId });
    if (!allowed.value) return null;
    const idempotencyKey = `library_fine:${loanId}`;
    const [existing] = await this.db
      .select()
      .from(schema.libraryFineInvoiceLinks)
      .where(
        and(
          eq(schema.libraryFineInvoiceLinks.institutionId, institutionId),
          eq(schema.libraryFineInvoiceLinks.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return existing;

    const now = new Date();
    const [invoice] = await this.db
      .insert(schema.feeInvoices)
      .values({
        institutionId,
        campusId,
        invoiceNo: `LIB-${loanId.slice(0, 8)}`,
        studentId,
        source: 'other',
        amount: amountMinor,
        amountPaid: 0,
        status: 'pending',
        issueDate: now.toISOString().slice(0, 10),
        dueDate: new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10),
        origin: 'library',
      })
      .returning();
    const [item] = await this.db
      .insert(schema.feeInvoiceItems)
      .values({
        institutionId,
        invoiceId: invoice!.id,
        studentId,
        kind: 'charge',
        category: 'library',
        label: 'Library overdue fine',
        amountMinor,
        source: { loan_id: loanId },
      })
      .returning();
    const [link] = await this.db
      .insert(schema.libraryFineInvoiceLinks)
      .values({
        institutionId,
        loanId,
        feeInvoiceItemId: item!.id,
        idempotencyKey,
      })
      .returning();
    return link;
  }
}
