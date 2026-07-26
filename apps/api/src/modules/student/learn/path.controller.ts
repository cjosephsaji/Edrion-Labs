import { Body, Controller, Get, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { createPathInputSchema, patchPathInputSchema } from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { PathService } from './path.service';

@ApiTags('student-learn-path')
@Controller('student/learn/path')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.learn.use')
export class PathController {
  constructor(private readonly path: PathService) {}

  @Get()
  async get(@CurrentStudent() principal: StudentPrincipal, @Res() res: Response) {
    const path = await this.path.get(principal);
    // Nest's default serializer drops `null` to an empty body; express json(null) is explicit.
    return void res.status(200).json(path);
  }

  @Post()
  create(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.path.create(principal, createPathInputSchema.parse(body));
  }

  @Patch()
  patch(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.path.patch(principal, patchPathInputSchema.parse(body));
  }
}
