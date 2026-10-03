import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { ApiEnv } from '@edrion/config';
import type { AuditWriter } from '@edrion/audit';
import { petrosProductionQualityReportSchema, petrosReleaseBundleSchema, petrosReleaseIdentitiesSchema,
  type PetrosReleaseBundle } from '@edrion/schemas';
import { RiskLevel } from '@edrion/shared-types';
import { API_ENV, AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { PetrosReleaseRepository } from './petros-release.repository';

/** Canonical digest avoids JSON-key ordering changing an immutable receipt. */
export function releaseDigest(value: unknown): string {
  function canonical(v: unknown): string {
    if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
    if(v && typeof v==='object') return `{${Object.keys(v).sort().filter(k=>(v as Record<string,unknown>)[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonical((v as Record<string,unknown>)[k])}`).join(',')}}`;
    return JSON.stringify(v) ?? 'null';
  }
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export function promptIdentity(v: {id:string;functionId:string;promptVersion:string;schemaVersion:string;promptTemplate:string;responseSchema:unknown}) {
  return {id:v.id,functionId:v.functionId,promptVersion:v.promptVersion,schemaVersion:v.schemaVersion,promptTemplate:v.promptTemplate,responseSchema:v.responseSchema};
}
function deny(code: string): never { throw new ConflictException({code,message:'Release gate is unavailable, stale or does not match the current evaluated configuration. Keep admissions disabled and review the release evidence.'}); }

@Injectable()
export class PetrosReleaseService {
  constructor(private readonly repo: PetrosReleaseRepository, @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter) {}

  async importReport(raw: unknown, reason: string, ctx: ActionContext) {
    const parsed=petrosProductionQualityReportSchema.safeParse(raw); if(!parsed.success) deny('PETROS_RELEASE_REPORT_INVALID');
    const report=parsed.data,digest=releaseDigest(report);
    return this.repo.atomic(async()=>{
      const old=await this.repo.report(report.id);
      if(old) { if(old.digest!==digest) deny('PETROS_RELEASE_REPORT_CONFLICT'); return {id:old.id,digest:old.digest,duplicate:true}; }
      await this.repo.importReport(report,digest);
      await this.write(ctx,'petros.release.report_imported',report.id,reason,{digest,engineeringOnly:true});
      return {id:report.id,digest,duplicate:false};
    });
  }

  async register(raw: unknown, reason: string, ctx: ActionContext) {
    const parsed=petrosReleaseBundleSchema.safeParse(raw);if(!parsed.success) deny('PETROS_RELEASE_BUNDLE_INVALID');
    const bundle=parsed.data,digest=releaseDigest(bundle);
    return this.repo.atomic(async()=>{
      const old=await this.repo.bundle(bundle.id);
      if(old) { if(old.digest!==digest) deny('PETROS_RELEASE_BUNDLE_CONFLICT'); await this.assertBundle(old.manifest); return {id:old.id,digest,duplicate:true,admissions:'disabled'}; }
      await this.assertBundle(bundle);
      await this.repo.register(bundle,digest);
      await this.write(ctx,'petros.release.registered',bundle.id,reason,{digest,evaluationId:bundle.evaluationId,admissions:'disabled'});
      return {id:bundle.id,digest,duplicate:false,admissions:'disabled'};
    });
  }

  /** Administrative prompt activation is a single atomic gate+effect+audit transaction. */
  activation<T>(functionId: string, versionId: string, effect: () => Promise<T>) {
    return this.repo.atomic(async()=>{
      for(const record of await this.repo.list()) {
        if(record.manifest.functions.some(f=>f.functionId===functionId&&(f.versionId===versionId||f.rollbackVersionId===versionId))) {
          const rollback=record.manifest.functions.some(f=>f.functionId===functionId&&f.rollbackVersionId===versionId);
          await this.assertBundle(record.manifest,undefined,rollback);
          return effect();
        }
      }
      deny('PETROS_RELEASE_REQUIRED');
    });
  }

  async disable(id: string, commandId: string, reason: string, ctx: ActionContext) {
    const digest=releaseDigest({id,commandId,reason});
    return this.repo.atomic(async()=>{
      if(!await this.repo.bundle(id)) deny('PETROS_RELEASE_NOT_FOUND');
      const old=await this.repo.disabled(id);
      if(old) { if(old.id!==commandId||old.digest!==digest) deny('PETROS_RELEASE_DISABLE_CONFLICT'); return {releaseId:id,disabled:true,duplicate:true}; }
      await this.repo.disable(commandId,id,digest);
      await this.write(ctx,'petros.release.disabled',id,reason,{commandId,admissions:'disabled',evidencePreserved:true});
      return {releaseId:id,disabled:true,duplicate:false};
    });
  }

  /** Built-in versions retain compatibility; released versions recheck before every dispatch. */
  assertRuntimeVersion(functionId:string,versionId:string) {
    return this.repo.atomic(async()=>{
      const record=await this.repo.runtimeRelease(functionId,versionId);
      if(!record) return;
      const parsed=petrosReleaseBundleSchema.safeParse(record.manifest);
      if(!parsed.success||releaseDigest(parsed.data)!==record.digest) deny('PETROS_RELEASE_BUNDLE_INVALID');
      const active=await this.repo.activeVersion(functionId);
      if(!active||active.id!==versionId) deny('PETROS_RELEASE_PROMPT_STALE');
      const rollback=parsed.data.functions.some(f=>f.functionId===functionId&&f.rollbackVersionId===versionId);
      await this.assertBundle(parsed.data,{report:record.report,digest:record.report_digest,disabled:record.disabled},rollback);
    });
  }

  async status() {
    const current=this.currentIdentities();
    const releases: Array<{id:string;digest:string;evaluationId:string;createdAt:string;expiresAt:string;identities:PetrosReleaseBundle['identities'];gate:string;admissions:string;externalAcceptance:string}>=[];
    // Checks require a transaction for read locks; output contains references/digests only.
    await this.repo.atomic(async()=>{
      for(const row of await this.repo.list()) {
        let gate='pass';try{await this.assertBundle(row.manifest);}catch(e){gate=(e instanceof ConflictException?(e.getResponse() as {code:string}).code:'unavailable');}
        releases.push({id:row.id,digest:row.digest,evaluationId:row.evaluationId,createdAt:row.manifest.createdAt,expiresAt:row.manifest.expiresAt,identities:row.manifest.identities,gate,admissions:'disabled',externalAcceptance:'pending'});
      }
    });
    return {schemaVersion:'petros.release-status.v1',configured:!!current,currentIdentities:current,releases,admissions:'disabled',pilotAcceptance:'pending'};
  }

  private currentIdentities() {
    try { const p=petrosReleaseIdentitiesSchema.safeParse(JSON.parse(this.env.PETROS_RELEASE_IDENTITIES_JSON??'null'));return p.success?p.data:null; }catch{return null;}
  }
  private async assertBundle(bundle: PetrosReleaseBundle, runtime?:{report:unknown;digest:string;disabled:boolean}, rollback=false) {
    const now=Date.now(),current=this.currentIdentities();
    if(!current) deny('PETROS_RELEASE_IDENTITY_UNCONFIGURED');
    if(releaseDigest(current)!==releaseDigest(bundle.identities)) deny('PETROS_RELEASE_IDENTITY_STALE');
    if(Date.parse(bundle.createdAt)>now||Date.parse(bundle.expiresAt)<=now) deny('PETROS_RELEASE_EXPIRED');
    if(!rollback&&(runtime?runtime.disabled:await this.repo.disabled(bundle.id))) deny('PETROS_RELEASE_DISABLED');
    const stored=runtime??await this.repo.report(bundle.evaluationId);
    if(!stored) deny('PETROS_RELEASE_REPORT_MISSING');
    const p=petrosProductionQualityReportSchema.safeParse(stored.report);if(!p.success||releaseDigest(p.data)!==stored.digest) deny('PETROS_RELEASE_REPORT_INVALID');
    const r=p.data;
    if(releaseDigest(r.identities)!==releaseDigest(bundle.identities)) deny('PETROS_RELEASE_REPORT_MISMATCH');
    if(Date.parse(r.createdAt)>now||Date.parse(r.expiresAt)<=now||Date.parse(bundle.expiresAt)>Date.parse(r.expiresAt)) deny('PETROS_RELEASE_REPORT_EXPIRED');
    if(r.checks.some(c=>c.status!=='pass')||r.accounting.costMicros>r.accounting.maxCostMicros) deny('PETROS_RELEASE_QUALITY_FAILED');
    const promptHashes=[],configHashes=[];
    for(const f of bundle.functions) {
      const candidate=await this.repo.version(f.functionId,f.versionId),rollback=await this.repo.version(f.functionId,f.rollbackVersionId);
      if(!candidate||!rollback) deny('PETROS_RELEASE_ROLLBACK_MISSING');
      if(releaseDigest(promptIdentity(candidate))!==f.candidateSha256||releaseDigest(promptIdentity(rollback))!==f.rollbackSha256) deny('PETROS_RELEASE_PROMPT_STALE');
      const cfg=await this.repo.configuration(f.functionId);
      if(!cfg||releaseDigest(cfg)!==f.configurationSha256) deny('PETROS_RELEASE_CONFIGURATION_STALE');
      promptHashes.push({functionId:f.functionId,candidateSha256:f.candidateSha256,rollbackSha256:f.rollbackSha256});
      configHashes.push({functionId:f.functionId,configurationSha256:f.configurationSha256});
    }
    if(releaseDigest(promptHashes.sort((a,b)=>a.functionId.localeCompare(b.functionId)))!==bundle.identities.promptSchema ||
      releaseDigest(configHashes.sort((a,b)=>a.functionId.localeCompare(b.functionId)))!==bundle.identities.modelRouting) deny('PETROS_RELEASE_MANIFEST_MISMATCH');
  }
  private write(ctx:ActionContext,action:string,id:string,reason:string,state:Record<string,unknown>) {
    return this.audit.logAudit({...baseAudit(ctx),action,module:'petros-quality',entityType:'petros_release',entityId:id,reason,riskLevel:RiskLevel.High,newState:state} as Parameters<AuditWriter['logAudit']>[0]);
  }
}
