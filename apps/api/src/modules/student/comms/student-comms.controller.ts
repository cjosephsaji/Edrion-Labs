import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { CurrentStudent } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentCommsService } from './student-comms.service';

@ApiTags('student-comms')
@Controller('student/announcements')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard)
export class StudentAnnouncementsController {
  constructor(private readonly comms: StudentCommsService) {}

  @Get()
  list(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.comms.announcements(principal);
  }
}

@ApiTags('student-comms')
@Controller('student/notifications')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard)
export class StudentNotificationsController {
  constructor(private readonly comms: StudentCommsService) {}

  @Get()
  list(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.comms.notifications(principal);
  }

  @Post(':id/read')
  read(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.comms.readNotification(principal, id);
  }

  @Post('read-all')
  readAll(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.comms.readAllNotifications(principal);
  }
}
