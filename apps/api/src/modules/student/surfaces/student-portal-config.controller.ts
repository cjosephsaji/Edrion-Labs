import { Controller, Get, Header, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentPortalConfigService } from '../../portal/student-portal-config.service';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { CurrentStudent } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';

@Controller('student/portal-config')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard)
export class StudentPortalRuntimeConfigController {
  constructor(private readonly config: StudentPortalConfigService) {}

  @Get()
  @Header('Cache-Control', 'private, max-age=0, must-revalidate')
  async get(@CurrentStudent() principal: StudentPrincipal, @Req() req: Request, @Res() res: Response) {
    const value = await this.config.getForStudent(principal);
    const etag = `"${value.config_fingerprint}"`;
    if (req.header('if-none-match') === etag) return res.status(304).end();
    return res.setHeader('ETag', etag).json(value);
  }
}
