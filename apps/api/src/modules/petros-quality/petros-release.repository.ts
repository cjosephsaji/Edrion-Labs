import { Inject, Injectable, Optional } from '@nestjs/common';
import { and, desc, eq, runInDatabaseTransaction, schema, sql, type Database } from '@edrion/database';
import type { PetrosProductionQualityReport, PetrosReleaseBundle } from '@edrion/schemas';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, DATABASE } from '../../common/tokens';

@Injectable()
export class PetrosReleaseRepository {
  constructor(@Inject(DATABASE) private readonly db: Database, @Optional() @Inject(API_ENV) private readonly env?: ApiEnv) {}
  atomic<T>(fn: () => Promise<T>) {
    return runInDatabaseTransaction(this.db, async () => {
      await this.db.execute(sql`select pg_advisory_xact_lock(hashtext('petros.release.control'))`);
      return fn();
    });
  }
  report(id: string) { return this.db.select().from(schema.petrosReleaseEvaluations).where(eq(schema.petrosReleaseEvaluations.id,id)).limit(1).then(r=>r[0]); }
  bundle(id: string) { return this.db.select().from(schema.petrosReleaseBundles).where(eq(schema.petrosReleaseBundles.id,id)).limit(1).then(r=>r[0]); }
  disabled(id: string) { return this.db.select().from(schema.petrosReleaseDisables).where(eq(schema.petrosReleaseDisables.releaseId,id)).limit(1).then(r=>r[0]); }
  list() { return this.db.select().from(schema.petrosReleaseBundles).orderBy(desc(schema.petrosReleaseBundles.createdAt)).limit(100); }
  importReport(report: PetrosProductionQualityReport, digest: string) { return this.db.insert(schema.petrosReleaseEvaluations).values({id:report.id,report,digest}).returning().then(r=>r[0]!); }
  register(manifest: PetrosReleaseBundle, digest: string) { return this.db.insert(schema.petrosReleaseBundles).values({id:manifest.id,evaluationId:manifest.evaluationId,manifest,digest}).returning().then(r=>r[0]!); }
  disable(id: string, releaseId: string, digest: string) { return this.db.insert(schema.petrosReleaseDisables).values({id,releaseId,digest}).returning().then(r=>r[0]!); }
  runtimeRelease(functionId:string,versionId:string) {
    return this.db.execute<{manifest:PetrosReleaseBundle;digest:string;report:PetrosProductionQualityReport;report_digest:string;disabled:boolean}>(sql`select * from edrion_petros_runtime_release(${functionId}::uuid,${versionId}::uuid)`).then(r=>r[0]);
  }
  activeVersion(functionId:string) {return this.db.select().from(schema.petrosAiFunctionVersions).where(and(eq(schema.petrosAiFunctionVersions.functionId,functionId),eq(schema.petrosAiFunctionVersions.status,'active'))).limit(1).for('share').then(r=>r[0]);}
  async version(functionId: string, id: string) {
    return this.db.select().from(schema.petrosAiFunctionVersions).where(and(eq(schema.petrosAiFunctionVersions.id,id),eq(schema.petrosAiFunctionVersions.functionId,functionId))).limit(1).for('share').then(r=>r[0]);
  }
  /** Locks the exact dispatch semantics, excluding credentials and display-only fields. */
  async configuration(functionId: string) {
    const [fn] = await this.db.select().from(schema.petrosAiFunctions).where(eq(schema.petrosAiFunctions.id,functionId)).limit(1).for('share');
    if (!fn) return null;
    const routes=await this.db.select().from(schema.petrosAiFunctionRoutes).where(eq(schema.petrosAiFunctionRoutes.functionId,functionId)).for('share');
    const bound=[];
    for(const r of routes.sort((a,b)=>a.id.localeCompare(b.id))) {
      const [provider]=await this.db.select().from(schema.petrosAiProviders).where(eq(schema.petrosAiProviders.id,r.providerId)).limit(1).for('share');
      const [model]=await this.db.select().from(schema.petrosAiModels).where(eq(schema.petrosAiModels.id,r.modelId)).limit(1).for('share');
      if(!provider||!model) return null;
      bound.push({providerId:r.providerId,modelId:r.modelId,tier:r.tier,trafficPercent:r.trafficPercent,enabled:r.enabled,overrides:r.overrides,
        provider:{version:provider.version,key:provider.key,adapterType:provider.adapterType,baseUrl:provider.baseUrl,enabled:provider.enabled,paused:provider.paused,priority:provider.priority,capabilities:provider.capabilities,dailyBudgetMicros:provider.dailyBudgetMicros,monthlyBudgetMicros:provider.monthlyBudgetMicros},
        model:{version:model.version,modelKey:model.modelKey,enabled:model.enabled,capabilities:model.capabilities,pricing:model.pricing,providerOptions:model.providerOptions,contextWindow:model.contextWindow,maxOutputTokens:model.maxOutputTokens}});
    }
    const rules=(await this.db.select().from(schema.petrosAiRoutingRules).for('share'))
      .filter(r=>r.functionId===null||r.functionId===functionId).sort((a,b)=>a.id.localeCompare(b.id))
      .map(r=>({id:r.id,functionId:r.functionId,priority:r.priority,enabled:r.enabled,conditions:r.conditions,action:r.action,version:r.version}));
    const budgets=(await this.db.select().from(schema.petrosAiBudgetPolicies).for('share')).sort((a,b)=>a.id.localeCompare(b.id))
      .map(b=>({id:b.id,scope:b.scope,scopeId:b.scopeId,monthlyBudgetMicros:b.monthlyBudgetMicros,dailyBudgetMicros:b.dailyBudgetMicros,thresholds:b.thresholds,preserveEssentialFunctions:b.preserveEssentialFunctions,enabled:b.enabled,version:b.version}));
    return {phase6Admissions:{multiSource:!!this.env?.PETROS_MULTI_SOURCE_ENABLED,teacherAuthoring:!!this.env?.PETROS_TEACHER_AUTHORING_ENABLED,advancedModels:!!this.env?.PETROS_ADVANCED_MODELS_ENABLED},rules,budgets,functionId,key:fn.key,enabled:fn.enabled,allowedInputTypes:fn.allowedInputTypes,responseFormat:fn.responseFormat,requiredCapabilities:fn.requiredCapabilities,settings:fn.settings,routes:bound};
  }
}
