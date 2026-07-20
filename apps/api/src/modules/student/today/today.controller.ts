import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  createUserObligationSchema,
  updateTodayPreferencesSchema,
  updateUserObligationSchema,
  type CreateUserObligationInput,
  type UpdateTodayPreferencesInput,
  type UpdateUserObligationInput,
} from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { TodayService } from './today.service';

@ApiTags('student-today')
@Controller('student')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class TodayController {
  constructor(private readonly today: TodayService) {}

  @Get('today')
  async getToday(@CurrentStudent() p: StudentPrincipal, @Headers('if-none-match') match: string | undefined, @Res({ passthrough: true }) response: Response) {
    const result = await this.today.getToday(p);
    response.setHeader('etag', result.etag);
    response.setHeader('cache-control', 'private, no-cache');
    if (match === result.etag) { response.status(304); return; }
    return result.payload;
  }

  @Get('feed')
  feed(@CurrentStudent() p: StudentPrincipal, @Query('cursor') cursor?: string) { return this.today.feed(p, cursor); }

  @Post('me/obligations')
  create(@CurrentStudent() p: StudentPrincipal, @Headers('idempotency-key') key: string | undefined, @Body(zodBody(createUserObligationSchema)) body: CreateUserObligationInput) { return this.today.createObligation(p, body, key); }

  @Patch('me/obligations/:id')
  update(@CurrentStudent() p: StudentPrincipal, @Param('id') id: string, @Body(zodBody(updateUserObligationSchema)) body: UpdateUserObligationInput) { return this.today.updateObligation(p, id, body); }

  @Delete('me/obligations/:id')
  dismiss(@CurrentStudent() p: StudentPrincipal, @Param('id') id: string) { return this.today.dismissObligation(p, id); }

  @Get('me/today-preferences')
  preferences(@CurrentStudent() p: StudentPrincipal) { return this.today.getPreferences(p); }

  @Patch('me/today-preferences')
  updatePreferences(@CurrentStudent() p: StudentPrincipal, @Body(zodBody(updateTodayPreferencesSchema)) body: UpdateTodayPreferencesInput) { return this.today.updatePreferences(p, body); }
}
