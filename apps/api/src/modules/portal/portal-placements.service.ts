import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import type { InstitutionPrincipal } from '@edrion/auth';

@Injectable()
export class PortalPlacementsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listSeasons(principal: InstitutionPrincipal) {
    return this.db
      .select()
      .from(schema.placementSeasons)
      .where(eq(schema.placementSeasons.institutionId, principal.institutionId))
      .orderBy(desc(schema.placementSeasons.createdAt));
  }

  async createSeason(
    principal: InstitutionPrincipal,
    input: { name: string; campusId?: string | null; status?: string },
  ) {
    const [row] = await this.db
      .insert(schema.placementSeasons)
      .values({
        institutionId: principal.institutionId,
        campusId: input.campusId ?? null,
        name: input.name.trim(),
        status: input.status ?? 'draft',
      })
      .returning();
    return row!;
  }

  async listDrives(principal: InstitutionPrincipal, seasonId?: string) {
    const seasons = seasonId
      ? await this.db
          .select({ id: schema.placementSeasons.id })
          .from(schema.placementSeasons)
          .where(
            and(
              eq(schema.placementSeasons.institutionId, principal.institutionId),
              eq(schema.placementSeasons.id, seasonId),
            ),
          )
      : await this.db
          .select({ id: schema.placementSeasons.id })
          .from(schema.placementSeasons)
          .where(eq(schema.placementSeasons.institutionId, principal.institutionId));

    const seasonIds = seasons.map((s) => s.id);
    if (seasonIds.length === 0) return [];

    return this.db
      .select({
        drive: schema.placementDrives,
        company: schema.placementCompanies,
        season: schema.placementSeasons,
      })
      .from(schema.placementDrives)
      .innerJoin(schema.placementCompanies, eq(schema.placementDrives.companyId, schema.placementCompanies.id))
      .innerJoin(schema.placementSeasons, eq(schema.placementDrives.seasonId, schema.placementSeasons.id))
      .where(eq(schema.placementSeasons.institutionId, principal.institutionId))
      .orderBy(desc(schema.placementDrives.createdAt));
  }

  async listCompanies(principal: InstitutionPrincipal) {
    return this.db
      .select()
      .from(schema.placementCompanies)
      .where(eq(schema.placementCompanies.institutionId, principal.institutionId))
      .orderBy(desc(schema.placementCompanies.createdAt));
  }

  async createCompany(principal: InstitutionPrincipal, input: { name: string; sector?: string }) {
    const [row] = await this.db
      .insert(schema.placementCompanies)
      .values({
        institutionId: principal.institutionId,
        name: input.name.trim(),
        sector: input.sector?.trim() || null,
      })
      .returning();
    return row!;
  }

  async createDrive(
    principal: InstitutionPrincipal,
    input: {
      seasonId: string;
      companyId: string;
      title: string;
      packageBand?: string;
      eligibility?: Record<string, unknown>;
    },
  ) {
    const [season] = await this.db
      .select()
      .from(schema.placementSeasons)
      .where(
        and(
          eq(schema.placementSeasons.id, input.seasonId),
          eq(schema.placementSeasons.institutionId, principal.institutionId),
        ),
      )
      .limit(1);
    if (!season) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Season not found.' });

    const [company] = await this.db
      .select()
      .from(schema.placementCompanies)
      .where(
        and(
          eq(schema.placementCompanies.id, input.companyId),
          eq(schema.placementCompanies.institutionId, principal.institutionId),
        ),
      )
      .limit(1);
    if (!company) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Company not found.' });

    const [row] = await this.db
      .insert(schema.placementDrives)
      .values({
        seasonId: input.seasonId,
        companyId: input.companyId,
        title: input.title.trim(),
        packageBand: input.packageBand?.trim() || null,
        eligibility: input.eligibility ?? {},
        status: 'scheduled',
      })
      .returning();
    return row!;
  }

  async listApplications(principal: InstitutionPrincipal, driveId?: string) {
    const conditions = [eq(schema.placementSeasons.institutionId, principal.institutionId)];
    if (driveId) conditions.push(eq(schema.placementApplications.driveId, driveId));

    return this.db
      .select({
        application: schema.placementApplications,
        drive: schema.placementDrives,
        company: schema.placementCompanies,
        student: schema.students,
      })
      .from(schema.placementApplications)
      .innerJoin(schema.placementDrives, eq(schema.placementApplications.driveId, schema.placementDrives.id))
      .innerJoin(schema.placementCompanies, eq(schema.placementDrives.companyId, schema.placementCompanies.id))
      .innerJoin(schema.placementSeasons, eq(schema.placementDrives.seasonId, schema.placementSeasons.id))
      .innerJoin(schema.students, eq(schema.placementApplications.studentId, schema.students.id))
      .where(and(...conditions))
      .orderBy(desc(schema.placementApplications.submittedAt));
  }

  async updateApplicationStatus(
    principal: InstitutionPrincipal,
    applicationId: string,
    status: string,
  ) {
    const allowed = new Set(['submitted', 'shortlisted', 'interview', 'offered', 'rejected', 'withdrawn']);
    if (!allowed.has(status)) {
      throw new BadRequestException({ code: 'INVALID_STATUS', message: 'Unsupported application status.' });
    }
    const rows = await this.listApplications(principal);
    const match = rows.find((r) => r.application.id === applicationId);
    if (!match) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Application not found.' });

    const [row] = await this.db
      .update(schema.placementApplications)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.placementApplications.id, applicationId))
      .returning();
    return row!;
  }
}
