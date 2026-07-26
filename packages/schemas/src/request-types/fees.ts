import { z } from 'zod';
import type { RequestTypeConfig } from './types';

export const feeWaiverRequestPayloadSchema=z.object({invoice_id:z.string().uuid(),requested_amount_minor:z.number().int().positive().optional(),reason:z.string().trim().min(10).max(1000)});
export type FeeWaiverRequestPayload=z.infer<typeof feeWaiverRequestPayloadSchema>;
export const feeWaiverRequestType:RequestTypeConfig<FeeWaiverRequestPayload>={key:'fee_waiver',label:'Fee waiver',humanCodePrefix:'FW',category:'fees',payloadSchema:feeWaiverRequestPayloadSchema,payloadSchemaVersion:1,routing:{role:'finance_admin'},slaDays:5,cancellableStatuses:['submitted','needs_info'],requiresPayment:false,producesDocument:false,bulkApprovable:false,approvalSideEffectKey:'fee_waiver',notifications:{fulfilled:{title:'{label} {code} completed',body:'Your fee account has been updated.'}},summaryLine:p=>`Waiver request · ${p.invoice_id}`};

export const paymentDisputePayloadSchema=z.object({intent_id:z.string().uuid(),provider:z.string().min(1),provider_ref:z.string().min(1),amount_minor:z.number().int().positive(),occurred_at:z.string().datetime()});
export type PaymentDisputePayload=z.infer<typeof paymentDisputePayloadSchema>;
export const paymentDisputeRequestType:RequestTypeConfig<PaymentDisputePayload>={key:'payment_dispute',label:'Payment dispute',humanCodePrefix:'PD',category:'fees',payloadSchema:paymentDisputePayloadSchema,payloadSchemaVersion:1,routing:{role:'finance_admin'},slaDays:2,cancellableStatuses:[],requiresPayment:false,producesDocument:false,bulkApprovable:false,approvalSideEffectKey:'payment_dispute',notifications:{fulfilled:{title:'{label} {code} resolved',body:'The fee office resolved your payment dispute.'}},summaryLine:p=>`${p.provider} · ${p.amount_minor}`};
