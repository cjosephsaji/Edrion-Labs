import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  ilike,
  or,
  schema,
  sql,
  type Database,
} from '@edrion/database';
import type { AuditEventInput, AuditWriter } from '@edrion/audit';
import type {
  FeeWaiverInput,
  CreateFeeStructureVersionInput,
  GenerateFeeInvoicesInput,
  InstitutionFeeConfigInput,
  RecordDeskFeePaymentInput,
  StudentFeeIntentInput,
  ConfirmFeeIntentInput,
} from '@edrion/schemas';
import { prorateMinorByDays } from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { IdempotencyService } from '../../common/idempotency.service';
import { JobsService } from '../../common/queue/jobs.service';
import type { InstitutionalStudentPrincipal } from '../student/student.types';
import { PaymentProviderRegistry } from '../parent-portal/payment-provider.registry';
import type { PortalActionContext } from './portal-action-context';
import { basePortalAudit } from './portal-action-context';
import { allocateOldestDue, formatReceiptNo } from './fee-ledger.helpers';
import { RENDER_JOB } from '../documents/documents-gen.service';
import { TodayNotifyService } from '../student/today/today-notify.service';
import { REQUEST_NOTIFY_JOB } from '../requests/request-notify.service';

export const FEE_RECEIPT_RENDER_JOB = 'fees.receipt_render';
export const FEE_GATEWAY_EVENT_JOB = 'fees.gateway_event.process';
export const FEE_DEMAND_GENERATION_JOB = 'fees.demand_generation.chunk';

export type FeeDemandGenerationJobData = {
  institutionId:string;institutionUserId:string;structureId:string;versionNo:number;
  installmentSeqs:number[];studentIds:string[];batchId:string;
};

type Actor = { institutionId: string; institutionUserId: string; studentId: string };

/**
 * One ledger for desk, guardian and student payments. All allocation and receipt numbering happens
 * under a per-student advisory lock, so retries and concurrent channels cannot over-allocate.
 */
