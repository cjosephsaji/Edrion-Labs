import { Body, Controller, Get, Headers, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  confirmFeeIntentSchema,
  studentFeeIntentSchema,
  type ConfirmFeeIntentInput,
  type StudentFeeIntentInput,
} from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import { FeeLedgerService } from '../../portal/fee-ledger.service';
import { AttachmentStorageService } from '../../portal/attachment-storage.service';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional, SurfaceGateService } from '../surfaces/surface-gate.service';

@ApiTags('student-fees')
@Controller('student/fees')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard)
@RequireStudentPermissions('student.surface.fees.view')
export class StudentFeesController {
  constructor(
    private readonly ledger: FeeLedgerService,
    private readonly gate: SurfaceGateService,
    private readonly storage: AttachmentStorageService,
  ) {}

  private async principal(value: StudentPrincipal) {
    requireInstitutional(value);
    await this.gate.assertSurface(value, 'fees');
    return value;
  }

  @Get()
  async list(@CurrentStudent() p: StudentPrincipal) {
    const principal = await this.principal(p);
    const home = await this.ledger.studentHome(principal);
    return {
      items: home.invoices.map((inv) => ({
        id: inv.id,
        label: inv.invoiceNo,
        amount: inv.balanceMinor / 100,
        amountMinor: inv.balanceMinor,
        dueDate: inv.dueDate,
        status: inv.status,
        currency: home.currency,
      })),
      balanceMinor: home.balanceMinor,
      currency: home.currency,
    };
  }

  @Get('history')
  async history(@CurrentStudent() p: StudentPrincipal) {
    return this.ledger.studentHistory(await this.principal(p));
  }

  @Get('receipts/:id/file')
  async receiptFile(
    @CurrentStudent() p: StudentPrincipal,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const receipt = await this.ledger.studentReceiptFile(await this.principal(p), id);
    response.setHeader('content-type', 'application/pdf');
    response.setHeader(
      'content-disposition',
      `inline; filename="${receipt.receiptNo.replaceAll('"', '')}.pdf"`,
    );
    this.storage.stream(receipt.pdfStorageRef!).pipe(response);
  }

  @Post('statement')
  async statement(@CurrentStudent() p: StudentPrincipal) {
    return this.ledger.createStudentStatement(await this.principal(p));
  }

  @Post('intents')
  async intent(
    @CurrentStudent() p: StudentPrincipal,
    @Headers('idempotency-key') key: string | undefined,
    @Body(zodBody(studentFeeIntentSchema)) body: StudentFeeIntentInput,
  ) {
    return this.ledger.createStudentIntent(await this.principal(p), body, key);
  }

  @Get('intents/:id')
  async getIntent(@CurrentStudent() p: StudentPrincipal, @Param('id') id: string) {
    return this.ledger.getStudentIntent(await this.principal(p), id);
  }

  @Post('intents/:id/confirm')
  async confirm(
    @CurrentStudent() p: StudentPrincipal,
    @Param('id') id: string,
    @Body(zodBody(confirmFeeIntentSchema)) body: ConfirmFeeIntentInput,
  ) {
    return this.ledger.confirmStudentIntent(await this.principal(p), id, body);
  }

  @Post('intents/:id/complete-mock')
  async completeMock(@CurrentStudent() p: StudentPrincipal, @Param('id') id: string) {
    return this.ledger.completeMockStudentIntent(await this.principal(p), id);
  }
}
