import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import type { TermRecomputeDecisionInput, TermRecomputeProposeInput } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { PortalActionContext } from './portal-action-context';
import { ResultsJobsService } from './results-jobs.service';

@Injectable()
export class TermRecomputeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly resultsJobs: ResultsJobsService,
  ) {}

  async list(ctx: PortalActionContext, status?: string) {
    const conditions = [eq(schema.termRecomputeRequests.institutionId, ctx.principal.institutionId)];
    if (status) conditions.push(eq(schema.termRecomputeRequests.status, status));
    return this.db
      .select()
      .from(schema.termRecomputeRequests)
      .where(and(...conditions))
      .orderBy(desc(schema.termRecomputeRequests.createdAt));
  }

  async propose(ctx: PortalActionContext, input: TermRecomputeProposeInput) {
    const [term] = await this.db
      .select()
      .from(schema.academicTerms)
      .where(
        and(
          eq(schema.academicTerms.id, input.term_id),
          eq(schema.academicTerms.institutionId, ctx.principal.institutionId),
        ),
      )
      .limit(1);
    if (!term) throw new BadRequestException({ code: 'TERM_NOT_FOUND', message: 'Term not found.' });

    const stamped = Boolean(term.gradingSchemeId);
    if (!stamped) {
      throw new BadRequestException({
        code: 'TERM_NOT_STAMPED',
        message: 'Term scheme is not stamped yet. Recompute runs automatically on release.',
      });
    }

    const [schemeVersion] = await this.db
      .select()
      .from(schema.gradingSchemeVersions)
      .where(
        and(
          eq(schema.gradingSchemeVersions.schemeId, input.scheme_id),
          eq(schema.gradingSchemeVersions.version, input.scheme_version),
        ),
      )
      .limit(1);
    if (!schemeVersion) {
      throw new BadRequestException({ code: 'SCHEME_VERSION_NOT_FOUND', message: 'Scheme version not found.' });
    }

    const [pending] = await this.db
      .select({ id: schema.termRecomputeRequests.id })
      .from(schema.termRecomputeRequests)
      .where(
        and(
          eq(schema.termRecomputeRequests.termId, input.term_id),
          eq(schema.termRecomputeRequests.status, 'pending_approval'),
        ),
      )
      .limit(1);
    if (pending) {
      throw new ConflictException({
        code: 'PENDING_EXISTS',
        message: 'A recompute request is already pending for this term.',
      });
    }

    const [created] = await this.db
      .insert(schema.termRecomputeRequests)
      .values({
        institutionId: ctx.principal.institutionId,
        termId: input.term_id,
        schemeId: input.scheme_id,
        schemeVersion: input.scheme_version,
        reason: input.reason,
        status: 'pending_approval',
        proposedBy: ctx.principal.institutionUserId,
      })
      .returning();
    return created;
  }

  async approve(ctx: PortalActionContext, id: string, input: TermRecomputeDecisionInput) {
    const row = await this.require(ctx, id);
    if (row.status !== 'pending_approval') {
      throw new ConflictException({ code: 'INVALID_STATUS', message: 'Request is not pending approval.' });
    }
    if (row.proposedBy === ctx.principal.institutionUserId) {
      throw new UnprocessableEntityException({
        code: 'SAME_APPROVER',
        message: 'A different approver is required.',
      });
    }

    const [updated] = await this.db
      .update(schema.termRecomputeRequests)
      .set({
        status: 'approved',
        approvedBy: ctx.principal.institutionUserId,
        version: input.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.termRecomputeRequests.id, id),
          eq(schema.termRecomputeRequests.version, input.version),
        ),
      )
      .returning();
    if (!updated) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Request changed elsewhere.' });

    await this.db
      .update(schema.academicTerms)
      .set({
        gradingSchemeId: updated.schemeId,
        gradingSchemeVersion: updated.schemeVersion,
        updatedAt: new Date(),
      })
      .where(eq(schema.academicTerms.id, updated.termId));

    await this.enqueueTermStudents(updated.institutionId, updated.termId);
    const [completed] = await this.db
      .update(schema.termRecomputeRequests)
      .set({ status: 'completed', version: updated.version + 1, updatedAt: new Date() })
      .where(eq(schema.termRecomputeRequests.id, updated.id))
      .returning();
    return completed;
  }

  async reject(ctx: PortalActionContext, id: string, input: TermRecomputeDecisionInput) {
    const row = await this.require(ctx, id);
    if (row.status !== 'pending_approval') {
      throw new ConflictException({ code: 'INVALID_STATUS', message: 'Request is not pending approval.' });
    }
    const [updated] = await this.db
      .update(schema.termRecomputeRequests)
      .set({
        status: 'rejected',
        rejectedNote: input.note ?? null,
        version: input.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.termRecomputeRequests.id, id),
          eq(schema.termRecomputeRequests.version, input.version),
        ),
      )
      .returning();
    if (!updated) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Request changed elsewhere.' });
    return updated;
  }

  private async require(ctx: PortalActionContext, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.termRecomputeRequests)
      .where(
        and(
          eq(schema.termRecomputeRequests.id, id),
          eq(schema.termRecomputeRequests.institutionId, ctx.principal.institutionId),
        ),
      )
      .limit(1);
    if (!row) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Request not found.' });
    return row;
  }

  private async enqueueTermStudents(institutionId: string, termId: string) {
    const rows = await this.db
      .selectDistinct({ studentId: schema.gradeEntries.studentId })
      .from(schema.gradeEntries)
      .where(
        and(
          eq(schema.gradeEntries.institutionId, institutionId),
          eq(schema.gradeEntries.termId, termId),
        ),
      );
    const studentIds =
      rows.length > 0
        ? rows.map((r) => r.studentId)
        : (
            await this.db
              .select({ studentId: schema.studentTermResults.studentId })
              .from(schema.studentTermResults)
              .where(
                and(
                  eq(schema.studentTermResults.institutionId, institutionId),
                  eq(schema.studentTermResults.termId, termId),
                ),
              )
          ).map((r) => r.studentId);

    for (const studentId of studentIds) {
      await this.resultsJobs.enqueueRecompute({
        institutionId,
        studentId,
        termId,
        emitFeed: true,
      });
    }
  }
}
