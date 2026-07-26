import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { InstitutionPrincipal } from '@edrion/auth';
import { Public, SkipRateLimit } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import { CurrentInstitutionPrincipal } from '../portal/portal.decorators';
import { MfaService } from './mfa.service';

const verifySchema = z.object({ factorId: z.string().uuid(), code: z.string().trim().min(6).max(8) });
const challengeSchema = z.object({ code: z.string().trim().min(6).max(8) });
const recoverySchema = z.object({ code: z.string().trim().min(8).max(16) });
const factorIdSchema = z.object({ factorId: z.string().uuid() });

@ApiTags('portal-mfa')
@Controller('portal/mfa')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @Post('enroll/begin')
  enrollBegin(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    return this.mfa.enrollBegin(principal);
  }

  @Post('enroll/verify')
  enrollVerify(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Body(zodBody(verifySchema)) body: z.infer<typeof verifySchema>,
  ) {
    return this.mfa.enrollVerify(principal, body.factorId, body.code);
  }

  @Post('challenge')
  challenge(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Body(zodBody(challengeSchema)) body: z.infer<typeof challengeSchema>,
  ) {
    return this.mfa.challenge(principal, body.code);
  }

  @Post('recovery/generate')
  recoveryGenerate(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    return this.mfa.generateRecoveryCodes(principal);
  }

  @Post('recovery/consume')
  recoveryConsume(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Body(zodBody(recoverySchema)) body: z.infer<typeof recoverySchema>,
  ) {
    return this.mfa.consumeRecoveryCode(principal, body.code);
  }

  @Post('factors/revoke')
  revokeFactor(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Body(zodBody(factorIdSchema)) body: z.infer<typeof factorIdSchema>,
  ) {
    return this.mfa.revokeFactor(principal, body.factorId);
  }
}
