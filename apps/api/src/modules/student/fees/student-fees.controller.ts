import { Body, Controller, Get, Headers, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { confirmFeeIntentSchema, studentFeeIntentSchema, type ConfirmFeeIntentInput, type StudentFeeIntentInput } from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import { FeeLedgerService } from '../../portal/fee-ledger.service';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { SurfaceGateService } from '../surfaces/surface-gate.service';
import type { Response } from 'express';
import { AttachmentStorageService } from '../../portal/attachment-storage.service';

@ApiTags('student-fees')
@Controller('student/fees')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentFeesController {
  constructor(private readonly ledger: FeeLedgerService, private readonly gate: SurfaceGateService,private readonly storage:AttachmentStorageService) {}

  private async principal(value: StudentPrincipal) {
    requireInstitutional(value);
    await this.gate.assertSurface(value, 'fees');
    return value;
  }

  @Get()
  @RequireStudentPermissions('student.surface.fees.view')
  async home(@CurrentStudent() p: StudentPrincipal) { return this.ledger.studentHome(await this.principal(p)); }

  @Get('history')
  @RequireStudentPermissions('student.surface.fees.view')
  async history(@CurrentStudent() p: StudentPrincipal) { return this.ledger.studentHistory(await this.principal(p)); }

  @Get('receipts/:id/file')
  @RequireStudentPermissions('student.surface.fees.view')
  async receiptFile(@CurrentStudent() p:StudentPrincipal,@Param('id') id:string,@Res() response:Response){const receipt=await this.ledger.studentReceiptFile(await this.principal(p),id);response.setHeader('content-type','application/pdf');response.setHeader('content-disposition',`inline; filename="${receipt.receiptNo.replaceAll('"','')}.pdf"`);this.storage.stream(receipt.pdfStorageRef!).pipe(response);}

  @Post('statement')
  @RequireStudentPermissions('student.surface.fees.view')
  async statement(@CurrentStudent() p:StudentPrincipal){return this.ledger.createStudentStatement(await this.principal(p));}

  @Post('intents')
  @RequireStudentPermissions('student.surface.fees.view')
  async intent(@CurrentStudent() p: StudentPrincipal, @Headers('idempotency-key') key: string | undefined, @Body(zodBody(studentFeeIntentSchema)) body: StudentFeeIntentInput) {
    return this.ledger.createStudentIntent(await this.principal(p), body, key);
  }

  @Get('intents/:id')
  @RequireStudentPermissions('student.surface.fees.view')
  async getIntent(@CurrentStudent() p: StudentPrincipal, @Param('id') id: string) { return this.ledger.getStudentIntent(await this.principal(p), id); }

  @Post('intents/:id/confirm')
  @RequireStudentPermissions('student.surface.fees.view')
  async confirm(@CurrentStudent() p: StudentPrincipal, @Param('id') id: string, @Body(zodBody(confirmFeeIntentSchema)) body:ConfirmFeeIntentInput) { return this.ledger.confirmStudentIntent(await this.principal(p), id, body); }
}
