import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, runInStudentTenant, schema, sql, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type { AuditWriter } from '@edrion/audit';
import { ActorType } from '@edrion/shared-types';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  applyEngineCommand, boundEngineInput, branchEngineSnapshot, compatibilityCanonicalJson,
  compileEngineProgram, createEngineLessonProgram, describeEngineCapabilities,
  engineCommandSchema, initialEngineSnapshot,
  ENGINE_MODELS, engineDuration, evaluateEngineValues,
  petrosProjectileBindingSchema, resolvePetrosProjectileBinding,
  validateEngineSnapshot,
  type EngineAuthority, type EngineCommand, type EngineSnapshot, type PetrosKnowledgePolicy,
  type PetrosProjectileBinding,
} from '@edrion/schemas';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../../common/tokens';
import { StudentAuthService } from '../auth/student-auth.service';
import { SurfacesService } from '../surfaces/surfaces.service';
import { PetrosInstitutionalService } from '../../petros-institutional/petros-institutional.service';
import { PetrosTeachingPackService } from '../knowledge/petros-teaching-pack.service';
import { PetrosLoopRepository } from './petros-loop.repository';
import { PetrosWorkspaceRepository } from './petros-workspace.repository';
import type { InstitutionalStudentPrincipal } from '../student.types';

type Principal = InstitutionalStudentPrincipal;
const conflict = (code: string) => new ConflictException({ code });
const digest = (value: unknown) => createHash('sha256').update(compatibilityCanonicalJson(value)).digest('hex');
const scopeOf = (principal: Principal) => ({ institutionId: principal.institutionId, studentId: principal.studentId });
const recovery = (snapshot: EngineSnapshot) => ({ acknowledgedExperimentVersion: snapshot.execution.version,
  unacknowledgedInterval: 'not_persisted' as const });
const predictionIssueSchema = z.object({ requestId: z.string().uuid(), modelId: z.string().min(1).max(80) }).strict();
const predictionAnswerSchema = z.object({ requestId: z.string().uuid(), challengeId: z.string().uuid(),
  predictedValue: z.number().finite().min(-1e9).max(1e9),
  assistance: z.enum(['none_observed', 'petros_help', 'external_declared', 'unknown']),
}).strict();
const predictionPort: Record<string, string> = {
  'physics.projectile.no-drag': 'y', 'physics.pendulum.ideal': 'angle',
  'circuits.dc.series': 'current', 'circuits.rc.series': 'capacitorVoltage',
};
type PredictionChallenge = NonNullable<Awaited<ReturnType<PetrosWorkspaceRepository['predictionChallenge']>>>;
const publicChallenge = (row: PredictionChallenge) => ({ challengeId: row.id,
  checkpointId: row.checkpointId, programRevision: row.programRevision,
  experimentVersion: row.experimentVersion, modelId: row.modelId, capabilityId: row.capabilityId,
  targetTime: row.targetTime, outputPort: row.outputPort, unit: row.unit, prompt: row.prompt,
  priorExploration: row.priorExploration, assistanceStatus: 'external_help_unknown' as const,
  evidenceEligibility: 'observation_only' as const });

