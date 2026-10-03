import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { eq, runInStudentTenant, schema } from '@edrion/database';
import { AuditWriter } from '@edrion/audit';
import type { PetrosProductionQualityReport } from '@edrion/schemas';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../../common/action-context';
import { PetrosAiGatewayService } from '../petros-ai-routing/petros-ai-gateway.service';
import { PetrosAiRoutingRepository } from '../petros-ai-routing/petros-ai-routing.repository';
import { PetrosAiRoutingService } from '../petros-ai-routing/petros-ai-routing.service';
import { PetrosReleaseRepository } from '../petros-quality/petros-release.repository';
import { PetrosReleaseService, promptIdentity, releaseDigest } from '../petros-quality/petros-release.service';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';

const digest = (value: string) => value.repeat(64);
const gates = ['sources','teaching','evidence','memory','recommendations','institutional','recovery','visuals'] as const;

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Petros Phase 5 release fence at real gateway / disposable PostgreSQL', () => {
  let db: Phase2TestDatabase;
  let releaseRepo: PetrosReleaseRepository;
  let release: PetrosReleaseService;
  let routingRepo: PetrosAiRoutingRepository;
  let routing: PetrosAiRoutingService;
  let gateway: PetrosAiGatewayService;
  let context: ActionContext;
  let identities: PetrosProductionQualityReport['identities'];
  let env: Record<string, unknown>;
  let functionId: string;
  let providerId: string;
  let modelId: string;
  let actorId: string;
  let institutionIds: string[];
  let studentIds: string[];
  let adapter: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    db = await startPhase2TestDatabase();
    const audit = db.auditWriter as AuditWriter;
    actorId = randomUUID();
    await db.adminSql`insert into platform_employees (id,email,full_name,status) values (${actorId},${`phase5-gw-${actorId}@example.test`},'Synthetic gateway operator','active')`;
    context = { principalContext: { principal: { employeeId: actorId, fullName: 'Synthetic gateway operator', roleKeys: ['ai_admin'] }, support: null }, request: {} } as unknown as ActionContext;
    identities = { application:digest('a'),migrations:digest('b'),sourcePack:digest('c'),promptSchema:digest('d'),policy:digest('e'),modelRouting:digest('f'),fixtures:digest('1'),evaluator:digest('2') };
    env = { PETROS_RELEASE_IDENTITIES_JSON: JSON.stringify(identities), PETROS_AI_MODE: 'live' };
    releaseRepo = new PetrosReleaseRepository(db.db);
    release = new PetrosReleaseService(releaseRepo, env as never, audit);
    routingRepo = new PetrosAiRoutingRepository(db.db);
    routing = new PetrosAiRoutingService(routingRepo, {} as never, {} as never, audit, release);
    await routing.ensureRegistry();
    const fn = await routingRepo.findFunctionByKey('hint.generate');
    expect(fn).toBeTruthy();
    functionId = fn!.id;

    institutionIds = [randomUUID(), randomUUID()];
    studentIds = [randomUUID(), randomUUID()];
    for (let index = 0; index < 2; index += 1) {
      const institutionId = institutionIds[index]!;
      const studentId = studentIds[index]!;
      await db.adminSql`insert into institutions (id,public_id,legal_name,display_name,type,country,primary_contact,status)
        values (${institutionId},${`p5-gateway-${institutionId.slice(0,8)}`},'Synthetic test institution','Synthetic gateway school','school','US','{"name":"Fixture","email":"fixture@example.test"}'::jsonb,'active')`;
      await db.adminSql`insert into students (id,institution_id,admission_no,first_name,last_name,status)
        values (${studentId},${institutionId},${`P5-${studentId.slice(0,8)}`},'Synthetic','Learner','enrolled')`;
    }

    const provider = await routing.createProvider({ key:`p5gw-${randomUUID().slice(0,8)}`, displayName:'Synthetic controlled adapter',
      adapterType:'self_hosted', baseUrl:'http://127.0.0.1:9', enabled:true, paused:false, priority:1,
      capabilities:['text','structured_output'], metadata:{ synthetic:true }, reason:'Create synthetic gateway route' } as never, context);
    providerId = provider.id;
    const model = await routing.createModel({ providerId, modelKey:'fixture-model', displayName:'Synthetic model', enabled:true,
      custom:true, capabilities:['text','structured_output'], contextWindow:4096, maxOutputTokens:256,
      pricing:{ inputPerMillionMicros:1_000_000, outputPerMillionMicros:1_000_000 }, providerOptions:{ fixture:'stable' },
      reason:'Create synthetic gateway model' } as never, context);
    modelId = model.id;
    await db.adminSql`update petros_ai_providers set health_status='healthy',latency_ms=1 where id=${providerId}::uuid`;
    const currentFn = await routingRepo.findFunction(functionId);
    await routing.configureFunction(functionId, { enabled:true, allowedInputTypes:currentFn!.allowedInputTypes,
      responseFormat:currentFn!.responseFormat, requiredCapabilities:currentFn!.requiredCapabilities, settings:currentFn!.settings,
      routes:[{ providerId, modelId, tier:0, trafficPercent:100, enabled:true, overrides:{} }],
      reason:'Install synthetic route',version:currentFn!.version } as never, context);
    await routing.updateBudget({ monthlyBudgetMicros:10_000_000,dailyBudgetMicros:10_000_000,
      thresholds:[{percent:80,action:'warn'}],preserveEssentialFunctions:true,enabled:true,
      reason:'Bound synthetic gateway cost',version:(await routing.budget()).version } as never, context);

    adapter = vi.fn(async () => ({ kind:'json' as const, content:{ ok:true }, inputTokens:4, outputTokens:3, cachedTokens:0, actualCostMicros:7 }));
    gateway = new PetrosAiGatewayService(routing, routingRepo,
      { adapter: () => ({ execute: adapter }) } as never,
      { get: vi.fn(async () => null), set: vi.fn(async () => undefined) } as never,
      env as never, release);
  }, 90_000);

  afterAll(async () => { await db?.close(); });

  function report(): PetrosProductionQualityReport {
    const checks = gates.map(gate => ({ gate, layer:'deterministic' as const, status:'pass' as const, samples:2, evidenceSha256:digest('3') }));
    return { schemaVersion:'petros.production-quality.v1',id:randomUUID(),environment:'disposable_synthetic',runtime:'production_owners',
      identities:structuredClone(identities),fixtureVersion:'phase5-gateway-fixture.v1',evaluatorVersion:'contract-only.v1',
      createdAt:new Date(Date.now()-1_000).toISOString(),expiresAt:new Date(Date.now()+86_400_000).toISOString(),checks,
      accounting:{attempts:2,failed:0,cancelled:0,costMicros:0,maxCostMicros:100,openReservations:0,reconciled:true,evidenceSha256:digest('4')},
      educatorAcceptance:'pending',pilotAcceptance:'pending' };
  }

  async function prepareRelease() {
    const nonce = randomUUID();
    const candidate = await routing.createFunctionVersion(functionId,{promptVersion:`p5gw-candidate-${nonce}`,schemaVersion:`p5gw-schema-${nonce}`,
      promptTemplate:'Synthetic candidate prompt.',responseSchema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok']},status:'draft',
      reason:'Create gateway candidate',notes:'Disposable test only'} as never,context);
    const rollback = await routing.createFunctionVersion(functionId,{promptVersion:`p5gw-rollback-${nonce}`,schemaVersion:`p5gw-rollback-schema-${nonce}`,
      promptTemplate:'Synthetic rollback prompt.',responseSchema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok']},status:'draft',
      reason:'Create gateway rollback',notes:'Disposable test only'} as never,context);
    const cfg = await releaseRepo.configuration(functionId);
    const candidateSha256 = releaseDigest(promptIdentity(candidate as never));
    const rollbackSha256 = releaseDigest(promptIdentity(rollback as never));
    const configurationSha256 = releaseDigest(cfg);
    identities.promptSchema = releaseDigest([{ functionId,candidateSha256,rollbackSha256 }]);
    identities.modelRouting = releaseDigest([{ functionId,configurationSha256 }]);
    env.PETROS_RELEASE_IDENTITIES_JSON = JSON.stringify(identities);
    const quality = report();
    const bundle = { schemaVersion:'petros.release-bundle.v1',id:randomUUID(),identities:structuredClone(identities),evaluationId:quality.id,
      createdAt:new Date(Date.now()-500).toISOString(),expiresAt:new Date(Date.now()+43_200_000).toISOString(),
      functions:[{functionId,versionId:candidate.id,rollbackVersionId:rollback.id,candidateSha256,rollbackSha256,configurationSha256}],
      admissions:'disabled' as const,externalAcceptance:'pending' as const };
    await release.importReport(quality,'Import synthetic controlled gateway report',context);
    await release.register(bundle,'Register synthetic controlled gateway release',context);
    await routing.activateFunctionVersion(functionId,candidate.id,'Activate tested candidate',context);
    return {candidate,rollback,bundle,quality};
  }

  async function commandFor(institutionId:string,studentId:string) {
    const commandId = randomUUID();
    const sessionId = randomUUID();
    await runInStudentTenant(db.db,{institutionId,studentId},async()=>{
      await db.db.insert(schema.petrosLearningSessions).values({id:sessionId,institutionId,studentId,clientRequestId:randomUUID(),
        stateVersion:'fixture.v1',sessionType:'learn',status:'active',topic:'Synthetic topic',currentGoal:'Test a bounded gateway call',
        timeBudgetSeconds:300,elapsedSeconds:0,maxMoves:1,checkpoints:[{id:'start',label:'Start',status:'current'}],
        currentCheckpointId:'start',promptVersion:'fixture',outputSchemaVersion:'fixture'});
      await db.db.insert(schema.petrosSessionCommands).values({id:commandId,sessionId,institutionId,studentId,idempotencyKey:randomUUID(),
        command:'document_question.v1',status:'in_progress',executionVersion:'petros.document-question-execution.v1',executionState:'running',
        executionInput:{question:'Synthetic request'},requestedBy:studentId,inputSha256:digest('5'),sourceFingerprint:digest('6'),
        executionRevision:1,executionAttempts:1,executionFence:1,executionLeaseUntil:new Date(Date.now()+60_000)});
    });
    return {commandId,sessionId};
  }

  async function finishCommand(institutionId:string,studentId:string,commandId:string) {
    await runInStudentTenant(db.db,{institutionId,studentId},()=>db.db.update(schema.petrosSessionCommands)
      .set({executionState:'failed',executionLeaseUntil:null,errorCode:'PHASE5_SYNTHETIC_TEST_COMPLETE'})
      .where(eq(schema.petrosSessionCommands.id,commandId)));
  }

  async function executeFor(institutionId:string,studentId:string,commandId:string) {
    return gateway.execute({context:{requestId:commandId,functionKey:'hint.generate',institutionId,studentId,inputModality:'text',
      estimatedTokens:10,currentCostMicros:0,previousFailures:0},input:[{type:'text',text:'Synthetic provider input'}],
      budgetReservation:{commandId,fence:1},disableCache:true,
      databaseScope:work=>runInStudentTenant(db.db,{institutionId,studentId},work)});
  }

  it('rechecks release on each real dispatch, settles cost once across disable race, and allows only exact rollback', async () => {
    let releaseFixture = await prepareRelease();
    // A model change after registration fails before adapter invocation; restoring the
    // exact evaluated config restores eligibility without adding a new report.
    const oldModel = await routingRepo.findModel(modelId);
    await routing.updateModel(modelId,{providerId,modelKey:oldModel!.modelKey,displayName:oldModel!.displayName,enabled:true,custom:true,
      capabilities:oldModel!.capabilities,contextWindow:oldModel!.contextWindow,maxOutputTokens:oldModel!.maxOutputTokens,
      pricing:oldModel!.pricing,providerOptions:{fixture:'stale'},reason:'Inject bounded stale model config',version:oldModel!.version} as never,context);
    const staleCall = await commandFor(institutionIds[0]!,studentIds[0]!);
    await expect(executeFor(institutionIds[0]!,studentIds[0]!,staleCall.commandId)).rejects.toMatchObject({
      response:expect.objectContaining({code:'PETROS_RELEASE_CONFIGURATION_STALE'}),
    });
    await finishCommand(institutionIds[0]!,studentIds[0]!,staleCall.commandId);
    expect(adapter).not.toHaveBeenCalled();
    const staleRows = await runInStudentTenant(db.db,{institutionId:institutionIds[0]!,studentId:studentIds[0]!},()=>
      db.db.select().from(schema.petrosAiUsageEvents).where(eq(schema.petrosAiUsageEvents.requestId,staleCall.commandId)));
    expect(staleRows).toHaveLength(0);
    const changedModel = await routingRepo.findModel(modelId);
    await routing.updateModel(modelId,{providerId,modelKey:changedModel!.modelKey,displayName:changedModel!.displayName,enabled:true,custom:true,
      capabilities:changedModel!.capabilities,contextWindow:changedModel!.contextWindow,maxOutputTokens:changedModel!.maxOutputTokens,
      pricing:changedModel!.pricing,providerOptions:{fixture:'stable'},reason:'Restore evaluated model config',version:changedModel!.version} as never,context);
    // Model version is part of the dispatch identity, so restoring values still requires
    // a fresh synthetic quality report and release registration.
    releaseFixture = await prepareRelease();

    const call = await commandFor(institutionIds[1]!,studentIds[1]!);
    adapter.mockImplementationOnce(async () => {
      await release.disable(releaseFixture.bundle.id,randomUUID(),'Disable during controlled provider response',context);
      return {kind:'json' as const,content:{ok:true},inputTokens:4,outputTokens:3,cachedTokens:0,actualCostMicros:7};
    });
    await expect(executeFor(institutionIds[1]!,studentIds[1]!,call.commandId)).rejects.toMatchObject({
      response:expect.objectContaining({code:'PETROS_RELEASE_DISABLED'}),
    });
    expect(adapter).toHaveBeenCalledTimes(1);
    const usage = await runInStudentTenant(db.db,{institutionId:institutionIds[1]!,studentId:studentIds[1]!},()=>
      db.db.select().from(schema.petrosAiUsageEvents).where(eq(schema.petrosAiUsageEvents.requestId,call.commandId)));
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({status:'success',actualCostMicros:7,estimatedCostMicros:7,outputTokens:3});
    const reservation = await runInStudentTenant(db.db,{institutionId:institutionIds[1]!,studentId:studentIds[1]!},()=>
      db.db.select().from(schema.petrosAiAttemptReservations).where(eq(schema.petrosAiAttemptReservations.commandId,call.commandId)));
    expect(reservation).toHaveLength(1);
    expect(reservation[0]).toMatchObject({state:'settled',settledMicros:7});
    await finishCommand(institutionIds[1]!,studentIds[1]!,call.commandId);

    const deniedCall = await commandFor(institutionIds[0]!,studentIds[0]!);
    await expect(executeFor(institutionIds[0]!,studentIds[0]!,deniedCall.commandId)).rejects.toMatchObject({
      response:expect.objectContaining({code:'PETROS_RELEASE_DISABLED'}),
    });
    await finishCommand(institutionIds[0]!,studentIds[0]!,deniedCall.commandId);
    expect(adapter).toHaveBeenCalledTimes(1);

    await routing.activateFunctionVersion(functionId,releaseFixture.rollback.id,'Restore exact evaluated rollback',context);
    const rollbackCall = await commandFor(institutionIds[0]!,studentIds[0]!);
    const result = await executeFor(institutionIds[0]!,studentIds[0]!,rollbackCall.commandId);
    expect(result).toMatchObject({content:{ok:true},promptVersion:releaseFixture.rollback.promptVersion,cached:false});
    expect(adapter).toHaveBeenCalledTimes(2);
    const rollbackUsage = await runInStudentTenant(db.db,{institutionId:institutionIds[0]!,studentId:studentIds[0]!},()=>
      db.db.select().from(schema.petrosAiUsageEvents).where(eq(schema.petrosAiUsageEvents.requestId,rollbackCall.commandId)));
    expect(rollbackUsage).toHaveLength(1);
    expect(rollbackUsage[0]).toMatchObject({status:'success',actualCostMicros:7});
    await finishCommand(institutionIds[0]!,studentIds[0]!,rollbackCall.commandId);
    // Shared provider/global reservations settle correctly across concurrent tenant calls.
    const concurrent=await Promise.all(institutionIds.map((institutionId,i)=>commandFor(institutionId,studentIds[i]!)));
    const results=await Promise.all(concurrent.map((call,i)=>executeFor(institutionIds[i]!,studentIds[i]!,call.commandId)));
    expect(results.every(result=>result.estimatedCostMicros===7)).toBe(true);
    for(const [i,call] of concurrent.entries()){
      const holds=await runInStudentTenant(db.db,{institutionId:institutionIds[i]!,studentId:studentIds[i]!},()=>db.db.select().from(schema.petrosAiAttemptReservations).where(eq(schema.petrosAiAttemptReservations.commandId,call.commandId)));
      expect(holds).toHaveLength(1);expect(holds[0]).toMatchObject({state:'settled',settledMicros:7});
      await finishCommand(institutionIds[i]!,studentIds[i]!,call.commandId);
    }
    expect(adapter).toHaveBeenCalledTimes(4);
  },90_000);
});
