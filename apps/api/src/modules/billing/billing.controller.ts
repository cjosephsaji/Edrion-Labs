import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  createDiscountSchema,
  createInvoiceSchema,
  createRefundSchema,
  dunningSchema,
  finalizeInvoiceSchema,
  issueCreditSchema,
  listCreditsQuerySchema,
  listDiscountsQuerySchema,
  listInvoicesQuerySchema,
  listPaymentsQuerySchema,
  recordPaymentSchema,
  recordUsageSchema,
  retryPaymentSchema,
  voidInvoiceSchema,
  type CreateDiscountInput,
  type CreateInvoiceInput,
  type CreateRefundInput,
  type DunningInput,
  type FinalizeInvoiceInput,
  type IssueCreditInput,
  type ListCreditsQuery,
  type ListDiscountsQuery,
  type ListInvoicesQuery,
  type ListPaymentsQuery,
  type RecordPaymentInput,
  type RecordUsageInput,
  type RetryPaymentInput,
  type VoidInvoiceInput,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { BillingService } from './billing.service';

const summaryQuerySchema = z.object({ institutionId: z.string().uuid() });

/** Financial mutations require an Idempotency-Key header for replay protection. */
function requireIdemKey(key?: string): string {
  if (!key || key.trim().length < 8) {
    throw new BadRequestException({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Provide an Idempotency-Key header (≥8 chars) for this financial action.',
    });
  }
  return key.trim();
}

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  // --- Invoices ---------------------------------------------------------------

  @Get('invoices')
  @RequirePermissions('billing.view')
  async listInvoices(@Query(zodBody(listInvoicesQuerySchema)) query: ListInvoicesQuery) {
    const { items, total } = await this.service.listInvoices(query);
    return { items, total, page: query.page, pageSize: query.pageSize, hasMore: query.page * query.pageSize < total };
  }

  @Get('invoices/:id')
  @RequirePermissions('billing.view')
  getInvoice(@Param('id') id: string) {
    return this.service.getInvoice(id);
  }

  @Post('invoices')
  @RequirePermissions('billing.manage')
  createInvoice(
    @Body(zodBody(createInvoiceSchema)) body: CreateInvoiceInput,
    @Headers('idempotency-key') idemKey: string,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.createInvoice(body, requireIdemKey(idemKey), this.ctx(pc, request));
  }

  @Post('invoices/:id/finalize')
  @RequirePermissions('billing.manage')
  finalizeInvoice(
    @Param('id') id: string,
    @Body(zodBody(finalizeInvoiceSchema)) body: FinalizeInvoiceInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.finalizeInvoice(id, body, this.ctx(pc, request));
  }

  @Post('invoices/:id/void')
  @RequirePermissions('billing.void_invoice')
  voidInvoice(
    @Param('id') id: string,
    @Body(zodBody(voidInvoiceSchema)) body: VoidInvoiceInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.voidInvoice(id, body, this.ctx(pc, request));
  }

  @Post('invoices/:id/dunning')
  @RequirePermissions('billing.manage')
  dunning(
    @Param('id') id: string,
    @Body(zodBody(dunningSchema)) body: DunningInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.advanceDunning(id, body, this.ctx(pc, request));
  }

  // --- Payments ---------------------------------------------------------------

  @Get('payments')
  @RequirePermissions('billing.view')
  async listPayments(@Query(zodBody(listPaymentsQuerySchema)) query: ListPaymentsQuery) {
    const { items, total } = await this.service.listPayments(query);
    return { items, total, page: query.page, pageSize: query.pageSize, hasMore: query.page * query.pageSize < total };
  }

  @Post('payments')
  @RequirePermissions('billing.manage')
  recordPayment(
    @Body(zodBody(recordPaymentSchema)) body: RecordPaymentInput,
    @Headers('idempotency-key') idemKey: string,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.recordPayment(body, requireIdemKey(idemKey), this.ctx(pc, request));
  }

  @Post('payments/:id/retry')
  @RequirePermissions('billing.manage')
  retryPayment(
    @Param('id') id: string,
    @Body(zodBody(retryPaymentSchema)) body: RetryPaymentInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.retryPayment(id, body, this.ctx(pc, request));
  }

  // --- Refunds ----------------------------------------------------------------

  @Post('refunds')
  @RequirePermissions('billing.refund')
  createRefund(
    @Body(zodBody(createRefundSchema)) body: CreateRefundInput,
    @Headers('idempotency-key') idemKey: string,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.createRefund(body, requireIdemKey(idemKey), this.ctx(pc, request));
  }

  // --- Credits ----------------------------------------------------------------

  @Get('credits')
  @RequirePermissions('billing.view')
  async listCredits(@Query(zodBody(listCreditsQuerySchema)) query: ListCreditsQuery) {
    const { items, total } = await this.service.listCredits(query);
    return { items, total, page: query.page, pageSize: query.pageSize, hasMore: query.page * query.pageSize < total };
  }

  @Post('credits')
  @RequirePermissions('billing.manage')
  issueCredit(
    @Body(zodBody(issueCreditSchema)) body: IssueCreditInput,
    @Headers('idempotency-key') idemKey: string,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.issueCredit(body, requireIdemKey(idemKey), this.ctx(pc, request));
  }

  // --- Discounts --------------------------------------------------------------

  @Get('discounts')
  @RequirePermissions('billing.view')
  async listDiscounts(@Query(zodBody(listDiscountsQuerySchema)) query: ListDiscountsQuery) {
    const { items, total } = await this.service.listDiscounts(query);
    return { items, total, page: query.page, pageSize: query.pageSize, hasMore: query.page * query.pageSize < total };
  }

  @Post('discounts')
  @RequirePermissions('billing.manage')
  createDiscount(
    @Body(zodBody(createDiscountSchema)) body: CreateDiscountInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.createDiscount(body, this.ctx(pc, request));
  }

  // --- Usage + summary --------------------------------------------------------

  @Post('usage')
  @RequirePermissions('billing.manage')
  recordUsage(
    @Body(zodBody(recordUsageSchema)) body: RecordUsageInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.recordUsage(body, this.ctx(pc, request));
  }

  @Get('summary')
  @RequirePermissions('billing.view')
  summary(@Query(zodBody(summaryQuerySchema)) query: { institutionId: string }) {
    return this.service.summary(query.institutionId);
  }
}
