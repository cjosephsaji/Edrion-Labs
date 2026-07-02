import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  ilike,
  inArray,
  or,
  schema,
  type Database,
} from '@edrion/database';
import type {
  AdmissionApplication,
  AdmissionApplicationDraft,
  AdmissionInfoRequest,
  Institution,
  NewAdmissionApplication,
  NewAdmissionApplicationDraft,
} from '@edrion/database';
import { DATABASE } from '../../common/tokens';

/** Institution statuses a parent is allowed to apply to (live / accepting admissions). */
const APPLICABLE_STATUSES = ['active', 'trial'] as const;

export interface PublicInstitutionView {
  id: string;
  displayName: string;
  publicId: string;
  logoUrl: string | null;
  country: string;
}

export interface PublicInstitutionOptions {
  campuses: { id: string; name: string }[];
  academicYears: { id: string; name: string }[];
  gradeLevels: { id: string; name: string; level: number }[];
}

/** Typed SQL only for the public admission funnel — no business rules (those live in the service). */
@Injectable()
export class AdmissionsPublicRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // ── Institution discovery (public, minimal fields) ─────────────────────────

  async listInstitutions(q?: string): Promise<PublicInstitutionView[]> {
    const t = schema.institutions;
    const live = inArray(t.status, APPLICABLE_STATUSES as unknown as string[]);
    const where =
      q && q.trim()
        ? and(live, or(ilike(t.displayName, `%${q.trim()}%`), ilike(t.publicId, `%${q.trim()}%`)))
        : live;
    const rows = await this.db
      .select({
        id: t.id,
        displayName: t.displayName,
        publicId: t.publicId,
        logoUrl: t.logoUrl,
        country: t.country,
      })
      .from(t)
      .where(where)
      .orderBy(asc(t.displayName))
      .limit(20);
    return rows;
  }

  /** The institution row if it exists AND is currently accepting admissions; else undefined. */
  async findApplicableInstitution(id: string): Promise<Institution | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.institutions)
      .where(
        and(
          eq(schema.institutions.id, id),
          inArray(schema.institutions.status, APPLICABLE_STATUSES as unknown as string[]),
        ),
      )
      .limit(1);
    return row;
  }

  async institutionOptions(institutionId: string): Promise<PublicInstitutionOptions> {
    const [campuses, academicYears, gradeLevels] = await Promise.all([
      this.db
        .select({ id: schema.campuses.id, name: schema.campuses.name })
        .from(schema.campuses)
        .where(
          and(eq(schema.campuses.institutionId, institutionId), eq(schema.campuses.isActive, true)),
        )
        .orderBy(asc(schema.campuses.name)),
      this.db
        .select({ id: schema.academicYears.id, name: schema.academicYears.name })
        .from(schema.academicYears)
        .where(eq(schema.academicYears.institutionId, institutionId))
        .orderBy(asc(schema.academicYears.startDate)),
      this.db
        .select({
          id: schema.gradeLevels.id,
          name: schema.gradeLevels.name,
          level: schema.gradeLevels.level,
        })
        .from(schema.gradeLevels)
        .where(eq(schema.gradeLevels.institutionId, institutionId))
        .orderBy(asc(schema.gradeLevels.level)),
    ]);
    return { campuses, academicYears, gradeLevels };
  }

  // ── Drafts ─────────────────────────────────────────────────────────────────

  async insertDraft(values: NewAdmissionApplicationDraft): Promise<AdmissionApplicationDraft> {
    const [row] = await this.db.insert(schema.admissionApplicationDrafts).values(values).returning();
    return row!;
  }

  async findDraftById(id: string): Promise<AdmissionApplicationDraft | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.admissionApplicationDrafts)
      .where(eq(schema.admissionApplicationDrafts.id, id))
      .limit(1);
    return row;
  }

  async updateDraft(
    id: string,
    patch: Partial<NewAdmissionApplicationDraft>,
  ): Promise<AdmissionApplicationDraft | undefined> {
    const [row] = await this.db
      .update(schema.admissionApplicationDrafts)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.admissionApplicationDrafts.id, id))
      .returning();
    return row;
  }

  // ── Submitted applications ───────────────────────────────────────────────────

  async applicationNoExists(institutionId: string, applicationNo: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.admissionApplications.id })
      .from(schema.admissionApplications)
      .where(
        and(
          eq(schema.admissionApplications.institutionId, institutionId),
          eq(schema.admissionApplications.applicationNo, applicationNo),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async insertApplication(values: NewAdmissionApplication): Promise<AdmissionApplication> {
    const [row] = await this.db.insert(schema.admissionApplications).values(values).returning();
    return row!;
  }

  async findApplicationById(id: string): Promise<AdmissionApplication | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.admissionApplications)
      .where(eq(schema.admissionApplications.id, id))
      .limit(1);
    return row;
  }

  // --- info requests (staff-built forms the parent fills over a token link) ----

  async findInfoRequestById(id: string): Promise<AdmissionInfoRequest | undefined> {
    const [row] = await this.db.select().from(schema.admissionInfoRequests).where(eq(schema.admissionInfoRequests.id, id)).limit(1);
    return row;
  }

  async saveInfoResponses(id: string, responses: Record<string, unknown>): Promise<AdmissionInfoRequest | undefined> {
    const [row] = await this.db
      .update(schema.admissionInfoRequests)
      .set({ responses, status: 'submitted', submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.admissionInfoRequests.id, id))
      .returning();
    return row;
  }

  async setApplicationStatus(id: string, status: string): Promise<void> {
    await this.db
      .update(schema.admissionApplications)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.admissionApplications.id, id));
  }
}
