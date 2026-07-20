import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { StudentSurfaceKey } from '@edrion/shared-types';
import { SurfacesService } from './surfaces.service';
import type { StudentPrincipal } from '../student.types';

@Injectable()
export class SurfaceGateService {
  constructor(private readonly surfaces: SurfacesService) {}

  async isSurfaceEnabled(principal: StudentPrincipal, key: StudentSurfaceKey): Promise<boolean> {
    const flags = await this.surfaces.resolveForPrincipal(principal);
    return flags[key];
  }

  async assertSurface(principal: StudentPrincipal, key: StudentSurfaceKey): Promise<void> {
    if (!(await this.isSurfaceEnabled(principal, key))) {
      throw new ForbiddenException({ code: 'MODULE_DISABLED', module: key });
    }
  }
}

export function requireInstitutional<T extends StudentPrincipal>(
  principal: T,
): asserts principal is T & { kind: 'institutional'; studentId: string; institutionId: string } {
  if (principal.kind !== 'institutional') {
    throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
  }
}
