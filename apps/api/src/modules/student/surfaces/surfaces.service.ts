import { Injectable } from '@nestjs/common';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import { STUDENT_SURFACES, type StudentSurfaceKey } from '@edrion/shared-types';
import type { StudentPrincipal } from '../student.types';

const PORTAL_FLAG = 'student.portal';

@Injectable()
export class SurfacesService {
  constructor(private readonly features: FeatureControlsService) {}

  async isPortalEnabled(principal: StudentPrincipal): Promise<boolean> {
    if (principal.kind === 'independent') return true;
    const resolution = await this.features.resolveByKey(PORTAL_FLAG, {
      institutionId: principal.institutionId,
      campusId: principal.campusId ?? undefined,
      institutionUserId: principal.institutionUserId,
    });
    return resolution.value;
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
        const resolution = await this.features.resolveByKey(surface.featureFlagKey, {
          institutionId: principal.institutionId,
          campusId: principal.campusId ?? undefined,
          institutionUserId: principal.institutionUserId,
        });
        out[surface.key] = resolution.value;
      }),
    );
    return out;
  }
}
