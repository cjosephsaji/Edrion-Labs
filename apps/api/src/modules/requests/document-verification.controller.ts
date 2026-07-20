import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/guards/auth.guard';
import { SkipRateLimit } from '../../common/decorators';
import { RequestDocumentService } from './request-document.service';

@ApiTags('document-verification')
@Controller('documents/verify')
@Public()
@SkipRateLimit()
export class DocumentVerificationController {
  constructor(private readonly documents: RequestDocumentService) {}

  @Get(':code')
  verify(@Param('code') code: string) {
    return this.documents.verify(code);
  }
}
