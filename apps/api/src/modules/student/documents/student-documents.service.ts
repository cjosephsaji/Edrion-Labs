import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';

@Injectable()
export class StudentDocumentsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(principal: InstitutionalStudentPrincipal) {
    const rows = await this.db
      .select()
      .from(schema.studentDocuments)
      .where(
        and(
          eq(schema.studentDocuments.studentId, principal.studentId),
          eq(schema.studentDocuments.published, true),
        ),
      )
      .orderBy(desc(schema.studentDocuments.issuedAt));

    return {
      items: rows.map((d) => ({
        id: d.id,
        title: d.title,
        docType: d.type,
        issuedAt: d.issuedAt?.toISOString() ?? d.createdAt.toISOString(),
        contentType: d.contentType,
      })),
    };
  }
}
