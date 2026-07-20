import { Injectable, NotFoundException } from '@nestjs/common';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import { STUDENT_SURFACES, type StudentSurfaceKey } from '@edrion/shared-types';
import type { StudentPrincipal } from '../student.types';

const PORTAL_FLAG = 'student.portal';

/** Defaults match migration 0049 / seed when a definition row is missing. */
const FLAG_DEFAULTS: Record<string, boolean> = {
  'student.portal': true,
  'student.surface.fees': false,
  'student.surface.transport': false,
  'student.surface.hostel': false,
  'student.surface.documents': false,
  'student.surface.requests': false,
  'student.surface.content': false,
  'student.surface.exams': false,
};

@Injectable()
export class SurfacesService {
  constructor(private readonly features: FeatureControlsService) {}

  async isPortalEnabled(principal: StudentPrincipal): Promise<boolean> {
    if (principal.kind === 'independent') return true;
    return this.resolveFlag(PORTAL_FLAG, {
      institutionId: principal.institutionId,
      campusId: principal.campusId ?? undefined,
      institutionUserId: principal.institutionUserId,
    });
  }

  async resolveForPrincipal(principal: StudentPrincipal): Promise<Record<StudentSurfaceKey, boolean>> {
    const out = {} as Record<StudentSurfaceKey, boolean>;
    if (principal.kind === 'independent') {
      for (const surface of STUDENT_SURFACES) out[surface.key] = false;
      return out;
    }

    const portalOn = await this.isPortalEnabled(principal);
    await Promise.all(
      STUDENT_SURFACES.map(async (surface) => {
        if (!portalOn) {
          out[surface.key] = false;
          return;
        }
        out[surface.key] = await this.resolveFlag(surface.featureFlagKey, {
          institutionId: principal.institutionId,
          campusId: principal.campusId ?? undefined,
          institutionUserId: principal.institutionUserId,
        });
      }),
    );
    return out;
  }

  /**
   * Resolve a student-portal flag. Missing definitions must not break `/me` /
   * bootstrap (seed historically wiped migration-inserted student flags).
   */
  private async resolveFlag(
    key: string,
    query: {
      institutionId: string;
      campusId?: string;
      institutionUserId: string;
    },
  ): Promise<boolean> {
    try {
      const resolution = await this.features.resolveByKey(key, query);
      return resolution.value;
    } catch (err) {
      if (err instanceof NotFoundException) return FLAG_DEFAULTS[key] ?? false;
      throw err;
    }
  }
}
