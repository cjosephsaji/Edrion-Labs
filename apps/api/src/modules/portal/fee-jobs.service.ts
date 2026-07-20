import { createHash } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { and, eq, inArray, lt, runInInstitutionTenant, schema, sql, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import { JobsService } from '../../common/queue/jobs.service';
import { QueueWorkers } from '../../common/queue/queue.worker';
import { JobTracker } from '../../common/queue/job-tracker.service';
import { RENDER_JOB } from '../documents/documents-gen.service';
import { FEE_DEMAND_GENERATION_JOB, FEE_GATEWAY_EVENT_JOB, FEE_RECEIPT_RENDER_JOB, FeeLedgerService, type FeeDemandGenerationJobData } from './fee-ledger.service';
import { TodayNotifyService } from '../student/today/today-notify.service';
import { institutionNow } from './institution-clock';

export const FEE_RECEIPT_COMPLETE_JOB = 'fees.receipt_render_completed';
export const FEE_MAINTENANCE_JOB = 'fees.maintenance';

/** Existing BullMQ/report infrastructure handles receipts and hourly institution-aware maintenance. */
@Injectable()
export class FeeJobsService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly tracker: JobTracker,
    private readonly todayNotify: TodayNotifyService,
    private readonly ledger:FeeLedgerService,
  ) {}

  async onModuleInit() {
    this.workers.register(FEE_RECEIPT_RENDER_JOB, (job: Job) => this.startReceiptRender(job.data as { institutionId: string; receiptId: string }));
    this.workers.register(FEE_RECEIPT_COMPLETE_JOB, (job: Job) => this.completeReceiptRender(job.data as { institutionId: string; renderId: string }));
    this.workers.register(FEE_MAINTENANCE_JOB, () => this.tracker.run(FEE_MAINTENANCE_JOB, 'maintenance', async () => {
      const result = await this.maintenance();
      return { itemsProcessed: result.overdue + result.lateFeeItems + result.expiredIntents + result.expiredPayableRequests, detail: result };
    }));
    this.workers.register(FEE_GATEWAY_EVENT_JOB,(job:Job)=>this.tracker.run(FEE_GATEWAY_EVENT_JOB,'payments',async()=>{await this.ledger.settleProviderEvent(job.data as Parameters<FeeLedgerService['settleProviderEvent']>[0],false);return{itemsProcessed:1};}));
    this.workers.register(FEE_DEMAND_GENERATION_JOB,(job:Job)=>{const data=job.data as FeeDemandGenerationJobData;return this.tracker.run(FEE_DEMAND_GENERATION_JOB,'billing-sync',async()=>{const result=await runInInstitutionTenant(this.db,data.institutionId,()=>this.ledger.generateInvoiceChunk(data));return{itemsProcessed:result.created+result.skipped,detail:{...result,batchId:data.batchId}};});});
    await this.jobs.schedule('maintenance', FEE_MAINTENANCE_JOB, 60 * 60 * 1000);
  }

  async startReceiptRender(data: { institutionId: string; receiptId: string }) {
    return runInInstitutionTenant(this.db, data.institutionId, async () => {
      const [receipt] = await this.db.select().from(schema.feeReceipts).where(eq(schema.feeReceipts.id, data.receiptId)).limit(1);
      if (!receipt) throw new Error(`Receipt ${data.receiptId} is not committed yet`);
      if (receipt.pdfStorageRef) return { ok: true, alreadyRendered: true };
      const [existing] = await this.db.select().from(schema.documentRenders).where(sql`${schema.documentRenders.payload}->>'fee_receipt_id' = ${receipt.id}`).limit(1);
      let renderId = existing?.id;
      if (!renderId) {
        const [render] = await this.db.insert(schema.documentRenders).values({
          institutionId: data.institutionId, templateId: null, docType: 'fee_receipt',
          requestedBy: receipt.issuedBy ?? receipt.id, title: `Fee receipt ${receipt.receiptNo}`,
          payload: { fee_receipt_id: receipt.id, receipt: { number: receipt.receiptNo, amount_minor: receipt.amountMinor, method: receipt.method, issued_at: receipt.issuedAt, lines: receipt.lineSnapshot } },
        }).returning();
        renderId = render!.id;
      }
      await this.jobs.enqueue('reports', RENDER_JOB, { renderId }, { jobId: `document-render-${renderId}` });
      return { ok: true, renderId };
    });
  }

  async completeReceiptRender(data: { institutionId: string; renderId: string }) {
    return runInInstitutionTenant(this.db, data.institutionId, async () => {
      const [render] = await this.db.select().from(schema.documentRenders).where(eq(schema.documentRenders.id, data.renderId)).limit(1);
      const receiptId = typeof render?.payload?.fee_receipt_id === 'string' ? render.payload.fee_receipt_id : null;
      const statementStudentId=typeof render?.payload?.fee_statement_student_id==='string'?render.payload.fee_statement_student_id:null;
      if (!render || (!receiptId&&!statementStudentId) || render.status !== 'done' || !render.storagePath) throw new Error('Fee document render is not complete');
      if(statementStudentId){const verifyCode=createHash('sha256').update(render.id).digest('base64url').slice(0,12).toUpperCase();const [vault]=await this.db.insert(schema.studentDocumentVault).values({institutionId:render.institutionId,studentId:statementStudentId,documentRenderId:render.id,title:render.title,docType:'fee_statement',verifyCode,issuedBy:null}).onConflictDoNothing().returning();return{ok:true,statement:true,vaultId:vault?.id};}
      if (!receiptId) throw new Error('Receipt id is missing');
      const [receipt] = await this.db.select().from(schema.feeReceipts).where(eq(schema.feeReceipts.id, receiptId)).limit(1);
      if (!receipt) throw new Error('Receipt no longer exists');
      const verifyCode = createHash('sha256').update(receipt.id).digest('base64url').slice(0, 12).toUpperCase();
      const [vault] = await this.db.insert(schema.studentDocumentVault).values({
        institutionId: receipt.institutionId, studentId: receipt.studentId, documentRenderId: render.id,
        title: `Fee receipt ${receipt.receiptNo}`, docType: 'fee_receipt', verifyCode, issuedBy: receipt.issuedBy,
      }).onConflictDoNothing().returning();
      const vaultId = vault?.id ?? (await this.db.select({ id: schema.studentDocumentVault.id }).from(schema.studentDocumentVault).where(eq(schema.studentDocumentVault.documentRenderId, render.id)).limit(1))[0]?.id;
      await this.db.update(schema.feeReceipts).set({ pdfStorageRef: render.storagePath, vaultDocumentId: vaultId }).where(eq(schema.feeReceipts.id, receipt.id));
      return { ok: true, receiptId, vaultId };
    });
  }

  async maintenance() {
    const institutions = await this.db.select({ id: schema.institutions.id }).from(schema.institutions);
    let overdue = 0; let lateFeeItems = 0; let expiredIntents = 0; let expiredPayableRequests = 0;
    for (const institution of institutions) {
      const result = await runInInstitutionTenant(this.db, institution.id, () => this.maintainInstitution(institution.id));
      overdue += result.overdue; lateFeeItems += result.lateFeeItems; expiredIntents += result.expiredIntents; expiredPayableRequests += result.expiredPayableRequests;
    }
    return { overdue, lateFeeItems, expiredIntents, expiredPayableRequests };
  }

  private async maintainInstitution(institutionId: string) {
    const [[institution], [config]] = await Promise.all([
      this.db.select({ timezone: schema.institutions.timezone }).from(schema.institutions).where(eq(schema.institutions.id, institutionId)).limit(1),
      this.db.select().from(schema.institutionFeeConfig).where(eq(schema.institutionFeeConfig.institutionId, institutionId)).limit(1),
    ]);
    const wall = institutionNow(institution?.timezone ?? 'UTC');
    const today = wall.date;
    const shouldRunLateFees = Number(wall.time.slice(0, 2)) === (config?.lateFeeRunHour ?? 2);
    const stale = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stalePayableRequest = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const expired = await this.db.update(schema.parentPaymentIntents).set({ status: 'expired' }).where(and(
      eq(schema.parentPaymentIntents.institutionId, institutionId), inArray(schema.parentPaymentIntents.status, ['initiated','pending']), lt(schema.parentPaymentIntents.createdAt, stale),
    )).returning({ id: schema.parentPaymentIntents.id });
    const payableRequests=await this.db.select().from(schema.studentRequests).where(and(eq(schema.studentRequests.institutionId,institutionId),eq(schema.studentRequests.status,'draft'),sql`${schema.studentRequests.paymentRequestId} is not null`,lt(schema.studentRequests.createdAt,stalePayableRequest)));
    let expiredPayableRequests=0;
    for(const request of payableRequests){await this.db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`request:${request.id}`}))`);const[updated]=await tx.update(schema.studentRequests).set({status:'cancelled',decisionNote:'Payment not completed',resolvedAt:new Date(),version:request.version+1,updatedAt:new Date()}).where(and(eq(schema.studentRequests.id,request.id),eq(schema.studentRequests.version,request.version),eq(schema.studentRequests.status,'draft'))).returning();if(!updated)return;await tx.update(schema.feeInvoices).set({status:'cancelled',updatedAt:new Date()}).where(and(eq(schema.feeInvoices.id,request.paymentRequestId!),eq(schema.feeInvoices.amountPaid,0)));const[seq]=await tx.select({value:sql<number>`coalesce(max(${schema.studentRequestEvents.seq}),0)::int`}).from(schema.studentRequestEvents).where(eq(schema.studentRequestEvents.requestId,request.id));await tx.insert(schema.studentRequestEvents).values({requestId:request.id,institutionId,eventType:'cancelled',seq:Number(seq?.value??0)+1,actorKind:'system',note:'Payment not completed',data:{reason:'payment_timeout'}});expiredPayableRequests+=1;});}
    const invoices = await this.db.select().from(schema.feeInvoices).where(and(
      eq(schema.feeInvoices.institutionId, institutionId), lt(schema.feeInvoices.dueDate, today), inArray(schema.feeInvoices.status, ['pending','partial','overdue']),
    ));
    let lateFeeItems = 0;
    for (const invoice of invoices) {
      await this.db.update(schema.feeInvoices).set({ status: 'overdue', updatedAt: new Date() }).where(eq(schema.feeInvoices.id, invoice.id));
      if (!shouldRunLateFees || !invoice.feeStructureId) continue;
      const [version] = await this.db.select().from(schema.feeStructureVersions).where(and(eq(schema.feeStructureVersions.structureId, invoice.feeStructureId), eq(schema.feeStructureVersions.versionNo, invoice.structureVersionNo ?? 1))).limit(1);
      const policy = version?.lateFeePolicy as { mode?: string; amount_minor?: number; pct_bps?: number; per_day_minor?: number; grace_days?: number; cap_minor?: number | null } | null;
      if (!policy || policy.mode === 'none' || !invoice.dueDate) continue;
      const days = Math.max(0, Math.floor((Date.now() - Date.parse(invoice.dueDate)) / 86_400_000) - (policy.grace_days ?? 0));
      let target = policy.mode === 'flat' ? (days > 0 ? policy.amount_minor ?? 0 : 0) : policy.mode === 'percent' ? (days > 0 ? Math.floor(invoice.amount * (policy.pct_bps ?? 0) / 10_000) : 0) : days * (policy.per_day_minor ?? 0);
      if (policy.cap_minor != null) target = Math.min(target, policy.cap_minor);
      const prior = await this.db.select({ value: sql<number>`coalesce(sum(${schema.feeInvoiceItems.amountMinor}),0)` }).from(schema.feeInvoiceItems).where(and(eq(schema.feeInvoiceItems.invoiceId, invoice.id), eq(schema.feeInvoiceItems.kind, 'late_fee')));
      const delta = target - Number(prior[0]?.value ?? 0);
      if (delta <= 0) continue;
      await this.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`fees:late:${invoice.id}`}))`);
        const recheck = await tx.select({ value: sql<number>`coalesce(sum(${schema.feeInvoiceItems.amountMinor}),0)` }).from(schema.feeInvoiceItems).where(and(eq(schema.feeInvoiceItems.invoiceId, invoice.id), eq(schema.feeInvoiceItems.kind, 'late_fee')));
        const lockedDelta = target - Number(recheck[0]?.value ?? 0);
        if (lockedDelta <= 0) return;
        await tx.insert(schema.feeInvoiceItems).values({ institutionId, invoiceId: invoice.id, studentId: invoice.studentId, kind: 'late_fee', category: 'other', label: `Late fee (${days} days)`, amountMinor: lockedDelta, source: { accrued_through: today, days } });
        await tx.update(schema.feeInvoices).set({ amount: sql`${schema.feeInvoices.amount} + ${lockedDelta}`, updatedAt: new Date() }).where(eq(schema.feeInvoices.id, invoice.id));
        lateFeeItems += 1;
      });
    }
    const offsets=config?.reminderOffsets??[7,3,1];
    const reminderInvoices=await this.db.select({id:schema.feeInvoices.id,studentId:schema.feeInvoices.studentId,campusId:schema.feeInvoices.campusId,dueDate:schema.feeInvoices.dueDate,amount:schema.feeInvoices.amount,amountPaid:schema.feeInvoices.amountPaid,userId:schema.students.institutionUserId}).from(schema.feeInvoices).innerJoin(schema.students,eq(schema.students.id,schema.feeInvoices.studentId)).where(and(eq(schema.feeInvoices.institutionId,institutionId),inArray(schema.feeInvoices.status,['pending','partial','overdue'])));
    for(const invoice of reminderInvoices){if(!invoice.dueDate||!invoice.userId)continue;const days=Math.ceil((Date.parse(invoice.dueDate)-Date.parse(today))/86_400_000);const offset=days<0?-1:days;if(!offsets.includes(offset)&&offset!==-1)continue;await this.todayNotify.dispatch({kind:'institutional',institutionId,campusId:invoice.campusId,institutionUserId:invoice.userId,studentId:invoice.studentId,email:'',fullName:'',lastAuthAt:null,permissions:[]},{eventKey:`fees:reminder:${invoice.id}:${offset}`,type:'nudge',sourceModule:'fees',title:offset<0?'Fee payment overdue':'Fee payment due soon',body:`Outstanding amount ${(invoice.amount-invoice.amountPaid)/100}.`,deepLink:'/fees'});}
    return { overdue: invoices.length, lateFeeItems, expiredIntents: expired.length, expiredPayableRequests };
  }
}