@Injectable()
export class FeeLedgerService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly idempotency: IdempotencyService,
    private readonly jobs: JobsService,
    private readonly providers: PaymentProviderRegistry,
    private readonly todayNotify: TodayNotifyService,
  ) {}

  async studentHome(principal: InstitutionalStudentPrincipal) {
    const invoice = schema.feeInvoices;
    const rows = await this.db
      .select()
      .from(invoice)
      .where(and(eq(invoice.institutionId, principal.institutionId), eq(invoice.studentId, principal.studentId)))
      .orderBy(asc(invoice.dueDate), asc(invoice.createdAt));
    const ids = rows.map((row) => row.id);
    const items = ids.length
      ? await this.db.select().from(schema.feeInvoiceItems).where(inArray(schema.feeInvoiceItems.invoiceId, ids))
      : [];
    const structureIds=[...new Set(rows.map(row=>row.feeStructureId).filter((id):id is string=>Boolean(id)))];
    const structureVersions=structureIds.length?await this.db.select().from(schema.feeStructureVersions).where(inArray(schema.feeStructureVersions.structureId,structureIds)):[];
    const config = await this.getConfig(principal.institutionId);
    const open = rows.filter((row) => row.status !== 'cancelled' && row.amount - row.amountPaid > 0);
    const balanceMinor = open.reduce((sum, row) => sum + row.amount - row.amountPaid, 0);
    const overdueMinor = open
      .filter((row) => row.dueDate && row.dueDate < this.today())
      .reduce((sum, row) => sum + row.amount - row.amountPaid, 0);
    return {
      currency: await this.currency(principal.institutionId),
      balanceMinor,
      overdueMinor,
      duesBlocked: this.evaluateDues(config.duesBlock, overdueMinor),
      partialPaymentAllowed: config.partialPaymentAllowed,
      nextDueDate: open.find((row) => row.dueDate)?.dueDate ?? null,
      invoices: rows.map((row) => ({
        ...row,
        balanceMinor: Math.max(0, row.amount - row.amountPaid),
        items: items.filter((item) => item.invoiceId === row.id),
        lateFeeProjection:this.lateFeeProjection(row,structureVersions.find(version=>version.structureId===row.feeStructureId&&version.versionNo===(row.structureVersionNo??1))?.lateFeePolicy as Record<string,unknown>|null),
      })),
    };
  }

  async studentHistory(principal: InstitutionalStudentPrincipal) {
    const receipts = await this.db
      .select()
      .from(schema.feeReceipts)
      .where(and(eq(schema.feeReceipts.institutionId, principal.institutionId), eq(schema.feeReceipts.studentId, principal.studentId)))
      .orderBy(desc(schema.feeReceipts.issuedAt));
    const home = await this.studentHome(principal);
    return { currency: home.currency, balanceMinor: home.balanceMinor, receipts };
  }

  async studentReceiptFile(principal:InstitutionalStudentPrincipal,receiptId:string){const[receipt]=await this.db.select().from(schema.feeReceipts).where(and(eq(schema.feeReceipts.id,receiptId),eq(schema.feeReceipts.institutionId,principal.institutionId),eq(schema.feeReceipts.studentId,principal.studentId))).limit(1);if(!receipt?.pdfStorageRef)throw new NotFoundException({code:'RECEIPT_FILE_NOT_READY',message:'This receipt file is not ready yet.'});return receipt;}
  async institutionReceiptFile(ctx:PortalActionContext,receiptId:string){const[receipt]=await this.db.select().from(schema.feeReceipts).where(and(eq(schema.feeReceipts.id,receiptId),eq(schema.feeReceipts.institutionId,ctx.principal.institutionId))).limit(1);if(!receipt?.pdfStorageRef)throw new NotFoundException({code:'RECEIPT_FILE_NOT_READY',message:'This receipt file is not ready yet.'});return receipt;}

  async createStudentStatement(principal:InstitutionalStudentPrincipal){const [existing]=await this.db.select().from(schema.documentRenders).where(and(eq(schema.documentRenders.institutionId,principal.institutionId),eq(schema.documentRenders.docType,'fee_statement'),sql`${schema.documentRenders.payload}->>'fee_statement_student_id'=${principal.studentId}`,inArray(schema.documentRenders.status,['queued','rendering']))).orderBy(desc(schema.documentRenders.createdAt)).limit(1);if(existing)return{renderId:existing.id,status:existing.status};const [home,history]=await Promise.all([this.studentHome(principal),this.studentHistory(principal)]);const [render]=await this.db.insert(schema.documentRenders).values({institutionId:principal.institutionId,docType:'fee_statement',requestedBy:principal.institutionUserId,title:'Fee statement',payload:{fee_statement_student_id:principal.studentId,student:{name:principal.fullName},invoices:home.invoices.map(i=>({number:i.invoiceNo,amount_minor:i.amount,paid_minor:i.amountPaid,balance_minor:i.balanceMinor,status:i.status})),receipts:history.receipts,closing_balance_minor:home.balanceMinor}}).returning();await this.jobs.enqueue('reports',RENDER_JOB,{renderId:render!.id},{jobId:`fee-statement-${render!.id}`,attempts:3});return{renderId:render!.id,status:'queued'};}

  async createStudentIntent(principal: InstitutionalStudentPrincipal, input: StudentFeeIntentInput, key?: string) {
    if (!key) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key is required.' });
    const existing = await this.db
      .select()
      .from(schema.parentPaymentIntents)
      .where(and(eq(schema.parentPaymentIntents.institutionId, principal.institutionId), eq(schema.parentPaymentIntents.idempotencyKey, key)))
      .limit(1);
    if (existing[0]) return this.intentResponse(existing[0], true);

    const invoices = await this.db
      .select()
      .from(schema.feeInvoices)
      .where(and(
        eq(schema.feeInvoices.institutionId, principal.institutionId),
        eq(schema.feeInvoices.studentId, principal.studentId),
        inArray(schema.feeInvoices.id, input.invoice_ids),
      ));
    if (invoices.length !== new Set(input.invoice_ids).size) throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'One or more invoices were not found.' });
    const allOpen=await this.db.select().from(schema.feeInvoices).where(and(eq(schema.feeInvoices.institutionId,principal.institutionId),eq(schema.feeInvoices.studentId,principal.studentId),sql`${schema.feeInvoices.status}<>'cancelled'`,sql`${schema.feeInvoices.amount}>${schema.feeInvoices.amountPaid}`)).orderBy(asc(schema.feeInvoices.dueDate),asc(schema.feeInvoices.createdAt));
    const oldest=allOpen[0];if(oldest&&!input.invoice_ids.includes(oldest.id))throw new BadRequestException({code:'OLDEST_INVOICE_REQUIRED',message:'The oldest outstanding invoice must be included.'});
    const config=await this.getConfig(principal.institutionId);const totalBalance=allOpen.reduce((sum,row)=>sum+row.amount-row.amountPaid,0);if(!config.partialPaymentAllowed&&(input.amount_minor!==totalBalance||input.invoice_ids.length!==allOpen.length))throw new BadRequestException({code:'PARTIAL_PAYMENT_DISABLED',message:'Partial payments are disabled by policy.'});if(config.partialPaymentAllowed&&oldest&&input.amount_minor<oldest.amount-oldest.amountPaid)throw new BadRequestException({code:'OLDEST_BALANCE_REQUIRED',message:'The payment must cover the oldest invoice balance.'});
    const available = invoices.reduce((sum, row) => sum + Math.max(0, row.amount - row.amountPaid), 0);
    if (input.amount_minor > available) throw new BadRequestException({ code: 'AMOUNT_EXCEEDS_BALANCE', message: 'Amount exceeds the selected balance.' });
    const provider = this.providers.configured();
    const id = randomUUID();
    const created = await provider.createIntent({
      intentId: id,
      amountMinor: input.amount_minor,
      currency: await this.currency(principal.institutionId),
      invoiceNo: invoices.map((row) => row.invoiceNo).join(',').slice(0, 80),
    });
    const [row] = await this.db.insert(schema.parentPaymentIntents).values({
      id,
      institutionId: principal.institutionId,
      feeInvoiceId: invoices[0]!.id,
      guardianUserId: null,
      ownerKind: 'student',
      studentUserId: principal.institutionUserId,
      invoiceIds: input.invoice_ids,
      amount: input.amount_minor,
      currency: await this.currency(principal.institutionId),
      provider: provider.key,
      providerRef: created.providerRef,
      status: created.status === 'created' ? 'initiated' : 'pending',
      idempotencyKey: key,
    }).returning();
    return this.intentResponse(row!, false);
  }

  async getStudentIntent(principal: InstitutionalStudentPrincipal, id: string) {
    const [row] = await this.db.select().from(schema.parentPaymentIntents).where(and(
      eq(schema.parentPaymentIntents.id, id),
      eq(schema.parentPaymentIntents.institutionId, principal.institutionId),
      eq(schema.parentPaymentIntents.studentUserId, principal.institutionUserId),
    )).limit(1);
    if (!row) throw new NotFoundException({ code: 'INTENT_NOT_FOUND', message: 'Payment intent not found.' });
    return this.intentResponse(row, false);
  }

  async confirmStudentIntent(principal: InstitutionalStudentPrincipal, id: string, input: ConfirmFeeIntentInput) {
    const [intent]=await this.db.select().from(schema.parentPaymentIntents).where(and(eq(schema.parentPaymentIntents.id,id),eq(schema.parentPaymentIntents.institutionId,principal.institutionId),eq(schema.parentPaymentIntents.studentUserId,principal.institutionUserId))).limit(1);
    if(!intent)throw new NotFoundException({code:'INTENT_NOT_FOUND',message:'Payment intent not found.'});
    if(intent.status==='settled')return this.intentResponse(intent,true);
    const provider=this.providers.byKey(intent.provider);
    if(!intent.providerRef||!provider?.verifyClientConfirmation?.({providerRef:intent.providerRef,paymentId:input.payment_id,signature:input.signature}))throw new UnauthorizedException({code:'BAD_PAYMENT_SIGNATURE',message:'Payment confirmation could not be verified.'});
    const result=await this.settleVerifiedIntent(intent,input.payment_id);
    return{...this.intentResponse({...intent,status:'settled'},false),receipt:result.receipt};
  }

  /** Dev/mock checkout completion — never available for live providers. */
  async completeMockStudentIntent(principal: InstitutionalStudentPrincipal, id: string) {
    const [intent] = await this.db
      .select()
      .from(schema.parentPaymentIntents)
      .where(
        and(
          eq(schema.parentPaymentIntents.id, id),
          eq(schema.parentPaymentIntents.institutionId, principal.institutionId),
          eq(schema.parentPaymentIntents.studentUserId, principal.institutionUserId),
        ),
      )
      .limit(1);
    if (!intent) throw new NotFoundException({ code: 'INTENT_NOT_FOUND', message: 'Payment intent not found.' });
    if (intent.provider !== 'mock') {
      throw new BadRequestException({
        code: 'MOCK_CHECKOUT_UNAVAILABLE',
        message: 'Mock checkout is only available for the mock payment provider.',
      });
    }
    if (intent.status === 'settled') return { ...this.intentResponse(intent, true), receipt: null };
    const paymentId = `mock_pay_${randomUUID()}`;
    const result = await this.settleVerifiedIntent(intent, paymentId);
    return { ...this.intentResponse({ ...intent, status: 'settled' }, false), receipt: result.receipt };
  }

  async recordDeskPayment(ctx: PortalActionContext, input: RecordDeskFeePaymentInput, key?: string) {
    if (!key) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key is required.' });
    const replay = await this.idempotency.run(key, 'fee_desk_payment', () => this.allocateAndReceipt({
      institutionId: ctx.principal.institutionId,
      institutionUserId: ctx.principal.institutionUserId,
      studentId: input.student_id,
    }, {
      amountMinor: input.amount_minor,
      method: input.method,
      reference: input.reference,
      instrument: input.instrument,
      invoiceIds: input.invoice_ids,
      channel: 'desk',
      paymentState: input.method === 'cheque' || input.method === 'dd' ? 'pending_clearance' : 'captured',
    }));
    await this.write(ctx, 'fee.payment.record', 'fee_receipt', replay.result.receipt.id, { replayed: replay.replayed });
    return { ...replay.result, replayed: replay.replayed };
  }

  async settleProviderEvent(args: {
    provider: string; providerEventId: string; eventType: string; providerRef: string;
    amountMinor?: number; status: string; payload: Record<string, unknown>; rawBody: string; signature: string;
  }, defer=true) {
    const provider = this.providers.byKey(args.provider);
    const valid = Boolean(provider?.verifyWebhook(args.rawBody, args.signature));
    if (!valid) {
      const [candidate] = await this.db.select({ institutionId: schema.parentPaymentIntents.institutionId }).from(schema.parentPaymentIntents).where(and(eq(schema.parentPaymentIntents.provider,args.provider),eq(schema.parentPaymentIntents.providerRef,args.providerRef))).limit(1);
      await this.logGateway(args, candidate?.institutionId ?? null, false, 'invalid_signature');
      throw new UnauthorizedException({ code: 'BAD_SIGNATURE', message: 'Webhook signature verification failed.' });
    }
    const duplicate = await this.db.select({ id: schema.feeGatewayEvents.id }).from(schema.feeGatewayEvents)
      .where(and(eq(schema.feeGatewayEvents.gateway, args.provider), eq(schema.feeGatewayEvents.providerEventId, args.providerEventId))).limit(1);
    if (duplicate[0]) return { ok: true, duplicate: true };
    if(defer&&this.jobs.enabled){await this.jobs.enqueue('billing-sync',FEE_GATEWAY_EVENT_JOB,args,{jobId:`fee-gateway:${args.provider}:${args.providerEventId}`,attempts:5});return{ok:true,accepted:true};}
    const [intent] = await this.db.select().from(schema.parentPaymentIntents)
      .where(and(eq(schema.parentPaymentIntents.provider, args.provider), eq(schema.parentPaymentIntents.providerRef, args.providerRef))).limit(1);
    if (!intent) {
      await this.logGateway(args, null, true, 'unmatched');
      return { ok: true, unmatched: true };
    }
    const isRefund = args.eventType.toLowerCase().includes('refund') || args.status === 'refunded';
    if (isRefund) {
      if (intent.status !== 'settled' || !intent.settledPaymentId) {
        await this.logGateway(args, intent.institutionId, true, 'unmatched');
        return { ok: true, unmatched: true };
      }
      const reference = `gateway_refund:${args.provider}:${args.providerEventId}`;
      const [alreadyPosted] = await this.db.select({ id: schema.feePayments.id }).from(schema.feePayments).where(eq(schema.feePayments.reference, reference)).limit(1);
      if (alreadyPosted) {
        await this.logGateway(args, intent.institutionId, true, 'duplicate');
        return { ok: true, duplicate: true };
      }
      const [paid] = await this.db.select({ receipt: schema.feeReceipts }).from(schema.feePayments)
        .innerJoin(schema.feeReceipts, eq(schema.feeReceipts.id, schema.feePayments.receiptId))
        .where(eq(schema.feePayments.id, intent.settledPaymentId)).limit(1);
      if (!paid?.receipt) {
        await this.logGateway(args, intent.institutionId, true, 'unmatched');
        return { ok: true, unmatched: true };
      }
      const amountMinor = Math.abs(args.amountMinor ?? intent.amount);
      const result = await this.postRefund(paid.receipt, amountMinor, 'Refund confirmed by payment provider', paid.receipt.issuedBy, reference);
      await this.notifyRefund(paid.receipt, amountMinor, args.providerEventId);
      await this.logGateway(args, intent.institutionId, true, 'applied');
      return { ok: true, refunded: true, ...result };
    }
    if (args.amountMinor !== undefined && args.amountMinor !== intent.amount) {
      await this.logGateway(args, intent.institutionId, true, 'amount_mismatch');
      return { ok: true, amountMismatch: true };
    }
    if (args.status === 'debited_unconfirmed') {
      const dispute = await this.ensurePaymentDispute(intent);
      await this.logGateway(args, intent.institutionId, true, 'applied');
      return { ok:true, settled:false, status:'debited_unconfirmed', dispute };
    }
    if (!['succeeded', 'settled', 'captured'].includes(args.status)) {
      const status = args.status === 'failed' ? 'failed' : 'pending';
      await this.db.update(schema.parentPaymentIntents).set({ status }).where(eq(schema.parentPaymentIntents.id, intent.id));
      await this.logGateway(args, intent.institutionId, true, 'applied');
      return { ok: true, settled: false, status };
    }
    if (intent.status === 'settled' || intent.status === 'succeeded') {
      await this.logGateway(args, intent.institutionId, true, 'duplicate');
      return { ok: true, duplicate: true, paymentId: intent.settledPaymentId };
    }
    const result = await this.settleVerifiedIntent(intent,args.providerRef);
    await this.logGateway(args, intent.institutionId, true, 'applied');
    return { ok: true, settled: true, receipt: result.receipt, paymentIds: result.paymentIds };
  }

  async studentDetail(ctx: PortalActionContext, studentId: string) {
    const principal={kind:'institutional' as const,institutionId:ctx.principal.institutionId,campusId:null,institutionUserId:ctx.principal.institutionUserId,studentId,email:'',fullName:'',lastAuthAt:null,permissions:[]};
    const[home,history]=await Promise.all([this.studentHome(principal),this.studentHistory(principal)]);
    return{...home,receipts:history.receipts.slice(0,10)};
  }

  async searchStudents(ctx:PortalActionContext,q:string){const term=q.trim();if(term.length<2)return[];return this.db.select({id:schema.students.id,firstName:schema.students.firstName,lastName:schema.students.lastName,admissionNo:schema.students.admissionNo,campusId:schema.students.campusId}).from(schema.students).where(and(eq(schema.students.institutionId,ctx.principal.institutionId),or(ilike(schema.students.firstName,`%${term}%`),ilike(schema.students.lastName,`%${term}%`),ilike(schema.students.admissionNo,`%${term}%`),sql`exists (select 1 from fee_receipts r where r.student_id=${schema.students.id} and r.receipt_no ilike ${`%${term}%`})`))).limit(20);}

  async structureVersions(ctx: PortalActionContext, structureId: string) {
    const [structure] = await this.db.select().from(schema.feeStructures).where(and(
      eq(schema.feeStructures.id, structureId),
      eq(schema.feeStructures.institutionId, ctx.principal.institutionId),
    )).limit(1);
    if (!structure) throw new NotFoundException({ code:'STRUCTURE_NOT_FOUND', message:'Fee structure not found.' });
    const versions = await this.db.select().from(schema.feeStructureVersions).where(and(
      eq(schema.feeStructureVersions.institutionId, ctx.principal.institutionId),
      eq(schema.feeStructureVersions.structureId, structureId),
    )).orderBy(desc(schema.feeStructureVersions.versionNo));
    const [count] = await this.db.select({ value:sql<number>`count(*)::int` }).from(schema.feeInvoices).where(and(
      eq(schema.feeInvoices.institutionId, ctx.principal.institutionId),
      eq(schema.feeInvoices.feeStructureId, structureId),
    ));
    return { structure, versions, invoiceCount:Number(count?.value??0) };
  }

  async createStructureVersion(ctx: PortalActionContext, structureId: string, input: CreateFeeStructureVersionInput) {
    const [structure] = await this.db.select().from(schema.feeStructures).where(and(
      eq(schema.feeStructures.id, structureId), eq(schema.feeStructures.institutionId, ctx.principal.institutionId),
    )).limit(1);
    if (!structure) throw new NotFoundException({ code: 'STRUCTURE_NOT_FOUND', message: 'Fee structure not found.' });
    if (structure.version !== input.version) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'This structure changed. Reload and retry.' });
    const versionNo = structure.currentVersion + 1;
    const eligible = input.regenerate_unbilled ? await this.db.select({
      id: schema.feeInvoices.id,
      studentId: schema.feeInvoices.studentId,
      installmentSeq: schema.feeInvoices.installmentSeq,
    }).from(schema.feeInvoices).where(and(
      eq(schema.feeInvoices.institutionId, ctx.principal.institutionId),
      eq(schema.feeInvoices.feeStructureId, structureId),
      eq(schema.feeInvoices.structureVersionNo, structure.currentVersion),
      eq(schema.feeInvoices.amountPaid, 0),
      sql`${schema.feeInvoices.status} <> 'cancelled'`,
      sql`not exists (select 1 from fee_payments p where p.invoice_id = ${schema.feeInvoices.id})`,
      sql`not exists (select 1 from fee_receipts r where r.student_id = ${schema.feeInvoices.studentId} and r.line_snapshot @> jsonb_build_array(jsonb_build_object('invoiceId', ${schema.feeInvoices.id}::text)))`,
    )) : [];
    const [row] = await this.db.transaction(async (tx) => {
      const updated = await tx.update(schema.feeStructures).set({ currentVersion: versionNo, lateFeePolicy: input.late_fee_policy, version: input.version + 1, updatedBy: ctx.principal.institutionUserId, updatedAt: new Date() })
        .where(and(eq(schema.feeStructures.id, structureId), eq(schema.feeStructures.version, input.version))).returning({ id:schema.feeStructures.id });
      if (!updated.length) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'This structure changed. Reload and retry.' });
      const inserted = await tx.insert(schema.feeStructureVersions).values({
        institutionId: ctx.principal.institutionId, structureId, versionNo,
        lineItems: input.line_items, installmentSchedule: input.installment_schedule,
        lateFeePolicy: input.late_fee_policy, createdBy: ctx.principal.institutionUserId,
      }).returning();
      return inserted;
    });
    const regenerated: Array<{ installmentSeq:number;created:number;skipped:number }> = [];
    if (eligible.length) {
      for (const installmentSeq of [...new Set(eligible.map(item=>item.installmentSeq).filter((value):value is number=>value!==null))]) {
        const studentIds = [...new Set(eligible.filter(item=>item.installmentSeq===installmentSeq).map(item=>item.studentId))];
        const result = await this.generateInvoices(ctx, structureId, {
          version_no: versionNo, installment_seqs: [installmentSeq], student_ids: studentIds,
        }, `fee-version-regenerate:${row!.id}:${installmentSeq}`);
        regenerated.push({ installmentSeq, created: result.created, skipped: result.skipped });
      }
      await this.db.update(schema.feeInvoices).set({ status:'cancelled', updatedAt:new Date(), updatedBy:ctx.principal.institutionUserId })
        .where(inArray(schema.feeInvoices.id, eligible.map(item=>item.id)));
    }
    await this.write(ctx, 'fee.structure.version.create', 'fee_structure_version', row!.id, { structureId, versionNo, regenerated:eligible.length });
    return { ...row!, regeneration: { cancelled: eligible.length, batches: regenerated } };
  }

  async activateStructure(ctx: PortalActionContext, structureId: string, version: number) {
    const [row] = await this.db.update(schema.feeStructures).set({ status: 'active', version: version + 1, updatedBy: ctx.principal.institutionUserId, updatedAt: new Date() })
      .where(and(eq(schema.feeStructures.id, structureId), eq(schema.feeStructures.institutionId, ctx.principal.institutionId), eq(schema.feeStructures.version, version))).returning();
    if (!row) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'This structure changed. Reload and retry.' });
    await this.write(ctx, 'fee.structure.activate', 'fee_structure', structureId, {});
    return row;
  }

  async generateInvoices(ctx: PortalActionContext, structureId: string, input: GenerateFeeInvoicesInput, key?: string) {
    if (!key) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key is required.' });
    const replay = await this.idempotency.run(key, 'fee_demand_generation', async () => {
      const [structure] = await this.db.select().from(schema.feeStructures).where(and(eq(schema.feeStructures.id, structureId), eq(schema.feeStructures.institutionId, ctx.principal.institutionId))).limit(1);
      const [version] = await this.db.select().from(schema.feeStructureVersions).where(and(eq(schema.feeStructureVersions.structureId, structureId), eq(schema.feeStructureVersions.versionNo, input.version_no))).limit(1);
      if (!structure || !version) throw new NotFoundException({ code: 'STRUCTURE_VERSION_NOT_FOUND', message: 'Fee structure version not found.' });
      const batchId = randomUUID();
      const selectedSchedules=(version.installmentSchedule as Array<{seq:number}>).filter(row=>input.installment_seqs.includes(row.seq));
      const chunks=Array.from({length:Math.ceil(input.student_ids.length/100)},(_,index)=>input.student_ids.slice(index*100,(index+1)*100));
      const base={institutionId:ctx.principal.institutionId,institutionUserId:ctx.principal.institutionUserId,structureId,versionNo:input.version_no,installmentSeqs:input.installment_seqs,batchId};
      if(this.jobs.enabled){
        await Promise.all(chunks.map((studentIds,index)=>this.jobs.enqueue('billing-sync',FEE_DEMAND_GENERATION_JOB,{...base,studentIds},{jobId:`fee-generation:${batchId}:${index}`,attempts:5})));
        return{id:batchId,batchId,status:'queued',created:0,skipped:0,expected:input.student_ids.length*selectedSchedules.length,chunkCount:chunks.length,institutionId:ctx.principal.institutionId};
      }
      let created=0;let skipped=0;
      for(const studentIds of chunks){const result=await this.generateInvoiceChunk({...base,studentIds});created+=result.created;skipped+=result.skipped;}
      return{id:batchId,batchId,status:'complete',created,skipped,expected:created+skipped,chunkCount:chunks.length,institutionId:ctx.principal.institutionId};
    });
    await this.write(ctx, 'fee.demand.generate', 'fee_generation_batch', replay.result.batchId, { created: replay.result.created, skipped: replay.result.skipped });
    return { ...replay.result, replayed: replay.replayed };
  }

  async generateInvoiceChunk(data:FeeDemandGenerationJobData){
    const [structure]=await this.db.select().from(schema.feeStructures).where(and(eq(schema.feeStructures.id,data.structureId),eq(schema.feeStructures.institutionId,data.institutionId))).limit(1);
    const [version]=await this.db.select().from(schema.feeStructureVersions).where(and(eq(schema.feeStructureVersions.structureId,data.structureId),eq(schema.feeStructureVersions.versionNo,data.versionNo))).limit(1);
    if(!structure||!version)throw new NotFoundException({code:'STRUCTURE_VERSION_NOT_FOUND',message:'Fee structure version not found.'});
    const students=await this.db.select().from(schema.students).where(and(eq(schema.students.institutionId,data.institutionId),inArray(schema.students.id,data.studentIds)));
    const[year]=structure.academicYearId?await this.db.select().from(schema.academicYears).where(eq(schema.academicYears.id,structure.academicYearId)).limit(1):[];
    const schedules=version.installmentSchedule as Array<{seq:number;label:string;due_date:string;pct_bps:number}>;
    const selected=schedules.filter(item=>data.installmentSeqs.includes(item.seq));
    const lines=version.lineItems as Array<{key:string;label:string;amount_minor:number;tax_pct:number;category:string}>;
    let created=0;let skipped=0;
    for(const student of students){for(const schedule of selected){
      const itemValues=lines.map(line=>{const prior=schedules.filter(part=>part.seq<schedule.seq).reduce((sum,part)=>sum+Math.floor(line.amount_minor*part.pct_bps/10_000),0);const isLast=schedule.seq===Math.max(...schedules.map(part=>part.seq));const installmentAmount=isLast?line.amount_minor-prior:Math.floor(line.amount_minor*schedule.pct_bps/10_000);const proration=line.category==='tuition'&&year?.startDate&&year?.endDate&&student.enrollmentDate?prorateMinorByDays(installmentAmount,year.startDate,year.endDate,student.enrollmentDate):{amountMinor:installmentAmount,factor:1,totalDays:null,billableDays:null};return{line,proration,taxMinor:Math.floor(proration.amountMinor*line.tax_pct/100)};});
      const amount=itemValues.reduce((sum,item)=>sum+item.proration.amountMinor+item.taxMinor,0);
      const createdInvoiceId=await this.db.transaction(async tx=>{const[invoice]=await tx.insert(schema.feeInvoices).values({institutionId:data.institutionId,campusId:student.campusId??structure.campusId,invoiceNo:`F-${data.batchId.slice(0,8)}-${schedule.seq}-${student.id.slice(0,6)}`,studentId:student.id,feeStructureId:data.structureId,academicYearId:structure.academicYearId,termId:structure.termId,source:['transport','hostel'].includes(lines[0]?.category??'')?lines[0]!.category:'tuition',amount,amountPaid:0,status:'pending',issueDate:this.today(),dueDate:schedule.due_date,structureVersionNo:data.versionNo,installmentSeq:schedule.seq,origin:'structure',generationBatchId:data.batchId,createdBy:data.institutionUserId}).onConflictDoNothing().returning();if(!invoice)return null;await tx.insert(schema.feeInvoiceItems).values(itemValues.map(({line,proration,taxMinor})=>({institutionId:data.institutionId,invoiceId:invoice.id,studentId:student.id,kind:'charge',category:line.category,label:line.label,amountMinor:proration.amountMinor,taxMinor,source:{structure_line_key:line.key,installment_seq:schedule.seq,proration}})));return invoice.id;});
      if(!createdInvoiceId){skipped+=1;continue;}created+=1;
      const daysUntilDue=Math.ceil((Date.parse(`${schedule.due_date}T00:00:00Z`)-Date.now())/86_400_000);
      if(daysUntilDue<7&&student.institutionUserId)await this.todayNotify.dispatch({kind:'institutional',institutionId:data.institutionId,campusId:student.campusId??structure.campusId,institutionUserId:student.institutionUserId,studentId:student.id,email:'',fullName:'',lastAuthAt:null,permissions:[]},{eventKey:`fees:new-demand:${createdInvoiceId}`,type:'nudge',sourceModule:'fees',title:'New fee demand',body:`${schedule.label} is due ${schedule.due_date}.`,deepLink:'/fees'}).catch(()=>undefined);
    }}
    skipped+=(data.studentIds.length-students.length)*selected.length;
    return{created,skipped};
  }

  async generationProgress(ctx:PortalActionContext,batchId:string){
    const[claim]=await this.db.select({responseBody:schema.idempotencyKeys.responseBody}).from(schema.idempotencyKeys).where(and(eq(schema.idempotencyKeys.scope,'fee_demand_generation'),sql`${schema.idempotencyKeys.responseBody}->>'batchId'=${batchId}`,sql`${schema.idempotencyKeys.responseBody}->>'institutionId'=${ctx.principal.institutionId}`)).limit(1);
    const meta=claim?.responseBody as {expected?:number;chunkCount?:number}|null;if(!meta)throw new NotFoundException({code:'GENERATION_BATCH_NOT_FOUND',message:'Generation batch not found.'});
    const[createdRow]=await this.db.select({value:sql<number>`count(*)::int`}).from(schema.feeInvoices).where(and(eq(schema.feeInvoices.institutionId,ctx.principal.institutionId),eq(schema.feeInvoices.generationBatchId,batchId)));
    const[jobsRow]=await this.db.select({done:sql<number>`count(*) filter(where ${schema.backgroundJobs.status}='succeeded')::int`,failed:sql<number>`count(*) filter(where ${schema.backgroundJobs.status}='failed')::int`}).from(schema.backgroundJobs).where(and(eq(schema.backgroundJobs.name,FEE_DEMAND_GENERATION_JOB),sql`${schema.backgroundJobs.detail}->>'batchId'=${batchId}`));
    const created=Number(createdRow?.value??0),done=Number(jobsRow?.done??0),failed=Number(jobsRow?.failed??0),chunkCount=Number(meta.chunkCount??0),complete=done>=chunkCount;
    return{batchId,status:complete?'complete':failed>0?'retrying':'running',created,skipped:complete?Math.max(0,Number(meta.expected??0)-created):0,expected:Number(meta.expected??0),completedChunks:done,chunkCount};
  }

  async generationCsv(ctx:PortalActionContext,batchId:string){
    await this.generationProgress(ctx,batchId);
    const rows=await this.db.select({invoiceNo:schema.feeInvoices.invoiceNo,studentId:schema.feeInvoices.studentId,installmentSeq:schema.feeInvoices.installmentSeq,dueDate:schema.feeInvoices.dueDate,amount:schema.feeInvoices.amount,status:schema.feeInvoices.status}).from(schema.feeInvoices).where(and(eq(schema.feeInvoices.institutionId,ctx.principal.institutionId),eq(schema.feeInvoices.generationBatchId,batchId))).orderBy(asc(schema.feeInvoices.studentId),asc(schema.feeInvoices.installmentSeq));
    return['invoice_no,student_id,installment_seq,due_date,amount_minor,status',...rows.map(row=>[row.invoiceNo,row.studentId,row.installmentSeq,row.dueDate,row.amount,row.status].map(this.csv).join(','))].join('\n');
  }

  async duesBlock(institutionId: string, studentId: string) {
    const result = await this.studentHome({ kind: 'institutional', institutionId, campusId: null, institutionUserId: randomUUID(), studentId, email: '', fullName: '', lastAuthAt: null, permissions: [] });
    return { studentId, balanceMinor: result.balanceMinor, overdueMinor: result.overdueMinor, consequences: result.duesBlocked };
  }

  async createWaiver(ctx: PortalActionContext, input: FeeWaiverInput) {
    const config = await this.getConfig(ctx.principal.institutionId);
    const requiresSecond = input.amount_minor > config.waiverTwoPersonThresholdMinor;
    const [row] = await this.db.insert(schema.feeWaivers).values({
      institutionId: ctx.principal.institutionId, studentId: input.student_id, invoiceId: input.invoice_id,
      label: input.label, amountMinor: input.amount_minor, reason: input.reason,
      status: requiresSecond ? 'pending_second_approval' : 'approved', proposedBy: ctx.principal.institutionUserId,
      approvedBy: requiresSecond ? null : ctx.principal.institutionUserId,
      thresholdSnapshotMinor: config.waiverTwoPersonThresholdMinor, requestId: input.request_id,
    }).returning();
    if (!requiresSecond) {await this.postWaiver(row!);if(row!.requestId)await this.fulfillSystemRequest(row!.requestId,`Waiver posted · ${row!.label}`,{waiver_id:row!.id});}
    await this.write(ctx, 'fee.waiver.propose', 'fee_waiver', row!.id, { requiresSecond });
    return row;
  }

  async clearPayment(ctx: PortalActionContext, paymentId: string, version: number) {
    const [row] = await this.db.update(schema.feePayments).set({ paymentState:'captured', version:version+1, updatedAt:new Date() })
      .where(and(eq(schema.feePayments.id,paymentId),eq(schema.feePayments.institutionId,ctx.principal.institutionId),eq(schema.feePayments.paymentState,'pending_clearance'),eq(schema.feePayments.version,version))).returning();
    if(!row)throw new ConflictException({code:'VERSION_CONFLICT',message:'This payment changed. Reload and retry.'});
    await this.write(ctx,'fee.payment.clear','fee_payment',paymentId,{});return row;
  }

  async bouncePayment(ctx: PortalActionContext, paymentId: string, reason: string, addBounceFee: boolean) {
    const [payment]=await this.db.select().from(schema.feePayments).where(and(eq(schema.feePayments.id,paymentId),eq(schema.feePayments.institutionId,ctx.principal.institutionId))).limit(1);
    if(!payment||payment.paymentState!=='pending_clearance')throw new NotFoundException({code:'PAYMENT_NOT_PENDING',message:'Pending payment not found.'});
    const related=payment.receiptId?await this.db.select().from(schema.feePayments).where(and(eq(schema.feePayments.receiptId,payment.receiptId),eq(schema.feePayments.paymentState,'pending_clearance'))):[payment];
    const config=await this.getConfig(ctx.principal.institutionId);
    await this.db.transaction(async(tx)=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`fees:bounce:${payment.receiptId??payment.id}`}))`);
      for(const line of related){
        await tx.update(schema.feePayments).set({paymentState:'bounced',version:line.version+1,updatedAt:new Date()}).where(and(eq(schema.feePayments.id,line.id),eq(schema.feePayments.version,line.version)));
        await tx.insert(schema.feePayments).values({institutionId:line.institutionId,invoiceId:line.invoiceId,amount:-line.amount,method:line.method,reference:line.reference,paidDate:this.today(),notes:reason,channel:'desk',paymentState:'bounce_reversal',receiptId:line.receiptId,recordedBy:ctx.principal.institutionUserId,createdBy:ctx.principal.institutionUserId});
        await tx.update(schema.feeInvoices).set({amountPaid:sql`greatest(0,${schema.feeInvoices.amountPaid}-${line.amount})`,status:sql`case when greatest(0,${schema.feeInvoices.amountPaid}-${line.amount})=0 then 'pending' else 'partial' end`,updatedAt:new Date()}).where(eq(schema.feeInvoices.id,line.invoiceId));
      }
      if(payment.receiptId)await tx.update(schema.feeReceipts).set({status:'cancelled',cancelledReason:reason}).where(eq(schema.feeReceipts.id,payment.receiptId));
      if(addBounceFee&&config.bounceFeeMinor>0){const [invoice]=await tx.select().from(schema.feeInvoices).where(eq(schema.feeInvoices.id,payment.invoiceId)).limit(1);if(invoice){await tx.insert(schema.feeInvoiceItems).values({institutionId:invoice.institutionId,invoiceId:invoice.id,studentId:invoice.studentId,kind:'charge',category:'other',label:'Returned payment fee',amountMinor:config.bounceFeeMinor,source:{bounced_payment_id:payment.id}});await tx.update(schema.feeInvoices).set({amount:sql`${schema.feeInvoices.amount}+${config.bounceFeeMinor}`}).where(eq(schema.feeInvoices.id,invoice.id));}}
    });
    await this.write(ctx,'fee.payment.bounce','fee_payment',paymentId,{reason,addBounceFee});return{bounced:true,receiptId:payment.receiptId};
  }

  async refundReceipt(ctx: PortalActionContext, receiptId: string, amountMinor: number, reason: string, key?: string) {
    if(!key)throw new BadRequestException({code:'IDEMPOTENCY_KEY_REQUIRED',message:'Idempotency-Key is required.'});
    const replay=await this.idempotency.run(key,'fee_refund',async()=>{
      const [receipt]=await this.db.select().from(schema.feeReceipts).where(and(eq(schema.feeReceipts.id,receiptId),eq(schema.feeReceipts.institutionId,ctx.principal.institutionId))).limit(1);
      if(!receipt||receipt.status==='cancelled')throw new NotFoundException({code:'RECEIPT_NOT_FOUND',message:'Issued receipt not found.'});
      if(amountMinor>receipt.amountMinor)throw new BadRequestException({code:'REFUND_EXCEEDS_PAYMENT',message:'Refund exceeds the receipt amount.'});
      const config=await this.getConfig(ctx.principal.institutionId);
      if(amountMinor>config.refundTwoPersonThresholdMinor){
        const [pending]=await this.db.update(schema.feeReceipts).set({refundStatus:'pending_second_approval',refundAmountMinor:amountMinor,refundReason:reason,refundProposedBy:ctx.principal.institutionUserId,refundSecondApprovedBy:null,version:receipt.version+1}).where(and(eq(schema.feeReceipts.id,receiptId),eq(schema.feeReceipts.version,receipt.version),sql`${schema.feeReceipts.refundStatus} is null or ${schema.feeReceipts.refundStatus}<>'pending_second_approval'`)).returning();
        if(!pending)throw new ConflictException({code:'VERSION_CONFLICT',message:'This receipt changed. Reload and retry.'});
        return{id:receiptId,receiptId,status:'pending_second_approval' as const,version:pending.version,amountMinor};
      }
      return this.executeRefund(ctx,receipt,amountMinor,reason);
    });
    await this.write(ctx,'fee.receipt.refund','fee_receipt',receiptId,{amountMinor,reason,replayed:replay.replayed});return{...replay.result,replayed:replay.replayed};
  }

  async approveRefund(ctx:PortalActionContext,receiptId:string,version:number,approve:boolean,note?:string){const[receipt]=await this.db.select().from(schema.feeReceipts).where(and(eq(schema.feeReceipts.id,receiptId),eq(schema.feeReceipts.institutionId,ctx.principal.institutionId))).limit(1);if(!receipt||receipt.refundStatus!=='pending_second_approval'||receipt.version!==version)throw new ConflictException({code:'VERSION_CONFLICT',message:'This refund changed. Reload and retry.'});if(receipt.refundProposedBy===ctx.principal.institutionUserId)throw new UnprocessableEntityException({code:'SAME_APPROVER',message:'A different approver is required.'});if(!approve){const[rejected]=await this.db.update(schema.feeReceipts).set({refundStatus:'rejected',refundSecondApprovedBy:ctx.principal.institutionUserId,refundReason:note?`${receipt.refundReason}\nRejection: ${note}`:receipt.refundReason,version:version+1}).where(and(eq(schema.feeReceipts.id,receiptId),eq(schema.feeReceipts.version,version))).returning();await this.write(ctx,'fee.refund.reject','fee_receipt',receiptId,{note});return rejected;}const result=await this.executeRefund(ctx,receipt,receipt.refundAmountMinor!,receipt.refundReason!);await this.write(ctx,'fee.refund.approve','fee_receipt',receiptId,{amountMinor:receipt.refundAmountMinor});return result;}

  async reconciliation(ctx: PortalActionContext, date=this.today()) {
    const receipts=await this.db.select().from(schema.feeReceipts).where(and(eq(schema.feeReceipts.institutionId,ctx.principal.institutionId),sql`${schema.feeReceipts.issuedAt}::date=${date}::date`)).orderBy(desc(schema.feeReceipts.issuedAt)).limit(500);
    const clearance=await this.db.select().from(schema.feePayments).where(and(eq(schema.feePayments.institutionId,ctx.principal.institutionId),eq(schema.feePayments.paymentState,'pending_clearance'))).orderBy(asc(schema.feePayments.createdAt));
    const unmatched=await this.db.select().from(schema.feeGatewayEvents).where(and(eq(schema.feeGatewayEvents.institutionId,ctx.principal.institutionId),inArray(schema.feeGatewayEvents.outcome,['unmatched','amount_mismatch']))).orderBy(desc(schema.feeGatewayEvents.createdAt));
    const pendingWaivers=await this.db.select().from(schema.feeWaivers).where(and(eq(schema.feeWaivers.institutionId,ctx.principal.institutionId),eq(schema.feeWaivers.status,'pending_second_approval'))).orderBy(desc(schema.feeWaivers.createdAt));
    const pendingRefunds=await this.db.select().from(schema.feeReceipts).where(and(eq(schema.feeReceipts.institutionId,ctx.principal.institutionId),eq(schema.feeReceipts.refundStatus,'pending_second_approval'))).orderBy(desc(schema.feeReceipts.issuedAt));
    const paymentDisputes=await this.db.select().from(schema.studentRequests).where(and(eq(schema.studentRequests.institutionId,ctx.principal.institutionId),eq(schema.studentRequests.type,'payment_dispute'),inArray(schema.studentRequests.status,['submitted','in_review','needs_info','approved']))).orderBy(desc(schema.studentRequests.createdAt));
    const failedReceiptRenders=await this.db.select({id:schema.documentRenders.id,title:schema.documentRenders.title,error:schema.documentRenders.errorDetail,payload:schema.documentRenders.payload}).from(schema.documentRenders).where(and(eq(schema.documentRenders.institutionId,ctx.principal.institutionId),eq(schema.documentRenders.docType,'fee_receipt'),eq(schema.documentRenders.status,'failed'))).orderBy(desc(schema.documentRenders.createdAt));
    const overdue=await this.db.select({invoice:schema.feeInvoices,firstName:schema.students.firstName,lastName:schema.students.lastName,admissionNo:schema.students.admissionNo}).from(schema.feeInvoices).innerJoin(schema.students,eq(schema.students.id,schema.feeInvoices.studentId)).where(and(eq(schema.feeInvoices.institutionId,ctx.principal.institutionId),sql`${schema.feeInvoices.status}<>'cancelled'`,sql`${schema.feeInvoices.amount}>${schema.feeInvoices.amountPaid}`,sql`${schema.feeInvoices.dueDate}<${this.today()}::date`));
    const issued=receipts.filter(r=>r.status==='issued');const byMethod:Record<string,number>={};for(const row of issued)byMethod[row.method]=(byMethod[row.method]??0)+row.amountMinor;
    const studentMap=new Map<string,{studentId:string;name:string;admissionNo:string;amountMinor:number;days:number}>();const buckets:Record<string,{amountMinor:number;count:number}>={'0-30':{amountMinor:0,count:0},'31-60':{amountMinor:0,count:0},'61-90':{amountMinor:0,count:0},'90+':{amountMinor:0,count:0}};
    for(const row of overdue){const balance=row.invoice.amount-row.invoice.amountPaid;const days=Math.max(0,Math.floor((Date.now()-Date.parse(`${row.invoice.dueDate}T00:00:00Z`))/86_400_000));const prior=studentMap.get(row.invoice.studentId)??{studentId:row.invoice.studentId,name:`${row.firstName} ${row.lastName}`.trim(),admissionNo:row.admissionNo,amountMinor:0,days:0};prior.amountMinor+=balance;prior.days=Math.max(prior.days,days);studentMap.set(row.invoice.studentId,prior);const key=days<=30?'0-30':days<=60?'31-60':days<=90?'61-90':'90+';buckets[key]!.amountMinor+=balance;buckets[key]!.count+=1;}
    return{date,dailyRegister:{receipts,totalMinor:issued.reduce((sum,row)=>sum+row.amountMinor,0),byMethod},defaulters:[...studentMap.values()].sort((a,b)=>b.amountMinor-a.amountMinor),aging:buckets,clearance,unmatched,pendingWaivers,pendingRefunds,paymentDisputes,failedReceiptRenders};
  }

  async retryReceiptRender(ctx:PortalActionContext,renderId:string){const[render]=await this.db.select().from(schema.documentRenders).where(and(eq(schema.documentRenders.id,renderId),eq(schema.documentRenders.institutionId,ctx.principal.institutionId),eq(schema.documentRenders.docType,'fee_receipt'))).limit(1);const receiptId=typeof render?.payload?.fee_receipt_id==='string'?render.payload.fee_receipt_id:null;if(!receiptId)throw new NotFoundException({code:'RECEIPT_RENDER_NOT_FOUND',message:'Failed receipt render not found.'});await this.db.update(schema.documentRenders).set({status:'queued',errorDetail:null,updatedAt:new Date()}).where(eq(schema.documentRenders.id,renderId));await this.jobs.enqueue('reports',FEE_RECEIPT_RENDER_JOB,{institutionId:ctx.principal.institutionId,receiptId},{jobId:`fee-receipt-retry-${receiptId}-${Date.now()}`,attempts:3});await this.write(ctx,'fee.receipt_render.retry','document_render',renderId,{receiptId});return{ok:true,renderId,receiptId};}

  async reconciliationExport(ctx:PortalActionContext,format:string,date=this.today()){
    const data=await this.reconciliation(ctx,date);const rows=data.dailyRegister.receipts;
    if(format==='tally'){const map=(await this.getConfig(ctx.principal.institutionId)).tallyLedgerMap??{};return `<ENVELOPE><VOUCHERS>${rows.map(row=>`<VOUCHER><NUMBER>${this.xml(row.receiptNo)}</NUMBER><DATE>${date.replaceAll('-','')}</DATE><LEDGER>${this.xml(String((map as Record<string,string>)[row.method]??row.method))}</LEDGER><AMOUNT>${row.amountMinor}</AMOUNT><CANCELLED>${row.status==='cancelled'?'Yes':'No'}</CANCELLED></VOUCHER>`).join('')}</VOUCHERS></ENVELOPE>`;}
    const header=format==='quickbooks'?'Date,Receipt,Student,Method,Amount,Status':'receipt_no,date,student_id,method,amount_minor,status';
    return [header,...rows.map(row=>[date,row.receiptNo,row.studentId,row.method,format==='quickbooks'?(row.amountMinor/100).toFixed(2):row.amountMinor,row.status].map(this.csv).join(','))].join('\n');
  }

  async sendManualReminders(ctx:PortalActionContext,studentIds:string[]){let sent=0;for(const studentId of [...new Set(studentIds)].slice(0,500)){const result=await this.idempotency.run(`fee-reminder:${studentId}:${this.today()}`,'fee_manual_reminder',async()=>{const [home,student]=await Promise.all([this.studentDetail(ctx,studentId),this.db.select({institutionUserId:schema.students.institutionUserId,email:schema.institutionUsers.email,fullName:schema.institutionUsers.fullName,campusId:schema.students.campusId}).from(schema.students).leftJoin(schema.institutionUsers,eq(schema.institutionUsers.id,schema.students.institutionUserId)).where(and(eq(schema.students.id,studentId),eq(schema.students.institutionId,ctx.principal.institutionId))).limit(1).then(rows=>rows[0])]);if(!student?.institutionUserId||home.overdueMinor<=0)return{sent:false};await this.todayNotify.dispatch({kind:'institutional',institutionId:ctx.principal.institutionId,campusId:student.campusId,institutionUserId:student.institutionUserId,studentId,email:student.email??'',fullName:student.fullName??'',lastAuthAt:null,permissions:[]},{eventKey:`fees:manual-reminder:${studentId}:${this.today()}`,type:'nudge',sourceModule:'fees',title:'Fee payment reminder',body:`An overdue fee balance of ${home.overdueMinor} minor units needs attention.`,deepLink:'/fees'});return{sent:true};});if(!result.replayed&&result.result.sent)sent+=1;}await this.write(ctx,'fee.reminder.manual','student','bulk',{requested:studentIds.length,sent});return{sent,skipped:studentIds.length-sent};}

  async matchGatewayEvent(ctx:PortalActionContext,eventId:string,input:RecordDeskFeePaymentInput,key?:string){
    if(!key)throw new BadRequestException({code:'IDEMPOTENCY_KEY_REQUIRED',message:'Idempotency-Key is required.'});
    const actor={institutionId:ctx.principal.institutionId,institutionUserId:ctx.principal.institutionUserId,studentId:input.student_id};
    const replay=await this.idempotency.run(key,'fee_desk_payment',()=>this.db.transaction(async tx=>{
      const db=tx as unknown as Database;
      await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`fees:gateway-match:${eventId}`}))`);
      const[event]=await db.select().from(schema.feeGatewayEvents).where(and(eq(schema.feeGatewayEvents.id,eventId),eq(schema.feeGatewayEvents.institutionId,ctx.principal.institutionId),inArray(schema.feeGatewayEvents.outcome,['unmatched','amount_mismatch']))).limit(1);
      if(!event)throw new NotFoundException({code:'GATEWAY_EVENT_NOT_FOUND',message:'Unmatched event not found.'});
      const payment=await this.allocateAndReceiptTx(db,actor,{amountMinor:input.amount_minor,method:'bank_transfer',reference:input.reference??`${event.gateway}:${event.providerEventId}`,instrument:input.instrument,invoiceIds:input.invoice_ids,channel:'desk',paymentState:'captured'});
      const[cleared]=await db.update(schema.feeGatewayEvents).set({outcome:'applied',processedAt:new Date()}).where(and(eq(schema.feeGatewayEvents.id,eventId),inArray(schema.feeGatewayEvents.outcome,['unmatched','amount_mismatch']))).returning({id:schema.feeGatewayEvents.id});
      if(!cleared)throw new ConflictException({code:'GATEWAY_EVENT_ALREADY_MATCHED',message:'This gateway event was already matched.'});
      return payment;
    }));
    if(!replay.replayed)await this.afterReceipt(actor,replay.result);
    await this.write(ctx,'fee.gateway_event.match','fee_gateway_event',eventId,{studentId:input.student_id,receiptId:replay.result.receipt.id,replayed:replay.replayed});
    return{...replay.result,replayed:replay.replayed};
  }

  async decideWaiver(ctx: PortalActionContext, id: string, version: number, approve: boolean) {
    const [row] = await this.db.select().from(schema.feeWaivers).where(eq(schema.feeWaivers.id, id)).limit(1);
    if (!row) throw new NotFoundException({ code: 'WAIVER_NOT_FOUND', message: 'Waiver not found.' });
    if (row.proposedBy === ctx.principal.institutionUserId) throw new UnprocessableEntityException({ code: 'SAME_APPROVER', message: 'A different approver is required.' });
    const [updated] = await this.db.update(schema.feeWaivers).set({
      status: approve ? 'approved' : 'rejected', secondApprovedBy: approve ? ctx.principal.institutionUserId : null, version: version + 1,
    }).where(and(eq(schema.feeWaivers.id, id), eq(schema.feeWaivers.version, version), eq(schema.feeWaivers.status, 'pending_second_approval'))).returning();
    if (!updated) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'This waiver changed. Reload and retry.' });
    if (approve) {await this.postWaiver(updated);if(updated.requestId)await this.fulfillSystemRequest(updated.requestId,`Waiver posted · ${updated.label}`,{waiver_id:updated.id});}
    await this.write(ctx, approve ? 'fee.waiver.approve' : 'fee.waiver.reject', 'fee_waiver', id, {});
    return updated;
  }

  async getFeeConfig(institutionId: string) { return this.getConfig(institutionId); }

  async updateFeeConfig(ctx: PortalActionContext, input: InstitutionFeeConfigInput) {
    const [row] = await this.db.insert(schema.institutionFeeConfig).values({
      institutionId: ctx.principal.institutionId,
      partialPaymentAllowed: input.partial_payment_allowed,
      waiverTwoPersonThresholdMinor: input.waiver_two_person_threshold_minor,
      refundTwoPersonThresholdMinor: input.refund_two_person_threshold_minor,
      duesBlock: input.dues_block,
      reminderOffsets: input.reminder_offsets,
      receiptTemplateRef: input.receipt_template_ref,
      lateFeeRunHour: input.late_fee_run_hour,
      bounceFeeMinor: input.bounce_fee_minor,
      tallyLedgerMap: input.tally_ledger_map,
      version: input.version + 1,
      updatedBy: ctx.principal.institutionUserId,
    }).onConflictDoUpdate({ target: schema.institutionFeeConfig.institutionId, set: {
      partialPaymentAllowed: input.partial_payment_allowed,
      waiverTwoPersonThresholdMinor: input.waiver_two_person_threshold_minor,
      refundTwoPersonThresholdMinor: input.refund_two_person_threshold_minor,
      duesBlock: input.dues_block, reminderOffsets: input.reminder_offsets,
      receiptTemplateRef: input.receipt_template_ref, lateFeeRunHour: input.late_fee_run_hour,
      bounceFeeMinor: input.bounce_fee_minor, tallyLedgerMap: input.tally_ledger_map,
      version: input.version + 1, updatedBy: ctx.principal.institutionUserId, updatedAt: new Date(),
    }, setWhere: eq(schema.institutionFeeConfig.version, input.version) }).returning();
    if (!row) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Fee settings changed. Reload and retry.' });
    await this.write(ctx, 'fee.config.update', 'institution_fee_config', ctx.principal.institutionId, {});
    return row;
  }

  private async allocateAndReceipt(actor: Actor, payment: {
    amountMinor: number; method: string; reference?: string; instrument?: Record<string, unknown>;
    invoiceIds?: string[]; channel: string; paymentState: string; intentId?: string;
  }) {
    const result = await this.db.transaction((tx) => this.allocateAndReceiptTx(tx as unknown as Database, actor, payment));
    await this.afterReceipt(actor, result);
    return result;
  }

  private async allocateAndReceiptTx(db: Database, actor: Actor, payment: {
    amountMinor: number; method: string; reference?: string; instrument?: Record<string, unknown>;
    invoiceIds?: string[]; channel: string; paymentState: string; intentId?: string;
  }) {
      await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`fees:${actor.institutionId}:${actor.studentId}`}))`);
      const filters = [eq(schema.feeInvoices.institutionId, actor.institutionId), eq(schema.feeInvoices.studentId, actor.studentId)];
      if (payment.invoiceIds?.length) filters.push(inArray(schema.feeInvoices.id, payment.invoiceIds));
      const invoices = await db.select().from(schema.feeInvoices).where(and(...filters)).orderBy(asc(schema.feeInvoices.dueDate), asc(schema.feeInvoices.createdAt));
      const allocated = allocateOldestDue(payment.amountMinor, invoices);
      const invoiceNos = new Map(invoices.map((invoice) => [invoice.id, invoice.invoiceNo]));
      const allocations = allocated.allocations.map((item) => ({ ...item, invoiceNo: invoiceNos.get(item.invoiceId)! }));
      if (allocated.remainder !== 0) throw new BadRequestException({ code: 'AMOUNT_EXCEEDS_BALANCE', message: 'Payment exceeds outstanding balance.' });
      const campusId = invoices.find((row) => row.campusId)?.campusId ?? (await db.select({ id: schema.campuses.id }).from(schema.campuses).where(eq(schema.campuses.institutionId, actor.institutionId)).limit(1))[0]?.id;
      if (!campusId) throw new BadRequestException({ code: 'CAMPUS_REQUIRED', message: 'A campus is required before issuing receipts.' });
      const fyLabel = this.fyLabel();
      const [seq] = await db.insert(schema.feeReceiptSequences).values({ institutionId: actor.institutionId, campusId, fyLabel, nextNo: 2 })
        .onConflictDoUpdate({ target: [schema.feeReceiptSequences.institutionId, schema.feeReceiptSequences.campusId, schema.feeReceiptSequences.fyLabel], set: { nextNo: sql`${schema.feeReceiptSequences.nextNo} + 1` } }).returning();
      const receiptNo = formatReceiptNo(fyLabel, seq!.nextNo - 1);
      const paymentGroupId = randomUUID();
      const [receipt] = await db.insert(schema.feeReceipts).values({
        institutionId: actor.institutionId, campusId, studentId: actor.studentId, paymentGroupId,
        receiptNo, fyLabel, amountMinor: payment.amountMinor, method: payment.method,
        lineSnapshot: allocations, issuedBy: actor.institutionUserId,
      }).returning();
      const paymentIds: string[] = [];
      for (const allocation of allocations) {
        const [line] = await db.insert(schema.feePayments).values({
          institutionId: actor.institutionId, invoiceId: allocation.invoiceId, amount: allocation.amountMinor,
          method: payment.method, reference: payment.reference, paidDate: this.today(), instrument: payment.instrument,
          channel: payment.channel, paymentState: payment.paymentState, receiptId: receipt!.id,
          recordedBy: actor.institutionUserId, intentId: payment.intentId, createdBy: actor.institutionUserId,
        }).returning({ id: schema.feePayments.id });
        paymentIds.push(line!.id);
        await db.update(schema.feeInvoices).set({
          amountPaid: sql`${schema.feeInvoices.amountPaid} + ${allocation.amountMinor}`,
          status: sql`case when ${schema.feeInvoices.amountPaid} + ${allocation.amountMinor} >= ${schema.feeInvoices.amount} then 'paid' else 'partial' end`,
          updatedAt: new Date(),
        }).where(eq(schema.feeInvoices.id, allocation.invoiceId));
      }
      return { receipt: receipt!, paymentIds };
  }

  private async afterReceipt(actor:Actor,result:{receipt:typeof schema.feeReceipts.$inferSelect;paymentIds:string[]}){
    await this.releasePaidRequests(result.receipt.lineSnapshot as Array<{invoiceId?:string}>);
    await this.jobs.enqueue('reports', FEE_RECEIPT_RENDER_JOB, { institutionId: actor.institutionId, receiptId: result.receipt.id }, { jobId: `fee-receipt-${result.receipt.id}`, attempts: 3 });
    const [recipient] = await this.db.select({
      institutionUserId: schema.students.institutionUserId,
      email: schema.institutionUsers.email,
      fullName: schema.institutionUsers.fullName,
    }).from(schema.students)
      .leftJoin(schema.institutionUsers, eq(schema.institutionUsers.id, schema.students.institutionUserId))
      .where(and(eq(schema.students.id, actor.studentId), eq(schema.students.institutionId, actor.institutionId)))
      .limit(1);
    if (recipient?.institutionUserId) {
      await this.todayNotify.dispatch({kind:'institutional',institutionId:actor.institutionId,campusId:result.receipt.campusId,institutionUserId:recipient.institutionUserId,studentId:actor.studentId,email:recipient.email??'',fullName:recipient.fullName??'',lastAuthAt:null,permissions:[]},{eventKey:`fees:receipt:${result.receipt.id}`,type:'request_update',sourceModule:'fees',title:`Payment received · ${result.receipt.receiptNo}`,body:`Receipt ${result.receipt.receiptNo} is ready.`,deepLink:'/fees'}).catch(()=>undefined);
    }
  }

  private async releasePaidRequests(lines:Array<{invoiceId?:string}>){const ids=[...new Set(lines.map(line=>line.invoiceId).filter((id):id is string=>Boolean(id)))];if(!ids.length)return;const requests=await this.db.select({request:schema.studentRequests,invoice:schema.feeInvoices}).from(schema.studentRequests).innerJoin(schema.feeInvoices,eq(schema.feeInvoices.id,schema.studentRequests.paymentRequestId)).where(and(inArray(schema.studentRequests.paymentRequestId,ids),eq(schema.studentRequests.status,'draft'),sql`${schema.feeInvoices.amountPaid}>=${schema.feeInvoices.amount}`));for(const row of requests){const eventSeq=await this.db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`request:${row.request.id}`}))`);const[updated]=await tx.update(schema.studentRequests).set({status:'submitted',submittedAt:new Date(),version:row.request.version+1,updatedAt:new Date()}).where(and(eq(schema.studentRequests.id,row.request.id),eq(schema.studentRequests.version,row.request.version),eq(schema.studentRequests.status,'draft'))).returning();if(!updated)return null;const[seq]=await tx.select({value:sql<number>`coalesce(max(${schema.studentRequestEvents.seq}),0)::int`}).from(schema.studentRequestEvents).where(eq(schema.studentRequestEvents.requestId,row.request.id));const next=Number(seq?.value??0)+1;await tx.insert(schema.studentRequestEvents).values({requestId:row.request.id,institutionId:row.request.institutionId,seq:next,eventType:'submitted',actorKind:'system',note:'Payment confirmed',data:{invoice_id:row.invoice.id}});return next;});if(eventSeq)await this.jobs.enqueue('notifications',REQUEST_NOTIFY_JOB,{institutionId:row.request.institutionId,requestId:row.request.id,eventSeq},{jobId:`request-notify-${row.request.id}-${eventSeq}`});}}

  private executeRefund(ctx:PortalActionContext,receipt:typeof schema.feeReceipts.$inferSelect,amountMinor:number,reason:string){
    return this.postRefund(receipt,amountMinor,reason,ctx.principal.institutionUserId,`refund:${receipt.receiptNo}`);
  }

  private async postRefund(receipt:typeof schema.feeReceipts.$inferSelect,amountMinor:number,reason:string,actorUserId:string|null,reference:string){
    if(amountMinor<=0)throw new BadRequestException({code:'REFUND_AMOUNT_INVALID',message:'Refund amount must be greater than zero.'});
    const result=await this.db.transaction(async(tx)=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`fees:refund:${receipt.id}`}))`);
      const duplicate=await tx.select({id:schema.feePayments.id}).from(schema.feePayments).where(eq(schema.feePayments.reference,reference)).limit(1);
      if(duplicate[0])return{receiptId:receipt.id,refundIds:[duplicate[0].id],amountMinor,status:'posted' as const,replacementReceipt:null};
      const currentLines=await tx.select().from(schema.feePayments).where(eq(schema.feePayments.receiptId,receipt.id));
      const availableByInvoice=new Map<string,number>();
      for(const line of currentLines)availableByInvoice.set(line.invoiceId,(availableByInvoice.get(line.invoiceId)??0)+line.amount);
      const available=[...availableByInvoice.entries()].filter(([,amount])=>amount>0);
      const totalAvailable=available.reduce((sum,[,amount])=>sum+amount,0);
      if(amountMinor>totalAvailable)throw new BadRequestException({code:'REFUND_EXCEEDS_PAYMENT',message:'Refund exceeds the unrefunded receipt amount.'});
      let remaining=amountMinor;const refundIds:string[]=[];const refundByInvoice=new Map<string,number>();
      for(const[invoiceId,availableAmount]of available){
        if(remaining<=0)break;const value=Math.min(availableAmount,remaining);const source=currentLines.find(line=>line.invoiceId===invoiceId&&line.amount>0)!;
        const[refund]=await tx.insert(schema.feePayments).values({institutionId:source.institutionId,invoiceId,amount:-value,method:source.method,reference,paidDate:this.today(),notes:reason,channel:source.channel,paymentState:'refund',receiptId:receipt.id,recordedBy:actorUserId,createdBy:actorUserId}).returning({id:schema.feePayments.id});
        refundIds.push(refund!.id);refundByInvoice.set(invoiceId,value);
        await tx.update(schema.feeInvoices).set({amountPaid:sql`greatest(0,${schema.feeInvoices.amountPaid}-${value})`,status:sql`case when greatest(0,${schema.feeInvoices.amountPaid}-${value})=0 then 'pending' else 'partial' end`,updatedAt:new Date()}).where(eq(schema.feeInvoices.id,invoiceId));remaining-=value;
      }
      const retained=totalAvailable-amountMinor;let replacement:null|typeof schema.feeReceipts.$inferSelect=null;
      if(retained>0){
        const[seq]=await tx.insert(schema.feeReceiptSequences).values({institutionId:receipt.institutionId,campusId:receipt.campusId,fyLabel:receipt.fyLabel,nextNo:2}).onConflictDoUpdate({target:[schema.feeReceiptSequences.institutionId,schema.feeReceiptSequences.campusId,schema.feeReceiptSequences.fyLabel],set:{nextNo:sql`${schema.feeReceiptSequences.nextNo}+1`}}).returning();
        const receiptNo=formatReceiptNo(receipt.fyLabel,seq!.nextNo-1);
        const snapshot=(receipt.lineSnapshot as Array<Record<string,unknown>>).map(row=>{const invoiceId=String(row.invoiceId??'');const original=Number(row.amountMinor??0);return{...row,amountMinor:Math.max(0,original-(refundByInvoice.get(invoiceId)??0))};}).filter(row=>Number(row.amountMinor)>0);
        const inserted=await tx.insert(schema.feeReceipts).values({institutionId:receipt.institutionId,campusId:receipt.campusId,studentId:receipt.studentId,paymentGroupId:receipt.paymentGroupId,receiptNo,fyLabel:receipt.fyLabel,amountMinor:retained,method:receipt.method,lineSnapshot:snapshot,issuedBy:actorUserId}).returning();replacement=inserted[0]!;
        await tx.update(schema.feePayments).set({receiptId:replacement.id}).where(and(eq(schema.feePayments.receiptId,receipt.id),sql`${schema.feePayments.amount}>0`));
      }
      const posted=await tx.update(schema.feeReceipts).set({status:'cancelled',cancelledReason:reason,refundStatus:'posted',refundAmountMinor:amountMinor,refundReason:reason,refundSecondApprovedBy:receipt.refundStatus==='pending_second_approval'?actorUserId:null,version:receipt.version+1}).where(and(eq(schema.feeReceipts.id,receipt.id),eq(schema.feeReceipts.version,receipt.version))).returning({id:schema.feeReceipts.id});
      if(!posted.length)throw new ConflictException({code:'VERSION_CONFLICT',message:'This receipt changed. Reload and retry.'});
      return{receiptId:receipt.id,refundIds,amountMinor,status:'posted' as const,replacementReceipt:replacement};
    });
    if(result.replacementReceipt)await this.jobs.enqueue('reports',FEE_RECEIPT_RENDER_JOB,{institutionId:receipt.institutionId,receiptId:result.replacementReceipt.id},{jobId:`fee-receipt-${result.replacementReceipt.id}`,attempts:3});
    return result;
  }

  private async notifyRefund(receipt:typeof schema.feeReceipts.$inferSelect,amountMinor:number,eventId:string){
    const[recipient]=await this.db.select({institutionUserId:schema.students.institutionUserId,email:schema.institutionUsers.email,fullName:schema.institutionUsers.fullName}).from(schema.students).leftJoin(schema.institutionUsers,eq(schema.institutionUsers.id,schema.students.institutionUserId)).where(and(eq(schema.students.id,receipt.studentId),eq(schema.students.institutionId,receipt.institutionId))).limit(1);
    if(recipient?.institutionUserId)await this.todayNotify.dispatch({kind:'institutional',institutionId:receipt.institutionId,campusId:receipt.campusId,institutionUserId:recipient.institutionUserId,studentId:receipt.studentId,email:recipient.email??'',fullName:recipient.fullName??'',lastAuthAt:null,permissions:[]},{eventKey:`fees:refund:${eventId}`,type:'request_update',sourceModule:'fees',title:'Payment refund processed',body:`A refund of ${amountMinor} minor units was confirmed.`,deepLink:'/fees'}).catch(()=>undefined);
  }

  private async settleVerifiedIntent(intent:typeof schema.parentPaymentIntents.$inferSelect,reference:string){
    const claimed=await this.db.update(schema.parentPaymentIntents).set({version:intent.version+1,updatedAt:new Date()}).where(and(eq(schema.parentPaymentIntents.id,intent.id),eq(schema.parentPaymentIntents.version,intent.version),sql`${schema.parentPaymentIntents.status}<>'settled'`)).returning();
    if(!claimed.length){const[locked]=await this.db.select().from(schema.parentPaymentIntents).where(eq(schema.parentPaymentIntents.id,intent.id)).limit(1);if(locked?.status==='settled'){const [receipt]=locked.settledPaymentId?await this.db.select({receipt:schema.feeReceipts}).from(schema.feePayments).innerJoin(schema.feeReceipts,eq(schema.feeReceipts.id,schema.feePayments.receiptId)).where(eq(schema.feePayments.id,locked.settledPaymentId)).limit(1):[];return{receipt:receipt?.receipt,paymentIds:locked.settledPaymentId?[locked.settledPaymentId]:[]};}throw new ConflictException({code:'SETTLEMENT_IN_PROGRESS',message:'Payment settlement is already in progress.'});}
    const invoiceIds=intent.invoiceIds?.length?intent.invoiceIds:[intent.feeInvoiceId];const[first]=await this.db.select({studentId:schema.feeInvoices.studentId}).from(schema.feeInvoices).where(eq(schema.feeInvoices.id,invoiceIds[0]!)).limit(1);if(!first)throw new NotFoundException({code:'INVOICE_NOT_FOUND',message:'Invoice not found.'});
    const result=await this.allocateAndReceipt({institutionId:intent.institutionId,institutionUserId:intent.studentUserId??intent.guardianUserId!,studentId:first.studentId},{amountMinor:intent.amount,method:'online',reference,invoiceIds,channel:'online',paymentState:'captured',intentId:intent.id});
    const updated=await this.db.update(schema.parentPaymentIntents).set({status:'settled',settledPaymentId:result.paymentIds[0]!,settledAt:new Date()}).where(and(eq(schema.parentPaymentIntents.id,intent.id),eq(schema.parentPaymentIntents.version,intent.version+1),sql`${schema.parentPaymentIntents.status}<>'settled'`)).returning();
    if(!updated.length)throw new ConflictException({code:'SETTLEMENT_RACE',message:'Payment was settled concurrently; refresh the receipt.'});if(intent.disputeRequestId)await this.fulfillSystemRequest(intent.disputeRequestId,`Payment confirmed · Receipt ${result.receipt.receiptNo}`,{receipt_no:result.receipt.receiptNo});return result;
  }

  private async ensurePaymentDispute(intent:typeof schema.parentPaymentIntents.$inferSelect){
    const result=await this.db.transaction(async(tx)=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`fees:dispute:${intent.id}`}))`);const[current]=await tx.select().from(schema.parentPaymentIntents).where(eq(schema.parentPaymentIntents.id,intent.id)).limit(1);if(current?.disputeRequestId){const[existing]=await tx.select({id:schema.studentRequests.id,humanCode:schema.studentRequests.humanCode}).from(schema.studentRequests).where(eq(schema.studentRequests.id,current.disputeRequestId)).limit(1);return existing!;}const invoiceId=(intent.invoiceIds?.[0]??intent.feeInvoiceId);const[invoice]=await tx.select().from(schema.feeInvoices).where(eq(schema.feeInvoices.id,invoiceId)).limit(1);if(!invoice)throw new NotFoundException({code:'INVOICE_NOT_FOUND',message:'Invoice not found.'});if(!invoice.campusId)throw new BadRequestException({code:'CAMPUS_REQUIRED',message:'The invoice has no campus.'});const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const suffix=Array.from(randomBytes(5),byte=>alphabet[byte%alphabet.length]).join('');const[request]=await tx.insert(schema.studentRequests).values({institutionId:intent.institutionId,campusId:invoice.campusId,studentId:invoice.studentId,type:'payment_dispute',payload:{intent_id:intent.id,provider:intent.provider,provider_ref:intent.providerRef,amount_minor:intent.amount,occurred_at:new Date().toISOString()},payloadSchemaVersion:1,status:'submitted',humanCode:`PD-${suffix}`,assignedRole:'finance_admin',attachments:[],slaDueAt:new Date(Date.now()+2*86_400_000),paymentRequestId:invoice.id,submittedAt:new Date()}).returning();await tx.insert(schema.studentRequestEvents).values([{requestId:request!.id,institutionId:intent.institutionId,seq:1,eventType:'created',actorKind:'system',data:{intent_id:intent.id}},{requestId:request!.id,institutionId:intent.institutionId,seq:2,eventType:'submitted',actorKind:'system',data:{intent_id:intent.id}}]);await tx.update(schema.parentPaymentIntents).set({status:'debited_unconfirmed',disputeRequestId:request!.id,updatedAt:new Date()}).where(eq(schema.parentPaymentIntents.id,intent.id));return{id:request!.id,humanCode:request!.humanCode};});
    const[invoice]=await this.db.select({studentId:schema.feeInvoices.studentId,campusId:schema.feeInvoices.campusId,userId:schema.students.institutionUserId,email:schema.institutionUsers.email,fullName:schema.institutionUsers.fullName}).from(schema.feeInvoices).innerJoin(schema.students,eq(schema.students.id,schema.feeInvoices.studentId)).leftJoin(schema.institutionUsers,eq(schema.institutionUsers.id,schema.students.institutionUserId)).where(eq(schema.feeInvoices.id,intent.invoiceIds?.[0]??intent.feeInvoiceId)).limit(1);if(invoice?.userId)await this.todayNotify.dispatch({kind:'institutional',institutionId:intent.institutionId,campusId:invoice.campusId,institutionUserId:invoice.userId,studentId:invoice.studentId,email:invoice.email??'',fullName:invoice.fullName??'',lastAuthAt:null,permissions:[]},{eventKey:`fees:dispute:${result.id}:created`,type:'request_update',sourceModule:'fees',title:`Payment check raised · ${result.humanCode}`,body:'Your bank debit could not yet be confirmed. The fee office is checking it.',deepLink:`/requests?request=${result.id}`}).catch(()=>undefined);return result;
  }

  private async fulfillSystemRequest(requestId:string,note:string,data:Record<string,unknown>={}){const[request]=await this.db.select().from(schema.studentRequests).where(eq(schema.studentRequests.id,requestId)).limit(1);if(!request||['fulfilled','rejected','cancelled','expired'].includes(request.status))return;const eventSeq=await this.db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`request:${requestId}`}))`);const[seq]=await tx.select({value:sql<number>`coalesce(max(${schema.studentRequestEvents.seq}),0)::int`}).from(schema.studentRequestEvents).where(eq(schema.studentRequestEvents.requestId,requestId));const next=Number(seq?.value??0)+1;const[updated]=await tx.update(schema.studentRequests).set({status:'fulfilled',decisionNote:note,resolvedAt:new Date(),version:sql`${schema.studentRequests.version}+1`,updatedAt:new Date()}).where(and(eq(schema.studentRequests.id,requestId),sql`${schema.studentRequests.status} not in ('fulfilled','rejected','cancelled','expired')`)).returning();if(!updated)return null;await tx.insert(schema.studentRequestEvents).values({requestId,institutionId:request.institutionId,seq:next,eventType:'fulfilled',actorKind:'system',note,data}).onConflictDoNothing();return next;});if(eventSeq)await this.jobs.enqueue('notifications',REQUEST_NOTIFY_JOB,{institutionId:request.institutionId,requestId,eventSeq},{jobId:`request-notify-${requestId}-${eventSeq}`});}

  async resolveDispute(ctx:PortalActionContext,requestId:string,outcome:'captured'|'reversed',note:string){const[request]=await this.db.select().from(schema.studentRequests).where(and(eq(schema.studentRequests.id,requestId),eq(schema.studentRequests.institutionId,ctx.principal.institutionId),eq(schema.studentRequests.type,'payment_dispute'))).limit(1);if(!request)throw new NotFoundException({code:'DISPUTE_NOT_FOUND',message:'Payment dispute not found.'});const intentId=String(request.payload.intent_id??'');const[intent]=await this.db.select().from(schema.parentPaymentIntents).where(and(eq(schema.parentPaymentIntents.id,intentId),eq(schema.parentPaymentIntents.institutionId,ctx.principal.institutionId))).limit(1);if(!intent)throw new NotFoundException({code:'INTENT_NOT_FOUND',message:'Payment intent not found.'});if(outcome==='captured'){const result=await this.settleVerifiedIntent(intent,intent.providerRef??`staff:${requestId}`);if(!result.receipt)throw new ConflictException({code:'RECEIPT_PENDING',message:'The payment settled, but its receipt is not available yet. Refresh shortly.'});await this.write(ctx,'fee.dispute.captured','student_request',requestId,{receiptNo:result.receipt.receiptNo,note});return{outcome,receipt:result.receipt};}await this.db.update(schema.parentPaymentIntents).set({status:'failed',updatedAt:new Date(),version:intent.version+1}).where(and(eq(schema.parentPaymentIntents.id,intent.id),eq(schema.parentPaymentIntents.version,intent.version)));await this.fulfillSystemRequest(requestId,`Debit reversed · ${note}`,{outcome:'reversed'});await this.write(ctx,'fee.dispute.reversed','student_request',requestId,{note});return{outcome};}

  private async postWaiver(waiver: typeof schema.feeWaivers.$inferSelect) {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`fees:${waiver.institutionId}:${waiver.studentId}`}))`);
      await tx.insert(schema.feeInvoiceItems).values({ institutionId: waiver.institutionId, invoiceId: waiver.invoiceId, studentId: waiver.studentId, kind: 'waiver', category: 'other', label: waiver.label, amountMinor: -waiver.amountMinor, source: { waiver_id: waiver.id } });
      await tx.update(schema.feeInvoices).set({ amount: sql`${schema.feeInvoices.amount} - ${waiver.amountMinor}`, updatedAt: new Date() }).where(eq(schema.feeInvoices.id, waiver.invoiceId));
      await tx.update(schema.feeWaivers).set({ status: 'posted', version: sql`${schema.feeWaivers.version} + 1` }).where(eq(schema.feeWaivers.id, waiver.id));
    });
  }

  private async getConfig(institutionId: string) {
    const [row] = await this.db.select().from(schema.institutionFeeConfig).where(eq(schema.institutionFeeConfig.institutionId, institutionId)).limit(1);
    return row ?? { institutionId, partialPaymentAllowed: false, waiverTwoPersonThresholdMinor: 1_000_000, refundTwoPersonThresholdMinor: 500_000, duesBlock: { hall_ticket: false, result: false, tc: false, threshold_mode: 'any_overdue', grace_days: 0 }, reminderOffsets: [7, 3, 1], receiptTemplateRef: null, lateFeeRunHour: 2, bounceFeeMinor: 0, tallyLedgerMap: null, version: 0 };
  }

  private evaluateDues(raw: Record<string, unknown>, overdueMinor: number) {
    const triggered = raw.threshold_mode === 'amount_gte' ? overdueMinor >= Number(raw.threshold_minor ?? 0) : overdueMinor > 0;
    return { hallTicket: triggered && raw.hall_ticket === true, result: triggered && raw.result === true, tc: triggered && raw.tc === true };
  }

  private lateFeeProjection(invoice:typeof schema.feeInvoices.$inferSelect,raw:Record<string,unknown>|null){if(!invoice.dueDate||!raw||raw.mode==='none')return null;const grace=Number(raw.grace_days??0);const start=new Date(`${invoice.dueDate}T00:00:00Z`);start.setUTCDate(start.getUTCDate()+grace+1);const mode=String(raw.mode);const amount=mode==='flat'?Number(raw.amount_minor??0):mode==='percent'?Math.floor(invoice.amount*Number(raw.pct_bps??0)/10_000):Number(raw.per_day_minor??0);return{mode,startsOn:start.toISOString().slice(0,10),amountMinor:amount,capMinor:raw.cap_minor==null?null:Number(raw.cap_minor)};}

  private async currency(institutionId: string) {
    const [row] = await this.db.select({ currency: schema.institutions.currency }).from(schema.institutions).where(eq(schema.institutions.id, institutionId)).limit(1);
    return row?.currency ?? 'INR';
  }

  private intentResponse(row: typeof schema.parentPaymentIntents.$inferSelect, replayed: boolean) {
    return { intentId: row.id, provider: row.provider, providerRef: row.providerRef, amountMinor: row.amount, currency: row.currency, status: row.status, replayed, checkout: this.providers.byKey(row.provider)?.clientConfig?.() };
  }

  private async logGateway(args: { provider: string; providerEventId: string; eventType: string; payload: Record<string, unknown> }, institutionId: string | null, signatureValid: boolean, outcome: string) {
    await this.db.insert(schema.feeGatewayEvents).values({ institutionId, gateway: args.provider, providerEventId: args.providerEventId, eventType: args.eventType, payload: args.payload, signatureValid, outcome, processedAt: new Date() }).onConflictDoNothing();
  }

  private fyLabel(date = new Date()) { const y = date.getUTCFullYear(); const start = date.getUTCMonth() >= 3 ? y : y - 1; return `${start}-${String(start + 1).slice(-2)}`; }
  private csv(value:unknown){const raw=String(value??'');return /[,"\n]/.test(raw)?`"${raw.replaceAll('"','""')}"`:raw;}
  private xml(value:string){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
  private today() { return new Date().toISOString().slice(0, 10); }
  private async write(ctx: PortalActionContext, action: string, entityType: string, entityId: string, newState: Record<string, unknown>) {
    await this.audit.logAudit({ ...basePortalAudit(ctx), action, module: 'fees-engine', entityType, entityId, newState } as AuditEventInput);
  }
}
