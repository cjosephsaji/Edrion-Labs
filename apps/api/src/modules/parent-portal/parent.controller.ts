import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/guards/auth.guard';
import { SkipRateLimit } from '../../common/decorators';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { GuardianScopeGuard } from './guardian-scope.guard';
import { CurrentGuardian } from './parent.decorators';
import type { GuardianContext } from './guardian-context';
import { ParentMeService } from './parent-me.service';

/**
 * Parent Portal API (/v1/parent/*). @Public so the platform AuthGuard skips it; the real boundary is
 * InstitutionAuthGuard (authenticates the institution_user) → GuardianScopeGuard (loads the caller's
 * wards). Every ward-scoped endpoint validates its :studentId against the guardian context.
 */
@ApiTags('parent-portal')
@Controller('parent')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, GuardianScopeGuard)
export class ParentController {
  constructor(private readonly meService: ParentMeService) {}

  /** The authenticated guardian, their wards (with per-ward hidden sections), preferences + badges. */
  @Get('me')
  me(@CurrentGuardian() guardian: GuardianContext) {
    return this.meService.getMe(guardian);
  }
}