/** One owner-scoped generic program on a teaching block. No workspace event is learning evidence. */
@Injectable()
export class PetrosWorkspaceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly repo: PetrosWorkspaceRepository,
    private readonly loop: PetrosLoopRepository,
    private readonly packs: PetrosTeachingPackService,
    private readonly policies: PetrosInstitutionalService,
    private readonly auth: StudentAuthService,
    private readonly surfaces: SurfacesService,
  ) {}

  private enabled() {
    if (!this.env.PETROS_WORKSPACE_ENABLED) throw conflict('PETROS_WORKSPACE_DISABLED');
  }
  private capabilityManifest() {
    const manifest = describeEngineCapabilities();
    return {...manifest, capabilities: manifest.capabilities.map(capability => ({...capability,
      enabled: capability.enabled && (capability.id !== 'thermal.newton-cooling.lumped' || this.env.PETROS_ADVANCED_MODELS_ENABLED)}))};
  }

  private parseBody<T>(parser: z.ZodType<T>, raw: unknown, code: string): T {
    try {
      return parser.parse(raw);
    } catch (error) {
      throw new BadRequestException({ code, message: error instanceof Error ? error.message : 'Invalid request body' });
    }
  }

  private parseEngineCommand(raw: unknown): EngineCommand {
    try {
      boundEngineInput(raw);
      return engineCommandSchema.parse(raw);
    } catch (error) {
      throw new BadRequestException({ code: 'PETROS_WORKSPACE_INVALID_COMMAND',
        message: error instanceof Error ? error.message : 'Invalid workspace command' });
    }
  }

  private transaction<T>(principal: Principal, work: () => Promise<T>) {
    return runInStudentTenant(this.db, principal, async () => {
      await this.db.execute(sql`set local statement_timeout='10s'`);
      await this.db.execute(sql`set local lock_timeout='2s'`);
      return work();
    });
  }

  private async session(principal: Principal, sessionId: string) {
    // Same advisory key and lock order as source, policy, pack and projectile owners.
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`petros-knowledge:${principal.institutionId}`},0))`);
    const current = await this.auth.resolveInstitutionalWorker(principal.institutionUserId);
    if (current.institutionId !== principal.institutionId || current.studentId !== principal.studentId ||
      !current.permissions.includes('student.learn.use') || !await this.surfaces.isPortalEnabled(current))
      throw new ForbiddenException();
    const t = schema.petrosLearningSessions;
    await this.db.select({ id: t.id }).from(t).where(and(eq(t.id, sessionId),
      eq(t.institutionId, principal.institutionId), eq(t.studentId, principal.studentId))).for('share');
    const session = await this.loop.findSession(scopeOf(principal), sessionId);
    if (!session || session.sourceContext?.door !== 'uploaded_document') throw new NotFoundException();
    if (session.status !== 'active') throw conflict('PETROS_SESSION_STALE');
    return session;
  }

  private async authority(principal: Principal, sessionId: string, blockId: string,
    source: PetrosProjectileBinding | null, pinned?: PetrosKnowledgePolicy | null) {
    const session = await this.session(principal, sessionId);
    const policy = pinned
      ? await this.policies.assertDocumentKnowledgePolicy(scopeOf(principal), sessionId, pinned)
      : await this.policies.documentKnowledgePolicy(scopeOf(principal), sessionId, source ? undefined : 'source_primary');
    const block = await this.repo.block(scopeOf(principal), sessionId, blockId);
    if (!block || block.type !== 'diagram') throw new NotFoundException();
    if (source) {
      const binding = petrosProjectileBindingSchema.parse(source);
      if (binding.originalDiagramBlockId !== blockId || !block.projectileBinding ||
        digest(petrosProjectileBindingSchema.parse(block.projectileBinding)) !== digest(binding))
        throw conflict('PETROS_WORKSPACE_BINDING_SCOPE');
      const pack = await this.packs.requireApprovedPack(principal, sessionId,
        { packId: binding.pack.id, packVersion: binding.pack.version });
      resolvePetrosProjectileBinding(binding, pack.candidate, pack.trustedContext, pack.candidate.pack);
      if (session.sourceContext?.sourceFingerprint !== binding.source.sourceVersion ||
        !policy.pages.includes(binding.source.page)) throw conflict('PETROS_WORKSPACE_STALE_SOURCE');
    } else if (policy.mode === 'source_bound') {
      throw conflict('PETROS_WORKSPACE_ENGINEERING_MODE_DENIED');
    }
    // Scientific capabilities are granted by the server registry, not by program claims.
    const allowedCapabilities = describeEngineCapabilities().capabilities.filter(capability => capability.enabled)
      .filter(capability => capability.id !== 'thermal.newton-cooling.lumped' || this.env.PETROS_ADVANCED_MODELS_ENABLED)
      .map(capability => capability.id);
    return { block, policy, engine: { ownerScopeRef: `${principal.institutionId}:${principal.studentId}`,
      programId: blockId, source, allowedCapabilities } satisfies EngineAuthority };
  }

  private parseSnapshot(raw: unknown, principal: Principal, blockId: string) {
    boundEngineInput(raw);
    const snapshot = validateEngineSnapshot(raw).snapshot;
    if (snapshot.program.programId !== blockId ||
      snapshot.program.ownerScopeRef !== `${principal.institutionId}:${principal.studentId}`)
      throw conflict('PETROS_WORKSPACE_SCOPE');
    if (snapshot.program.source && snapshot.program.provenance !== 'reviewed_source')
      throw conflict('PETROS_WORKSPACE_PROVENANCE');
    return snapshot;
  }

  private async replay(principal: Principal, blockId: string,
    receipt: NonNullable<Awaited<ReturnType<PetrosWorkspaceRepository['receipt']>>>, hash: string) {
    if (receipt.commandHash !== hash) throw conflict('PETROS_WORKSPACE_OPERATION_CONFLICT');
    if (receipt.status === 'cancelled') return { status: 'cancelled' as const, operationId: receipt.operationId };
    const checkpoint = await this.repo.checkpoint(scopeOf(principal), blockId, receipt.checkpointId!);
    if (!checkpoint) throw conflict('PETROS_WORKSPACE_CHECKPOINT_MISSING');
    const snapshot = this.parseSnapshot(checkpoint.snapshot, principal, blockId);
    const current = await this.repo.current(scopeOf(principal), blockId);
    if (!current) throw conflict('PETROS_WORKSPACE_NOT_CREATED');
    const checked = await this.authority(principal, receipt.sessionId, blockId, snapshot.program.source,
      current.policy as PetrosKnowledgePolicy);
    compileEngineProgram(snapshot.program, checked.engine);
    return { status: 'available' as const, snapshot, replayed: true,
      receipt: { operationId: receipt.operationId, commandHash: receipt.commandHash,
        checkpointId: receipt.checkpointId }, recovery: recovery(snapshot) };
  }

  async read(principal: Principal, sessionId: string, blockId: string) {
    return this.transaction(principal, async () => {
      await this.session(principal, sessionId);
      if (!this.env.PETROS_WORKSPACE_ENABLED) return { status: 'disabled' as const };
      const current = await this.repo.current(scopeOf(principal), blockId);
      const prior = current ? this.parseSnapshot(current.snapshot, principal, blockId) : null;
      const binding = prior ? prior.program.source : (await this.repo.block(scopeOf(principal), sessionId, blockId))?.projectileBinding ?? null;
      const checked = await this.authority(principal, sessionId, blockId,
        binding ? petrosProjectileBindingSchema.parse(binding) : null,
        current?.policy as PetrosKnowledgePolicy | undefined);
      if (prior) {
        compileEngineProgram(prior.program, checked.engine);
        const checkpoint = await this.repo.latestCheckpoint(scopeOf(principal), blockId, current!.version);
        if (!checkpoint) throw conflict('PETROS_WORKSPACE_CHECKPOINT_MISSING');
        if (digest(checkpoint.snapshot) !== digest(prior)) throw conflict('PETROS_WORKSPACE_CHECKPOINT_CHANGED');
        const receipt = await this.repo.operationByCheckpoint(scopeOf(principal), blockId, checkpoint.id);
        if (!receipt) throw conflict('PETROS_WORKSPACE_RECEIPT_MISSING');
        return { status: 'available' as const, snapshot: prior, replayed: false,
          receipt: { operationId: receipt.operationId, commandHash: receipt.commandHash,
            checkpointId: receipt.checkpointId },
          checkpoints: await this.repo.history(scopeOf(principal), blockId), recovery: recovery(prior) };
      }
      if (!binding) return { status: 'unavailable' as const, recovery: 'original_source' as const };
      const compiled = compileEngineProgram(createEngineLessonProgram(checked.engine), checked.engine);
      return { status: 'ready' as const, program: compiled.program,
        capabilities: this.capabilityManifest(), recovery: 'original_source' as const };
    });
  }

  async command(principal: Principal, sessionId: string, blockId: string, raw: unknown, signal?: AbortSignal) {
    this.enabled();
    const command = this.parseEngineCommand(raw);
    if (command.programId !== blockId) throw conflict('PETROS_WORKSPACE_PROGRAM_SCOPE');
    const commandHash = digest(command);
    signal?.throwIfAborted();
    const prepared = await this.transaction(principal, async () => {
      const current = await this.repo.current(scopeOf(principal), blockId);
      const prior = current ? this.parseSnapshot(current.snapshot, principal, blockId) : null;
      const source = command.action.type === 'create' || command.action.type === 'compose' ||
        command.action.type === 'replace_subprogram' ? command.action.program.source : prior?.program.source ?? null;
      if ((command.action.type === 'create' || command.action.type === 'compose' ||
        command.action.type === 'replace_subprogram') && source && command.action.program.provenance !== 'reviewed_source')
        throw conflict('PETROS_WORKSPACE_PROVENANCE');
      if (prior && digest(prior.program.source) !== digest(source))
        throw conflict('PETROS_WORKSPACE_SOURCE_CHANGE');
      const checked = await this.authority(principal, sessionId, blockId, source,
        current?.policy as PetrosKnowledgePolicy | undefined);
      if (prior) compileEngineProgram(prior.program, checked.engine);
      const receipt = await this.repo.receipt(scopeOf(principal), blockId, command.operationId);
      if (receipt) return { replay: await this.replay(principal, blockId, receipt, commandHash), current, prior, checked, checkpoint: null };
      if (command.action.type === 'create') {
        if (prior || command.expectedRevision !== 0 || command.expectedExperimentVersion !== 0 ||
          command.expectedDraftVersion !== 0) throw conflict('PETROS_WORKSPACE_STALE');
      } else if (!prior || prior.program.revision !== command.expectedRevision ||
        prior.execution.version !== command.expectedExperimentVersion || prior.draft.version !== command.expectedDraftVersion) {
        throw conflict('PETROS_WORKSPACE_STALE');
      }
      const checkpoint = command.action.type === 'compare'
        ? await this.repo.checkpoint(scopeOf(principal), blockId, command.action.checkpointId) : null;
      if (command.action.type === 'compare' && !checkpoint) throw conflict('PETROS_WORKSPACE_CHECKPOINT_MISSING');
      return { replay: null, current, prior, checked, checkpoint };
    });
    if (prepared.replay) return prepared.replay;
    signal?.throwIfAborted();
    let next: EngineSnapshot;
    try {
      if (command.action.type === 'create') {
        const compiled = compileEngineProgram(command.action.program, prepared.checked.engine);
        next = initialEngineSnapshot(compiled, command.operationId);
      } else if (command.action.type === 'compare') {
        const target = this.parseSnapshot(prepared.checkpoint!.snapshot, principal, blockId);
        compileEngineProgram(target.program, prepared.checked.engine);
        next = branchEngineSnapshot(prepared.prior!, target, command.operationId);
      } else {
        next = applyEngineCommand(prepared.prior!, command, prepared.checked.engine);
      }
      next = this.parseSnapshot(next, principal, blockId);
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new BadRequestException({ code: 'PETROS_WORKSPACE_INVALID_COMMAND', message: String(error) });
    }
    return this.transaction(principal, async () => {
      this.enabled();
      const checked = await this.authority(principal, sessionId, blockId, next.program.source,
        prepared.current?.policy as PetrosKnowledgePolicy | undefined);
      compileEngineProgram(next.program, checked.engine);
      const block = await this.repo.block(scopeOf(principal), sessionId, blockId, true);
      if (!block) throw new NotFoundException();
      const receipt = await this.repo.receipt(scopeOf(principal), blockId, command.operationId);
      if (receipt) return this.replay(principal, blockId, receipt, commandHash);
      const current = await this.repo.current(scopeOf(principal), blockId);
      if (digest(current?.snapshot ?? null) !== digest(prepared.current?.snapshot ?? null) ||
        current?.version !== prepared.current?.version) throw conflict('PETROS_WORKSPACE_STALE');
      if (command.action.type === 'compare') {
        const exact = await this.repo.checkpoint(scopeOf(principal), blockId, command.action.checkpointId);
        if (!exact || digest(exact.snapshot) !== digest(prepared.checkpoint?.snapshot)) throw conflict('PETROS_WORKSPACE_CHECKPOINT_CHANGED');
      }
      signal?.throwIfAborted();
      const version = (current?.version ?? 0) + 1;
      const checkpointId = randomUUID();
      const parent = current ? await this.repo.latestCheckpoint(scopeOf(principal), blockId, current.version) : null;
      if (current && !parent) throw conflict('PETROS_WORKSPACE_CHECKPOINT_MISSING');
      await this.repo.commit(scopeOf(principal), sessionId, blockId, version, next, checked.policy, command,
        commandHash, checkpointId, command.action.type === 'compare' ? command.action.checkpointId : parent?.id ?? null);
      await this.record(principal, sessionId, blockId, command, 'committed', version);
      signal?.throwIfAborted();
      return { status: 'available' as const, snapshot: next, replayed: false,
        receipt: { operationId: command.operationId, commandHash, checkpointId }, recovery: recovery(next) };
    });
  }

  async cancel(principal: Principal, sessionId: string, blockId: string, raw: unknown) {
    this.enabled();
    const command = this.parseEngineCommand(raw);
    if (command.programId !== blockId) throw conflict('PETROS_WORKSPACE_PROGRAM_SCOPE');
    const commandHash = digest(command);
    return this.transaction(principal, async () => {
      const current = await this.repo.current(scopeOf(principal), blockId);
      const prior = current ? this.parseSnapshot(current.snapshot, principal, blockId) : null;
      const source = command.action.type === 'create' || command.action.type === 'compose' ||
        command.action.type === 'replace_subprogram' ? command.action.program.source : prior?.program.source ?? null;
      if ((command.action.type === 'create' || command.action.type === 'compose' ||
        command.action.type === 'replace_subprogram') && source && command.action.program.provenance !== 'reviewed_source')
        throw conflict('PETROS_WORKSPACE_PROVENANCE');
      if (prior && digest(prior.program.source) !== digest(source))
        throw conflict('PETROS_WORKSPACE_SOURCE_CHANGE');
      const checked = await this.authority(principal, sessionId, blockId, source,
        current?.policy as PetrosKnowledgePolicy | undefined);
      if (prior) compileEngineProgram(prior.program, checked.engine);
      const block = await this.repo.block(scopeOf(principal), sessionId, blockId, true);
      if (!block) throw new NotFoundException();
      const receipt = await this.repo.receipt(scopeOf(principal), blockId, command.operationId);
      if (receipt) return this.replay(principal, blockId, receipt, commandHash);
      if (command.action.type === 'create' ? !!prior || command.expectedRevision !== 0 ||
        command.expectedExperimentVersion !== 0 || command.expectedDraftVersion !== 0
        : !prior || prior.program.revision !== command.expectedRevision ||
          prior.execution.version !== command.expectedExperimentVersion || prior.draft.version !== command.expectedDraftVersion)
        throw conflict('PETROS_WORKSPACE_STALE');
      await this.repo.cancel(scopeOf(principal), sessionId, blockId, command, commandHash);
      await this.record(principal, sessionId, blockId, command, 'cancelled', current?.version ?? 0);
      return { status: 'cancelled' as const, operationId: command.operationId };
    });
  }

  /** Issue one server-owned, hidden criterion pinned to an acknowledged checkpoint. */
  async issuePrediction(principal: Principal, sessionId: string, blockId: string, raw: unknown) {
    this.enabled();
    const request = this.parseBody(predictionIssueSchema, raw, 'PETROS_WORKSPACE_INVALID_PREDICTION_REQUEST');
    const requestHash = digest(request);
    return this.transaction(principal, async () => {
      // Acquire the same authority lock used by the source and policy owners before
      // reading workspace state. A command must not race this prediction against a
      // checkpoint that was current only before authority resolution.
      await this.session(principal, sessionId);
      const current = await this.repo.current(scopeOf(principal), blockId);
      if (!current) throw conflict('PETROS_WORKSPACE_NOT_CREATED');
      const snapshot = this.parseSnapshot(current.snapshot, principal, blockId);
      const checked = await this.authority(principal, sessionId, blockId, snapshot.program.source,
        current.policy as PetrosKnowledgePolicy);
      const block = await this.repo.block(scopeOf(principal), sessionId, blockId, true);
      if (!block) throw new NotFoundException();
      const lockedCurrent = await this.repo.current(scopeOf(principal), blockId);
      if (!lockedCurrent || lockedCurrent.version !== current.version ||
        digest(lockedCurrent.snapshot) !== digest(current.snapshot) ||
        digest(lockedCurrent.policy) !== digest(current.policy)) throw conflict('PETROS_WORKSPACE_PREDICTION_STALE');
      const prior = await this.repo.predictionByRequest(scopeOf(principal), blockId, request.requestId);
      if (prior) {
        if (prior.requestHash !== requestHash) throw conflict('PETROS_WORKSPACE_PREDICTION_CONFLICT');
        return { status: 'challenge' as const, ...publicChallenge(prior), replayed: true };
      }
      const checkpoint = await this.repo.latestCheckpoint(scopeOf(principal), blockId, current.version);
      if (!checkpoint || digest(checkpoint.snapshot) !== digest(snapshot))
        throw conflict('PETROS_WORKSPACE_CHECKPOINT_CHANGED');
      const model = snapshot.program.models.find(candidate => candidate.id === request.modelId);
      if (!model) throw new BadRequestException({ code: 'PETROS_WORKSPACE_PREDICTION_MODEL' });
      const capability = ENGINE_MODELS.find(candidate => candidate.id === model.capabilityId &&
        candidate.version === model.version && candidate.solver === model.solver);
      const port = predictionPort[model.capabilityId];
      if (!capability || !port || !model.outputs[port] || !capability.outputs[port])
        throw conflict('PETROS_WORKSPACE_PREDICTION_UNAVAILABLE');
      const duration = engineDuration(snapshot);
      if (snapshot.execution.time >= duration) throw conflict('PETROS_WORKSPACE_PREDICTION_TIME');
      const targetTime = Math.min(duration, snapshot.execution.time + 0.5);
      const compiled = compileEngineProgram(snapshot.program, checked.engine);
      const values = evaluateEngineValues(compiled, snapshot.execution.parameters, targetTime,
        snapshot.execution.inputEvents).values;
      const referenceValue = values[model.outputs[port]!]!;
      if (typeof referenceValue !== 'number' || !Number.isFinite(referenceValue))
        throw conflict('PETROS_WORKSPACE_PREDICTION_REFERENCE');
      const unit = capability.outputs[port]!.unit;
      const tolerance = Math.max(0.01, Math.abs(referenceValue) * 0.05);
      const challengeId = randomUUID();
      const prompt = `Before advancing the model, predict ${port} at ${targetTime} s in ${unit}.`;
      await this.repo.insertPredictionChallenge({ ...scopeOf(principal), id: challengeId,
        workspaceId: blockId, requestId: request.requestId, requestHash, checkpointId: checkpoint.id,
        programHash: digest(snapshot.program), programRevision: snapshot.program.revision,
        experimentVersion: snapshot.execution.version, modelId: model.id,
        capabilityId: model.capabilityId, solver: model.solver, prompt, targetTime,
        outputPort: port, unit, referenceValue, tolerance, priorExploration: true });
      await this.recordPrediction(principal, sessionId, blockId, challengeId, 'issued');
      return { status: 'challenge' as const, ...publicChallenge({ id: challengeId, checkpointId: checkpoint.id,
        programRevision: snapshot.program.revision, experimentVersion: snapshot.execution.version,
        modelId: model.id, capabilityId: model.capabilityId, targetTime, outputPort: port, unit,
        prompt, priorExploration: true } as PredictionChallenge), replayed: false };
    });
  }

  async answerPrediction(principal: Principal, sessionId: string, blockId: string, raw: unknown) {
    this.enabled();
    const answer = this.parseBody(predictionAnswerSchema, raw, 'PETROS_WORKSPACE_INVALID_PREDICTION_ANSWER');
    const requestHash = digest(answer);
    return this.transaction(principal, async () => {
      await this.session(principal, sessionId);
      const challenge = await this.repo.predictionChallenge(scopeOf(principal), blockId, answer.challengeId);
      if (!challenge) throw new NotFoundException();
      const checkpoint = await this.repo.checkpoint(scopeOf(principal), blockId, challenge.checkpointId);
      if (!checkpoint) throw conflict('PETROS_WORKSPACE_CHECKPOINT_MISSING');
      const snapshot = this.parseSnapshot(checkpoint.snapshot, principal, blockId);
      const current = await this.repo.current(scopeOf(principal), blockId);
      if (!current) throw conflict('PETROS_WORKSPACE_NOT_CREATED');
      const checked = await this.authority(principal, sessionId, blockId, snapshot.program.source,
        current.policy as PetrosKnowledgePolicy);
      const block = await this.repo.block(scopeOf(principal), sessionId, blockId, true);
      if (!block) throw new NotFoundException();
      const lockedCurrent = await this.repo.current(scopeOf(principal), blockId);
      if (!lockedCurrent || lockedCurrent.version !== current.version ||
        digest(lockedCurrent.snapshot) !== digest(current.snapshot) ||
        digest(lockedCurrent.policy) !== digest(current.policy)) throw conflict('PETROS_WORKSPACE_PREDICTION_STALE');
      const existing = await this.repo.predictionResponse(scopeOf(principal), challenge.id);
      if (existing) {
        if (existing.requestId !== answer.requestId || existing.requestHash !== requestHash)
          throw conflict('PETROS_WORKSPACE_PREDICTION_ALREADY_ANSWERED');
        return { status: 'evaluated' as const, challenge: publicChallenge(challenge),
          result: existing.result, referenceValue: existing.referenceValue,
          tolerance: existing.criterionTolerance, predictedValue: existing.predictedValue,
          assistance: existing.assistance, externalHelp: 'unknown' as const,
          masteryAdmitted: false as const, replayed: true };
      }
      if (!current || current.version !== challenge.experimentVersion ||
        digest(current.snapshot) !== digest(checkpoint.snapshot))
        throw conflict('PETROS_WORKSPACE_PREDICTION_STALE');
      const model = snapshot.program.models.find(candidate => candidate.id === challenge.modelId);
      if (snapshot.program.revision !== challenge.programRevision ||
        digest(snapshot.program) !== challenge.programHash || !model ||
        model.capabilityId !== challenge.capabilityId || model.solver !== challenge.solver ||
        model.outputs[challenge.outputPort] === undefined)
        throw conflict('PETROS_WORKSPACE_PREDICTION_PIN');
      const compiled = compileEngineProgram(snapshot.program, checked.engine);
      const reference = evaluateEngineValues(compiled, snapshot.execution.parameters, challenge.targetTime,
        snapshot.execution.inputEvents).values[model.outputs[challenge.outputPort]!];
      if (typeof reference !== 'number' || digest(reference) !== digest(challenge.referenceValue))
        throw conflict('PETROS_WORKSPACE_PREDICTION_REFERENCE_CHANGED');
      const result = Math.abs(answer.predictedValue - reference) <= challenge.tolerance
        ? 'within_tolerance' as const : 'outside_tolerance' as const;
      await this.repo.insertPredictionResponse({ ...scopeOf(principal), challengeId: challenge.id,
        workspaceId: blockId, requestId: answer.requestId, requestHash,
        predictedValue: answer.predictedValue, assistance: answer.assistance, result,
        referenceValue: reference, criterionTolerance: challenge.tolerance, masteryAdmitted: false });
      await this.recordPrediction(principal, sessionId, blockId, challenge.id, 'answered');
      return { status: 'evaluated' as const, challenge: publicChallenge(challenge), result,
        referenceValue: reference, tolerance: challenge.tolerance, predictedValue: answer.predictedValue,
        assistance: answer.assistance, externalHelp: 'unknown' as const,
        masteryAdmitted: false as const, replayed: false };
    });
  }

  private async recordPrediction(principal: Principal, sessionId: string, blockId: string,
    challengeId: string, status: 'issued' | 'answered') {
    const metadata = { challengeId, status, priorExploration: true, externalHelp: 'unknown',
      evidenceEligibility: 'observation_only', learningEvidenceCreated: false };
    await this.loop.recordEvent({ ...scopeOf(principal), sessionId, blockId,
      type: 'visual.workspace_prediction', payload: metadata, correlationId: challengeId });
    await this.audit.logAudit({ actorType: ActorType.InstitutionUser, actorId: principal.institutionUserId,
      institutionId: principal.institutionId, module: 'petros', action: 'petros.visual.workspace_prediction',
      entityType: 'petros_teaching_block', entityId: blockId, correlationId: challengeId,
      newState: metadata });
  }

  private async record(principal: Principal, sessionId: string, blockId: string,
    command: EngineCommand, status: string, version: number) {
    const metadata = { operation: command.action.type, status, version, learningEvidenceCreated: false };
    await this.loop.recordEvent({ ...scopeOf(principal), sessionId, blockId,
      type: 'visual.workspace_command', payload: metadata, correlationId: command.operationId });
    await this.audit.logAudit({ actorType: ActorType.InstitutionUser, actorId: principal.institutionUserId,
      institutionId: principal.institutionId, module: 'petros', action: 'petros.visual.workspace_command',
      entityType: 'petros_teaching_block', entityId: blockId, correlationId: command.operationId, newState: metadata });
  }
}
