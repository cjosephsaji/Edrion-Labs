import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { InstitutionPrincipal } from '@edrion/auth';
import { Public, SkipRateLimit } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, RequireInstitutionPermissions } from './portal.decorators';
import { PortalPtmService } from './portal-ptm.service';

const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  campusId: z.string().uuid().nullable().optional(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  slotLengthMinutes: z.number().int().min(5).max(120).optional(),
});

const addSlotSchema = z.object({
  teacherId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  capacity: z.number().int().min(1).max(10).optional(),
});

@ApiTags('portal-ptm')
@Controller('portal/ptm')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalPtmController {
  constructor(private readonly ptm: PortalPtmService) {}

  @Get('events')
  @RequireInstitutionPermissions('parent_comm.ptm.manage')
  events(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    return this.ptm.listEvents(principal);
  }

  @Post('events')
  @RequireInstitutionPermissions('parent_comm.ptm.manage')
  createEvent(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Body(zodBody(createEventSchema)) body: z.infer<typeof createEventSchema>,
  ) {
    return this.ptm.createEvent(principal, body);
  }

  @Post('events/:id/publish')
  @RequireInstitutionPermissions('parent_comm.ptm.manage')
  publish(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal, @Param('id') id: string) {
    return this.ptm.publishEvent(principal, id);
  }

  @Get('events/:id/slots')
  @RequireInstitutionPermissions('parent_comm.ptm.manage')
  slots(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal, @Param('id') id: string) {
    return this.ptm.listSlots(principal, id);
  }

  @Get('events/:id/bookings')
  @RequireInstitutionPermissions('parent_comm.ptm.manage')
  bookings(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal, @Param('id') id: string) {
    return this.ptm.listBookings(principal, id);
  }

  @Post('events/:id/slots')
  @RequireInstitutionPermissions('parent_comm.ptm.manage')
  addSlot(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Param('id') id: string,
    @Body(zodBody(addSlotSchema)) body: z.infer<typeof addSlotSchema>,
  ) {
    return this.ptm.addSlot(principal, id, body);
  }
}
