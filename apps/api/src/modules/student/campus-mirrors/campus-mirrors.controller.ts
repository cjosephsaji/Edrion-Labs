import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { CampusMirrorsService } from './campus-mirrors.service';
import { CampusPlacementsService } from './campus-placements.service';
import { CampusLifeService } from './campus-life.service';
import { IdentityTokenService } from './identity-token.service';

@ApiTags('student-campus')
@Controller('student/campus')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.lab.use')
export class CampusMirrorsController {
  constructor(
    private readonly campus: CampusMirrorsService,
    private readonly placements: CampusPlacementsService,
    private readonly life: CampusLifeService,
  ) {}

  @Get('library/holds')
  holds(@CurrentStudent() p: StudentPrincipal) {
    return this.campus.listHolds(p);
  }

  @Post('library/holds')
  placeHold(@CurrentStudent() p: StudentPrincipal, @Body() body: unknown) {
    return this.campus.placeHold(p, body);
  }

  @Get('transport/assignment')
  transport(@CurrentStudent() p: StudentPrincipal) {
    return this.campus.transportAssignment(p);
  }

  @Get('transport/broadcasts')
  broadcasts(@CurrentStudent() p: StudentPrincipal) {
    return this.campus.recentBroadcasts(p);
  }

  @Get('id-card')
  idCard(@CurrentStudent() p: StudentPrincipal) {
    return this.campus.idCard(p);
  }

  @Post('id-card/token')
  refreshToken(@CurrentStudent() p: StudentPrincipal) {
    return this.campus.refreshIdToken(p);
  }

  @Get('events')
  events(@CurrentStudent() p: StudentPrincipal) {
    return this.campus.listEvents(p);
  }

  @Post('events/:id/register')
  registerEvent(@CurrentStudent() p: StudentPrincipal, @Param('id') id: string) {
    return this.campus.registerForEvent(p, id);
  }

  @Get('placements/drives')
  placementDrives(@CurrentStudent() p: StudentPrincipal) {
    return this.placements.listDrives(p);
  }

  @Get('placements/opportunities')
  placementOpportunities(@CurrentStudent() p: StudentPrincipal) {
    return this.placements.listOpportunities(p);
  }

  @Post('placements/drives/:id/apply')
  applyPlacement(@CurrentStudent() p: StudentPrincipal, @Param('id') id: string) {
    return this.placements.apply(p, id);
  }

  @Get('diary/:date')
  diary(@CurrentStudent() p: StudentPrincipal, @Param('date') date: string) {
    return this.life.diaryForDate(p, date);
  }

  @Post('diary/:date/sync-today')
  diarySync(@CurrentStudent() p: StudentPrincipal, @Param('date') date: string) {
    return this.life.syncDiaryToToday(p, date);
  }

  @Get('clubs')
  clubs(@CurrentStudent() p: StudentPrincipal) {
    return this.life.listClubs(p);
  }

  @Get('health')
  health(@CurrentStudent() p: StudentPrincipal) {
    return this.life.healthMirror(p);
  }

  @Get('outpass/status')
  outpass(@CurrentStudent() p: StudentPrincipal) {
    return this.life.outpassStatus(p);
  }
}

@ApiTags('security-identity')
@Controller('security/identity')
@Public()
@SkipRateLimit()
export class IdentityVerifyController {
  constructor(private readonly identity: IdentityTokenService) {}

  @Post('verify')
  verify(@Body() body: { institutionId: string; token: string; nonce: string; deviceId?: string; contextKind: string }) {
    return this.identity.verifyScan(body);
  }
}
