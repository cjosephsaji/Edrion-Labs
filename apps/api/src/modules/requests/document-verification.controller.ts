import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/guards/auth.guard';
import { RateLimit } from '../../common/decorators';
import { RequestDocumentService } from './request-document.service';

@ApiTags('document-verification')
@Controller('documents/verify')
@Public()
export class DocumentVerificationController {
  constructor(private readonly documents: RequestDocumentService) {}

  @Get(':code')
  @RateLimit(30, 60)
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  verify(@Param('code') code: string) {
    return this.documents.verify(code);
  }
}
