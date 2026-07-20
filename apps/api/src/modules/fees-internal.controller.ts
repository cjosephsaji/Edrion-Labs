import { Controller, Get, Headers, Param, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/guards/auth.guard';
import { SkipRateLimit } from '../common/decorators';
import { FeeLedgerService } from './portal/fee-ledger.service';

@ApiTags('internal-fees')
@Controller('internal/fees')
@Public()
@SkipRateLimit()
export class FeesInternalController {
  constructor(private readonly ledger: FeeLedgerService) {}

  @Get('dues-block/:studentId')
  dues(@Param('studentId') studentId: string, @Headers('x-institution-id') institutionId?: string, @Headers('x-internal-key') key?: string) {
    const expected = process.env.INTERNAL_SERVICE_KEY;
    if (!institutionId || (expected && key !== expected)) throw new UnauthorizedException();
    return this.ledger.duesBlock(institutionId, studentId);
  }
}
