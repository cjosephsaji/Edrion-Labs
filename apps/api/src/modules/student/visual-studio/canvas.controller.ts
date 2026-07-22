import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  canvasDeleteBodySchema,
  canvasExtendBodySchema,
  canvasGenerateBodySchema,
  canvasRevisionBodySchema,
  visualCanvasListQuerySchema,
  visualCanvasPatchInputSchema,
  visualExpandInputSchema,
  visualRevisionListQuerySchema,
  visualRevisionRestoreInputSchema,
} from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import {
  CurrentStudent,
  RequireStudentPermissions,
  StudentRateLimit,
} from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { VisualStudioService } from './visual-studio.service';

/** Canonical canvas routes — aliases the existing visual-studio service implementation. */
@ApiTags('student-canvas')
@Controller('student/canvas')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentRateLimitGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.lab.use')
export class CanvasController {
  constructor(private readonly visual: VisualStudioService) {}

  @Post('generate')
  @StudentRateLimit(20, 60)
  @HttpCode(202)
  generate(
    @CurrentStudent() principal: StudentPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const input = canvasGenerateBodySchema.parse(body);
    return this.visual.generateCanvas(principal, input, idempotencyKey);
  }

  @Get()
  @StudentRateLimit(120, 60)
  list(@CurrentStudent() principal: StudentPrincipal, @Query() query: unknown) {
    const parsed = visualCanvasListQuerySchema.parse(query);
    return this.visual.listCanvases(principal, {
      limit: parsed.limit,
      cursor: parsed.cursor,
      source_id: parsed.source_id,
      topic_id: parsed.topic_id,
    });
  }

  @Get(':id')
  @StudentRateLimit(120, 60)
  get(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.visual.getCanvas(principal, id);
  }

  @Get(':id/revisions')
  @StudentRateLimit(120, 60)
  revisions(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const parsed = visualRevisionListQuerySchema.parse(query);
    return this.visual.listRevisions(principal, id, parsed.limit);
  }

  @Post(':id/revisions')
  @StudentRateLimit(60, 60)
  commitRevision(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = canvasRevisionBodySchema.parse(body);
    return this.visual.patchCanvas(principal, id, {
      ...parsed,
      client_mutation_id: parsed.client_mutation_id ?? randomUUID(),
    });
  }

  @Post(':id/extend')
  @StudentRateLimit(20, 60)
  @HttpCode(202)
  extend(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = canvasExtendBodySchema.parse(body);
    const expand = visualExpandInputSchema.parse({
      canvas_id: id,
      node_id: parsed.node_id,
      client_request_id: parsed.client_request_id,
    });
    return this.visual.expand(principal, expand);
  }

  @Delete(':id')
  @StudentRateLimit(30, 60)
  @HttpCode(204)
  async remove(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string, @Body() body: unknown) {
    const parsed = canvasDeleteBodySchema.parse(body);
    await this.visual.deleteCanvas(principal, id, parsed.version);
  }

  @Patch(':id')
  @StudentRateLimit(60, 60)
  patch(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = visualCanvasPatchInputSchema.parse(body);
    return this.visual.patchCanvas(principal, id, input);
  }

  @Post(':id/revisions/:revisionId/restore')
  @StudentRateLimit(30, 60)
  restore(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Body() body: unknown,
  ) {
    const input = visualRevisionRestoreInputSchema.parse(body);
    return this.visual.restoreRevision(principal, id, revisionId, input);
  }
}
