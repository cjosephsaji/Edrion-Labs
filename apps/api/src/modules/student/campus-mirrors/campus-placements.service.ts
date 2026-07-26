import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';
import {
  evaluatePlacementEligibility,
  PlacementEligibilityService,
  type PlacementEligibilityRule,
} from './placement-eligibility.service';

@Injectable()
export class CampusPlacementsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly eligibility: PlacementEligibilityService,
  ) {}

  private requireInstitutional(p: StudentPrincipal) {
    if (p.kind !== 'institutional') throw new BadRequestException({ code: 'INSTITUTION_ONLY', message: 'Placements require a school account.' });
    return p;
  }

  async listOpportunities(p: StudentPrincipal) {
    const principal = this.requireInstitutional(p);
    const ctx = await this.eligibility.studentContext(principal.studentId, principal.institutionId);
    const rows = await this.listDrives(p);
    const drives = Array.isArray(rows) ? rows : [];
    return drives.map((row) => {
      const rule = (row.drive.eligibility ?? {}) as PlacementEligibilityRule;
      const check = evaluatePlacementEligibility(rule, ctx);
      return { ...row, eligibility: check };
    });
  }

  async listDrives(p: StudentPrincipal) {
    const principal = this.requireInstitutional(p);
    const seasons = await this.db
      .select()
      .from(schema.placementSeasons)
      .where(
        and(
          eq(schema.placementSeasons.institutionId, principal.institutionId),
          eq(schema.placementSeasons.status, 'open'),
        ),
      );
    if (!seasons[0]) return { drives: [] };
    return this.db
      .select({
        drive: schema.placementDrives,
        company: schema.placementCompanies,
      })
      .from(schema.placementDrives)
      .innerJoin(schema.placementCompanies, eq(schema.placementDrives.companyId, schema.placementCompanies.id))
      .where(eq(schema.placementDrives.seasonId, seasons[0].id));
  }

  async apply(p: StudentPrincipal, driveId: string) {
    const principal = this.requireInstitutional(p);
    const [drive] = await this.db
      .select()
      .from(schema.placementDrives)
      .where(eq(schema.placementDrives.id, driveId))
      .limit(1);
    if (!drive) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Drive not found.' });
    const ctx = await this.eligibility.studentContext(principal.studentId, principal.institutionId);
    const check = evaluatePlacementEligibility((drive.eligibility ?? {}) as PlacementEligibilityRule, ctx);
    if (!check.eligible) {
      throw new BadRequestException({ code: 'NOT_ELIGIBLE', message: check.reasons.join('; ') });
    }
    try {
      const [row] = await this.db
        .insert(schema.placementApplications)
        .values({
          driveId,
          studentId: principal.studentId,
          status: 'submitted',
          submittedAt: new Date(),
        })
        .returning();
      return row!;
    } catch {
      const [existing] = await this.db
        .select()
        .from(schema.placementApplications)
        .where(
          and(
            eq(schema.placementApplications.driveId, driveId),
            eq(schema.placementApplications.studentId, principal.studentId),
          ),
        )
        .limit(1);
      return existing!;
    }
  }
}
