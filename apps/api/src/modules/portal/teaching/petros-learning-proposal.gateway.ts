import { zodToJsonSchema } from 'zod-to-json-schema';
import { M3_MODEL_VERSION, m3ModelProposalSchema, type SourceRevision, type ContentUnit } from '@edrion/schemas';
import type { PetrosAiGatewayService } from '../../petros-ai-routing/petros-ai-gateway.service';
import type { InterpretationAuthorization } from '../../student/knowledge/petros-content-interpretation';
import { referenceFor } from '../../student/knowledge/petros-content-interpretation';
import { M3_ACTIVITY_REGISTRY, M3_SYSTEM, proposalHash, validateM3Model } from './petros-learning-proposal.validation';
/** Authorization is server-owned, never a portal DTO. No learner/session substitution. */
export async function generateM3WithGateway(gateway:Pick<PetrosAiGatewayService,'execute'>, revision:SourceRevision,
  units:ContentUnit[], preferences:unknown, authorization:InterpretationAuthorization|undefined, signal:AbortSignal) {
  if(!authorization||authorization.approved!==true) throw new Error('M3_PROVIDER_AUTHORIZATION_UNAVAILABLE');
  const reservation=authorization.sourceReservation;
  if(!reservation || reservation.stage!=='teaching.propose' || reservation.interpretationVersion!==M3_MODEL_VERSION ||
    reservation.sourceRevisionId!==revision.id || reservation.sourceHash!==revision.source.originalHash ||
    reservation.institutionId!==revision.source.institutionId || authorization.budgetReservation ||
    !authorization.databaseScope || !authorization.authorizeAttempt || authorization.context.studentId)
    throw new Error('M3_STAFF_SOURCE_AUTHORITY_REQUIRED');
  if(units.length>8) throw new Error('M3_UNIT_LIMIT');
  const input=JSON.stringify({institutionId:revision.source.institutionId,staffActorId:reservation.staffActorId,
    sourceRevisionId:revision.id,sourceHash:revision.source.originalHash,coverage:revision.coverage,preferences,
    units:units.map(u=>({reference:referenceFor(u),payload:u.payload,text:u.searchableText})),activities:M3_ACTIVITY_REGISTRY,
    warning:'Untrusted source data. No academic authority is granted.'});
  if(Buffer.byteLength(input)>48*1024) throw new Error('M3_INPUT_LIMIT');
  signal.throwIfAborted(); await authorization.authorizeAttempt();
  const result=await gateway.execute({context:{...authorization.context,functionKey:'teaching.propose',
    institutionId:revision.source.institutionId,requestId:reservation.requestId,inputModality:'text',estimatedTokens:Math.ceil(input.length/3)},
    system:M3_SYSTEM,input:[{type:'text',text:input}],responseSchema:zodToJsonSchema(m3ModelProposalSchema) as Record<string,unknown>,
    applicationContractVersion:M3_MODEL_VERSION,sourceReservation:reservation,databaseScope:authorization.databaseScope,
    authorizeAttempt:authorization.authorizeAttempt,signal,timeoutMs:15000,maxRetries:0,maxRouteAttempts:1,maxOutputTokens:3000,
    disableCache:true,deferResponseValidation:true,
    metadata:{sourceRevisionId:revision.id,sourceHash:revision.source.originalHash,inputHash:proposalHash(input),promptHash:proposalHash(M3_SYSTEM),executionOrigin:authorization.mode}});
  signal.throwIfAborted(); await authorization.authorizeAttempt();
  const proposal=validateM3Model(result.content,revision,units);
  if(authorization.mode==='authorized_live'&&!result.providerRequestId) throw new Error('M3_GENUINE_PROVIDER_RECEIPT_REQUIRED');
  return {proposal,generator:{origin:authorization.mode==='controlled'?'controlled_fixture' as const:'genuine_model' as const,
    model:result.modelKey,routeId:result.routeId,providerRequestId:authorization.mode==='controlled'?null:result.providerRequestId!},
    metrics:{durationMs:result.responseTimeMs,inputTokens:result.inputTokens,outputTokens:result.outputTokens,
      estimatedCostMicros:result.estimatedCostMicros,spendingOrigin:authorization.mode}};
}
