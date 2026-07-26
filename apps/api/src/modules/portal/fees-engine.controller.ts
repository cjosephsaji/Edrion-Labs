import { Body, Controller, Get, Headers, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import type { Response } from 'express';
import {
  feeDecisionSchema,
  createFeeStructureVersionSchema,
  generateFeeInvoicesSchema,
  feeWaiverSchema,
  institutionFeeConfigSchema,
  recordDeskFeePaymentSchema,
  feeBounceSchema,
  feeRefundSchema,
  feeDisputeDecisionSchema,
  type FeeWaiverInput,
  type CreateFeeStructureVersionInput,
  type GenerateFeeInvoicesInput,
  type InstitutionFeeConfigInput,
  type RecordDeskFeePaymentInput,
} from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import type { PortalActionContext } from './portal-action-context';
import { FeeLedgerService } from './fee-ledger.service';
import { AttachmentStorageService } from './attachment-storage.service';

@ApiTags('portal-fees-engine')
@Controller('portal/fees')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class FeesEngineController {
  constructor(private readonly ledger: FeeLedgerService,private readonly storage:AttachmentStorageService) {}

  private ctx(principal: InstitutionPrincipal, scope: InstitutionScope, request: EdrionRequestContext): PortalActionContext {
    return { principal, scope, request };
  }

  @Get('students/:id')
  @RequireInstitutionPermissions('fees.view')
  student(@Param('id') id: string, @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.ledger.studentDetail(this.ctx(p, s, r), id);
  }

  @Get('students')
  @RequireInstitutionPermissions('fees.view')
  searchStudents(@Query('q') q:string|undefined,@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext){return this.ledger.searchStudents(this.ctx(p,s,r),q??'');}

  @Get('structures/:id/versions')
  @RequireInstitutionPermissions('fees.view')
  versions(@Param('id') id:string,@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext){return this.ledger.structureVersions(this.ctx(p,s,r),id);}

  @Post('structures/:id/versions')
  @RequireInstitutionPermissions('fees.manage')
  version(@Param('id') id: string, @Body(zodBody(createFeeStructureVersionSchema)) body: CreateFeeStructureVersionInput, @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.ledger.createStructureVersion(this.ctx(p, s, r), id, body);
  }

  @Post('structures/:id/activate')
  @RequireInstitutionPermissions('fees.manage')
  activate(@Param('id') id: string, @Body(zodBody(feeDecisionSchema)) body: { version: number }, @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.ledger.activateStructure(this.ctx(p, s, r), id, body.version);
  }

  @Post('structures/:id/generate')
  @RequireInstitutionPermissions('fees.manage')
  generate(@Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body(zodBody(generateFeeInvoicesSchema)) body: GenerateFeeInvoicesInput, @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.ledger.generateInvoices(this.ctx(p, s, r), id, body, key);
  }

  @Get('generation-batches/:id')
  @RequireInstitutionPermissions('fees.view')
  generationProgress(@Param('id') id:string,@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext){return this.ledger.generationProgress(this.ctx(p,s,r),id);}

  @Get('generation-batches/:id/report.csv')
  @RequireInstitutionPermissions('fees.view')
  async generationReport(@Param('id') id:string,@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext,@Res() response:Response){const body=await this.ledger.generationCsv(this.ctx(p,s,r),id);response.setHeader('content-type','text/csv; charset=utf-8');response.setHeader('content-disposition',`attachment; filename="fee-generation-${id}.csv"`);response.send(body);}

  @Post('payments')
  @RequireInstitutionPermissions('fees.manage')
  payment(@Headers('idempotency-key') key: string | undefined, @Body(zodBody(recordDeskFeePaymentSchema)) body: RecordDeskFeePaymentInput, @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.ledger.recordDeskPayment(this.ctx(p, s, r), body, key);
  }

  @Post('waivers')
  @RequireInstitutionPermissions('fees.manage')
  waiver(@Body(zodBody(feeWaiverSchema)) body: FeeWaiverInput, @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.ledger.createWaiver(this.ctx(p, s, r), body);
  }

  @Post('payments/:id/clear')
  @RequireInstitutionPermissions('fees.manage')
  clear(@Param('id') id:string,@Body(zodBody(feeDecisionSchema)) body:{version:number},@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext){return this.ledger.clearPayment(this.ctx(p,s,r),id,body.version);}

  @Post('payments/:id/bounce')
  @RequireInstitutionPermissions('fees.manage')
  bounce(@Param('id') id:string,@Body(zodBody(feeBounceSchema)) body:{reason:string;add_bounce_fee:boolean},@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext){return this.ledger.bouncePayment(this.ctx(p,s,r),id,body.reason,body.add_bounce_fee);}

  @Post('receipts/:id/refund')
  @RequireInstitutionPermissions('fees.manage')
  refund(@Param('id') id:string,@Headers('idempotency-key') key:string|undefined,@Body(zodBody(feeRefundSchema)) body:{amount_minor:number;reason:string},@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext){return this.ledger.refundReceipt(this.ctx(p,s,r),id,body.amount_minor,body.reason,key);}

  @Get('receipts/:id/file')
  @RequireInstitutionPermissions('fees.view')
  async receiptFile(@Param('id') id:string,@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext,@Res() response:Response){const receipt=await this.ledger.institutionReceiptFile(this.ctx(p,s,r),id);response.setHeader('content-type','application/pdf');response.setHeader('content-disposition',`inline; filename="${receipt.receiptNo.replaceAll('"','')}.pdf"`);this.storage.stream(receipt.pdfStorageRef!).pipe(response);}

  @Post('receipts/:id/refund/approve')
  @RequireInstitutionPermissions('fees.manage')
  approveRefund(@Param('id') id:string,@Body(zodBody(feeDecisionSchema)) body:{version:number;note?:string},@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext){return this.ledger.approveRefund(this.ctx(p,s,r),id,body.version,true,body.note);}

  @Post('receipts/:id/refund/reject')
  @RequireInstitutionPermissions('fees.manage')
  rejectRefund(@Param('id') id:string,@Body(zodBody(feeDecisionSchema)) body:{version:number;note?:string},@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext){return this.ledger.approveRefund(this.ctx(p,s,r),id,body.version,false,body.note);}

  @Get('reconciliation')
  @RequireInstitutionPermissions('fees.view')
  reconciliation(@Query('date') date:string|undefined,@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext){return this.ledger.reconciliation(this.ctx(p,s,r),date);}

  @Get('reconciliation/export')
  @RequireInstitutionPermissions('fees.view')
  async exportReconciliation(@Query('format') format:string|undefined,@Query('date') date:string|undefined,@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext,@Res() response:Response){const selected=['csv','tally','quickbooks'].includes(format??'')?format!:'csv';const body=await this.ledger.reconciliationExport(this.ctx(p,s,r),selected,date);response.setHeader('content-type',selected==='tally'?'application/xml; charset=utf-8':'text/csv; charset=utf-8');response.setHeader('content-disposition',`attachment; filename="fees-${date??'today'}-${selected}.${selected==='tally'?'xml':'csv'}"`);response.send(body);}

  @Post('reconciliation/reminders')
  @RequireInstitutionPermissions('fees.manage')
  reminders(@Body() body:{student_ids?:string[]},@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext){return this.ledger.sendManualReminders(this.ctx(p,s,r),body.student_ids??[]);}

  @Post('reconciliation/unmatched/:id/match')
  @RequireInstitutionPermissions('fees.manage')
  matchGateway(@Param('id') id:string,@Headers('idempotency-key') key:string|undefined,@Body(zodBody(recordDeskFeePaymentSchema)) body:RecordDeskFeePaymentInput,@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext){return this.ledger.matchGatewayEvent(this.ctx(p,s,r),id,body,key);}

  @Post('reconciliation/receipt-renders/:id/retry')
  @RequireInstitutionPermissions('fees.manage')
  retryReceiptRender(@Param('id') id:string,@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext){return this.ledger.retryReceiptRender(this.ctx(p,s,r),id);}

  @Post('disputes/:id/resolve')
  @RequireInstitutionPermissions('fees.manage')
  resolveDispute(@Param('id') id:string,@Body(zodBody(feeDisputeDecisionSchema)) body:{outcome:'captured'|'reversed';note:string},@CurrentInstitutionPrincipal() p:InstitutionPrincipal,@CurrentScope() s:InstitutionScope,@ReqContext() r:EdrionRequestContext){return this.ledger.resolveDispute(this.ctx(p,s,r),id,body.outcome,body.note);}

  @Post('waivers/:id/approve')
  @RequireInstitutionPermissions('fees.manage')
  approveWaiver(@Param('id') id: string, @Body(zodBody(feeDecisionSchema)) body: { version: number }, @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.ledger.decideWaiver(this.ctx(p, s, r), id, body.version, true);
  }

  @Post('waivers/:id/reject')
  @RequireInstitutionPermissions('fees.manage')
  rejectWaiver(@Param('id') id: string, @Body(zodBody(feeDecisionSchema)) body: { version: number }, @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.ledger.decideWaiver(this.ctx(p, s, r), id, body.version, false);
  }

  @Get('config')
  @RequireInstitutionPermissions('fees.view')
  config(@CurrentInstitutionPrincipal() p: InstitutionPrincipal) { return this.ledger.getFeeConfig(p.institutionId); }

  @Put('config')
  @RequireInstitutionPermissions('fees.manage')
  updateConfig(@Body(zodBody(institutionFeeConfigSchema)) body: InstitutionFeeConfigInput, @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.ledger.updateFeeConfig(this.ctx(p, s, r), body);
  }
}
