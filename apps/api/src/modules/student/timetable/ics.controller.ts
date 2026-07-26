import { Controller, Delete, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { IcsService } from './ics.service';

@ApiTags('student-timetable-ics')
@Controller('student')
@Public()
@SkipRateLimit()
export class IcsController {
  constructor(private readonly ics: IcsService) {}

  @Get('timetable.ics')
  async feed(@Query('token') token: string | undefined, @Res() response: Response) {
    if (!token) {
      response.status(400).send('token required');
      return;
    }
    const body = await this.ics.feed(token);
    response.setHeader('content-type', 'text/calendar; charset=utf-8');
    response.setHeader('cache-control', 'private, max-age=900');
    response.send(body);
  }

  @Post('ics-token')
  @UseGuards(StudentAuthGuard, StudentPermissionsGuard)
  createToken(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.ics.createOrRegenerate(principal);
  }

  @Delete('ics-token')
  @UseGuards(StudentAuthGuard, StudentPermissionsGuard)
  revokeToken(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.ics.revoke(principal);
  }
}
