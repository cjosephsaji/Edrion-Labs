import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { StudentStorageService } from './student-storage.service';

function readRawBody(req: Request, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > max) {
        done = true;
        req.destroy();
        reject(new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'File exceeds the size limit.' }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => !done && resolve(Buffer.concat(chunks)));
    req.on('error', (e) => !done && reject(e));
  });
}

@ApiTags('student-storage')
@Controller('student')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentStorageController {
  constructor(private readonly storage: StudentStorageService) {}

  @Post('uploads')
  async upload(
    @CurrentStudent() principal: StudentPrincipal,
    @Query('kind') kind: string,
    @Query('filename') filename: string | undefined,
    @Req() req: Request,
  ) {
    if (!kind) throw new BadRequestException({ code: 'MISSING_KIND', message: 'kind query param is required' });
    const mimeType = (req.headers['content-type'] ?? 'application/octet-stream').split(';')[0]!.trim();
    const max = 50 * 1024 * 1024;
    const buffer = await readRawBody(req, max);
    return this.storage.upload(principal, kind, filename, mimeType, buffer);
  }

  @Get('files/:id')
  async download(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const row = await this.storage.getOwned(principal, id);
    res.setHeader('Content-Type', row.mimeType);
    if (row.filename) res.setHeader('Content-Disposition', `inline; filename="${row.filename}"`);
    this.storage.stream(row.storageKey).pipe(res);
  }
}
