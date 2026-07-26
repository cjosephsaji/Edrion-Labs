import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';

export interface FeesSummaryDto {
  outstandingMinor: number;
  dueSoon: { invoiceNo: string; dueDate: string; amountMinor: number }[];
  currency: string;
}

@Injectable()
export class FeesSummaryService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getSummary(principal: InstitutionalStudentPrincipal): Promise<FeesSummaryDto> {
    const [institution] = await this.db
      .select({ currency: schema.institutions.currency })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, principal.institutionId))
      .limit(1);

    const openStatuses = ['pending', 'partial', 'overdue'] as const;
    const rows = await this.db
      .select()
      .from(schema.feeInvoices)
      .where(
        and(
          eq(schema.feeInvoices.studentId, principal.studentId),
          eq(schema.feeInvoices.institutionId, principal.institutionId),
          inArray(schema.feeInvoices.status, [...openStatuses]),
        ),
      );

    let outstandingMinor = 0;
    const dueSoon: FeesSummaryDto['dueSoon'] = [];
    const soonCutoff = new Date();
    soonCutoff.setDate(soonCutoff.getDate() + 14);

    for (const inv of rows) {
      const balance = Math.max(0, inv.amount - inv.amountPaid);
      outstandingMinor += balance;
      if (inv.dueDate && balance > 0) {
        const due = new Date(inv.dueDate);
        if (due <= soonCutoff) {
          dueSoon.push({
            invoiceNo: inv.invoiceNo,
            dueDate: inv.dueDate,
            amountMinor: balance,
          });
        }
      }
    }

    dueSoon.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return {
      outstandingMinor,
      dueSoon,
      currency: institution?.currency ?? 'USD',
    };
  }
}
