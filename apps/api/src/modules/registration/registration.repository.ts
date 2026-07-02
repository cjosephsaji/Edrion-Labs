import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  schema,
  sql,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type {
  InstitutionRegistrationRequest,
  InstitutionRegistrationReview,
  NewInstitutionRegistrationRequest,
  NewInstitutionRegistrationReview,
} from '@edrion/database';
import type { ListRegistrationsQuery, PublicPlanView } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

const SORTABLE: Record<string, PgColumn> = {
  displayName: schema.institutionRegistrationRequests.displayName,
  status: schema.institutionRegistrationRequests.status,
  type: schema.institutionRegistrationRequests.type,
  country: schema.institutionRegistrationRequests.country,
  expectedStudents: schema.institutionRegistrationRequests.expectedStudents,
  submittedAt: schema.institutionRegistrationRequests.submittedAt,
  createdAt: schema.institutionRegistrationRequests.createdAt,
  updatedAt: schema.institutionRegistrationRequests.updatedAt,
};

/** Typed SQL only — no business rules (those live in the services). */
@Injectable()
export class RegistrationRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // ── Requests ─────────────────────────────────────────────────────────────

  async insert(values: NewInstitutionRegistrationRequest): Promise<InstitutionRegistrationRequest> {
    const [row] = await this.db.insert(schema.institutionRegistrationRequests).values(values).returning();
    return row!;
  }

  async findById(id: string): Promise<InstitutionRegistrationRequest | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.institutionRegistrationRequests)
      .where(eq(schema.institutionRegistrationRequests.id, id))
      .limit(1);
    return row;
  }

  /** Plain update + version bump. Used on the public draft path (no optimistic check). */
  async update(
    id: string,
    patch: Partial<NewInstitutionRegistrationRequest>,
  ): Promise<InstitutionRegistrationRequest | undefined> {
    const [row] = await this.db
      .update(schema.institutionRegistrationRequests)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.institutionRegistrationRequests.id, id))
      .returning();
    return row;
  }

  /** Optimistic-concurrency update for reviewer actions. Returns undefined on a version mismatch. */
  async updateWithVersion(
    id: string,
    expectedVersion: number,
    patch: Partial<NewInstitutionRegistrationRequest>,
  ): Promise<InstitutionRegistrationRequest | undefined> {
    const [row] = await this.db
      .update(schema.institutionRegistrationRequests)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(
        and(
          eq(schema.institutionRegistrationRequests.id, id),
          eq(schema.institutionRegistrationRequests.version, expectedVersion),
        ),
      )
      .returning();
    return row;
  }

  /** An active (non-terminal) request for this contact email, excluding `exceptId`. */
  async findActiveByEmail(
    email: string,
    exceptId?: string,
  ): Promise<InstitutionRegistrationRequest | undefined> {
    const rows = await this.db
      .select()
      .from(schema.institutionRegistrationRequests)
      .where(
        and(
          eq(schema.institutionRegistrationRequests.contactEmail, email),
          or(
            eq(schema.institutionRegistrationRequests.status, 'submitted'),
            eq(schema.institutionRegistrationRequests.status, 'under_review'),
            eq(schema.institutionRegistrationRequests.status, 'approved'),
          ),
        ),
      );
    return rows.find((r) => r.id !== exceptId);
  }

  private buildWhere(q: ListRegistrationsQuery): SQL | undefined {
    const t = schema.institutionRegistrationRequests;
    const clauses: SQL[] = [];
    if (q.search) {
      const s = or(
        ilike(t.displayName, `%${q.search}%`),
        ilike(t.legalName, `%${q.search}%`),
        ilike(t.contactEmail, `%${q.search}%`),
        ilike(t.publicRef, `%${q.search}%`),
      );
      if (s) clauses.push(s);
    }
    if (q.status) clauses.push(eq(t.status, q.status));
    if (q.type) clauses.push(eq(t.type, q.type));
    if (q.country) clauses.push(eq(t.country, q.country));
    if (q.reviewerId) clauses.push(eq(t.assignedReviewerId, q.reviewerId));
    if (q.minStudents !== undefined) clauses.push(gte(t.expectedStudents, q.minStudents));
    if (q.maxStudents !== undefined) clauses.push(lte(t.expectedStudents, q.maxStudents));
    if (q.submittedFrom) clauses.push(gte(t.submittedAt, new Date(q.submittedFrom)));
    if (q.submittedTo) clauses.push(lte(t.submittedAt, new Date(q.submittedTo)));
    return clauses.length ? and(...clauses) : undefined;
  }

  async list(
    q: ListRegistrationsQuery,
  ): Promise<{ items: InstitutionRegistrationRequest[]; total: number }> {
    const where = this.buildWhere(q);
    const explicitCol = q.sortBy ? SORTABLE[q.sortBy] : undefined;
    // Reviewer default: newest submissions first, with un-submitted drafts (null submittedAt)
    // sinking to the bottom — otherwise a request drafted long before it was submitted buries
    // itself by createdAt. An explicit sortBy still wins.
    const order: SQL[] = explicitCol
      ? [q.sortDir === 'asc' ? asc(explicitCol) : desc(explicitCol)]
      : [
          sql`${schema.institutionRegistrationRequests.submittedAt} desc nulls last`,
          desc(schema.institutionRegistrationRequests.createdAt),
        ];

    const items = await this.db
      .select()
      .from(schema.institutionRegistrationRequests)
      .where(where)
      .orderBy(...order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);

    const totalRows = await this.db
      .select({ value: count() })
      .from(schema.institutionRegistrationRequests)
      .where(where);

    return { items, total: Number(totalRows[0]?.value ?? 0) };
  }

  /** Published institution plans (latest published version each) for the public funnel picker. */
  async listPublicPlans(): Promise<PublicPlanView[]> {
    const rows = await this.db
      .select({
        key: schema.plans.key,
        name: schema.plans.name,
        description: schema.plans.description,
        currency: schema.planVersions.currency,
        monthlyPriceMinor: schema.planVersions.monthlyPriceMinor,
        annualPriceMinor: schema.planVersions.annualPriceMinor,
        perCampusPriceMinor: schema.planVersions.perCampusPriceMinor,
      })
      .from(schema.plans)
      .innerJoin(schema.planVersions, eq(schema.planVersions.planId, schema.plans.id))
      .where(
        and(
          eq(schema.plans.audience, 'institution'),
          eq(schema.plans.status, 'published'),
          eq(schema.planVersions.status, 'published'),
        ),
      )
      .orderBy(desc(schema.planVersions.version));
    // Highest published version wins per plan key (rows are version-desc).
    const seen = new Set<string>();
    const out: PublicPlanView[] = [];
    for (const r of rows) {
      if (seen.has(r.key)) continue;
      seen.add(r.key);
      out.push(r);
    }
    return out;
  }

  async summaryByStatus(): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ status: schema.institutionRegistrationRequests.status, value: count() })
      .from(schema.institutionRegistrationRequests)
      .groupBy(schema.institutionRegistrationRequests.status);
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.value)]));
  }

  /** Count of requests already assigned a public ref for the given year (for the next sequence). */
  async countRefsForYear(year: number): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(schema.institutionRegistrationRequests)
      .where(ilike(schema.institutionRegistrationRequests.publicRef, `EDR-REG-${year}-%`));
    return Number(rows[0]?.value ?? 0);
  }

  // ── Reviews (history + internal notes) ─────────────────────────────────────

  async insertReview(
    values: NewInstitutionRegistrationReview,
  ): Promise<InstitutionRegistrationReview> {
    const [row] = await this.db.insert(schema.institutionRegistrationReviews).values(values).returning();
    return row!;
  }

  async reviewsFor(requestId: string): Promise<InstitutionRegistrationReview[]> {
    return this.db
      .select()
      .from(schema.institutionRegistrationReviews)
      .where(eq(schema.institutionRegistrationReviews.requestId, requestId))
      .orderBy(desc(schema.institutionRegistrationReviews.createdAt));
  }

  /** Audit events recorded against this request (entityType=registration_request). */
  async auditEventsFor(requestId: string, limit = 100) {
    return this.db
      .select({
        id: schema.auditEvents.id,
        action: schema.auditEvents.action,
        actorType: schema.auditEvents.actorType,
        actorName: schema.auditEvents.actorName,
        result: schema.auditEvents.result,
        riskLevel: schema.auditEvents.riskLevel,
        ip: schema.auditEvents.ip,
        occurredAt: schema.auditEvents.occurredAt,
        previousState: schema.auditEvents.previousState,
        newState: schema.auditEvents.newState,
      })
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.entityType, 'registration_request'),
          eq(schema.auditEvents.entityId, requestId),
        ),
      )
      .orderBy(desc(schema.auditEvents.occurredAt))
      .limit(limit);
  }
}
