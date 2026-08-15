import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { SurfacesService } from '../surfaces/surfaces.service';

/** Blocks institutional routes when the student portal kill-switch is off. */
@Injectable()
export class StudentPortalGuard implements CanActivate {
  constructor(private readonly surfaces: SurfacesService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const principal = req.studentContext?.principal;
    if (!principal) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not authenticated' });
    }
    if (principal.kind === 'independent') return true;
    if (!(await this.surfaces.isPortalEnabled(principal))) {
      throw new ForbiddenException({
        code: 'PORTAL_DISABLED',
        message: 'The student portal is not available for your institution.',
      });
    }
    return true;
  }
}
