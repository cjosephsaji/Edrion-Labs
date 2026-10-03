import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, schema, runInStudentTenant, sql, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type { AuditWriter } from '@edrion/audit';
import { ActorType } from '@edrion/shared-types';
import { createHash } from 'node:crypto';
import {
  compatibilityCanonicalJson, evaluatePetrosProjectile, updatePetrosProjectileParameter,
  petrosProjectileCommandSchema, petrosProjectileSnapshotSchema, resolvePetrosProjectileBinding,
  petrosProjectileBindingSchema, PETROS_PROJECTILE_CAPABILITY, PETROS_PROJECTILE_ASSUMPTIONS,
  type PetrosProjectileCommand, type PetrosProjectileSnapshot,
} from '@edrion/schemas';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../../common/tokens';
import { StudentAuthService } from '../auth/student-auth.service';
import { SurfacesService } from '../surfaces/surfaces.service';
import { PetrosInstitutionalService } from '../../petros-institutional/petros-institutional.service';
import { PetrosTeachingPackService } from '../knowledge/petros-teaching-pack.service';
import { PetrosLoopRepository } from './petros-loop.repository';
import { PetrosProjectileRepository } from './petros-projectile.repository';
import type { InstitutionalStudentPrincipal } from '../student.types';

const conflict = (code: string) => new ConflictException({ code });
const hash = (input: unknown) => createHash('sha256').update(compatibilityCanonicalJson(input)).digest('hex');
type Principal = InstitutionalStudentPrincipal;

/** The existing visual owner gains a trusted capability, never generated behavior or evidence. */
@Injectable()
export class PetrosProjectileService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly repo: PetrosProjectileRepository,
    private readonly loop: PetrosLoopRepository,
    private readonly packs: PetrosTeachingPackService,
    private readonly policies: PetrosInstitutionalService,
    private readonly auth: StudentAuthService,
    private readonly surfaces: SurfacesService,
  ) {}

  private transaction<T>(principal: Principal, work: () => Promise<T>) {
    return runInStudentTenant(this.db, principal, async () => {
      await this.db.execute(sql`set local statement_timeout='10s'`);
      await this.db.execute(sql`set local lock_timeout='2s'`);
      return work();
    });
  }
  private async session(principal: Principal, sessionId: string) {
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`petros-knowledge:${principal.institutionId}`},0))`);
    const current = await this.auth.resolveInstitutionalWorker(principal.institutionUserId);
    if (current.institutionId !== principal.institutionId || current.studentId !== principal.studentId ||
      !current.permissions.includes('student.learn.use') || !await this.surfaces.isPortalEnabled(current))
      throw new ForbiddenException();
    // Retain the active-session authority until commit; pause/close must serialize.
    const t = schema.petrosLearningSessions;
    await this.db.select({ id: t.id }).from(t).where(and(eq(t.id, sessionId),
      eq(t.institutionId, principal.institutionId), eq(t.studentId, principal.studentId))).for('share');
    const session = await this.loop.findSession(principal, sessionId);
    if (!session || session.sourceContext?.door !== 'uploaded_document') throw new NotFoundException();
    return session;
  }
  private enabled() {
    if (!this.env.PETROS_PROJECTILE_ENABLED || !this.env.PETROS_ADAPTIVE_TEACHING_ENABLED)
      throw conflict('PETROS_PROJECTILE_DISABLED');
  }
  private async authority(principal: Principal, sessionId: string, command: PetrosProjectileCommand,
    prior?: PetrosProjectileSnapshot | null) {
    const session = await this.session(principal, sessionId);
    if (session.status !== 'active') throw conflict('PETROS_SESSION_STALE');
    // Policy/course/source locks precede the block lock on every path, including retries.
    const policy = prior
      ? await this.policies.assertDocumentKnowledgePolicy(principal, sessionId, prior.policy)
      : await this.policies.documentKnowledgePolicy(principal, sessionId);
    const pack = await this.packs.requireApprovedPack(principal, sessionId,
      { packId: command.binding.pack.id, packVersion: command.binding.pack.version });
    resolvePetrosProjectileBinding(command.binding, pack.candidate, pack.trustedContext, pack.candidate.pack);
    if (session.sourceContext?.sourceFingerprint !== command.binding.source.sourceVersion)
      throw conflict('PETROS_PROJECTILE_STALE_SOURCE');
    if (!policy.pages.includes(command.binding.source.page)) throw conflict('PETROS_PROJECTILE_SOURCE_SCOPE');
    return policy;
  }
  private replay(receipt: NonNullable<Awaited<ReturnType<PetrosProjectileRepository['receipt']>>>, commandHash: string) {
    if (receipt.commandHash !== commandHash) throw conflict('PETROS_PROJECTILE_OPERATION_CONFLICT');
    if (receipt.status === 'cancelled') return { status: 'cancelled' as const, operationId: receipt.operationId };
    return { status: 'available' as const, snapshot: petrosProjectileSnapshotSchema.parse(receipt.snapshot), replayed: true };
  }

  private assertDiagramBinding(block: NonNullable<Awaited<ReturnType<PetrosProjectileRepository['block']>>>, command: PetrosProjectileCommand) {
    if (!block.projectileBinding || hash(petrosProjectileBindingSchema.parse(block.projectileBinding)) !== hash(command.binding))
      throw conflict('PETROS_PROJECTILE_DIAGRAM_UNBOUND');
  }

  async read(principal: Principal, sessionId: string, blockId: string) {
    return this.transaction(principal, async () => {
      await this.session(principal, sessionId);
      if (!this.env.PETROS_PROJECTILE_ENABLED || !this.env.PETROS_ADAPTIVE_TEACHING_ENABLED)
        return { status: 'disabled' as const };
      const block = await this.repo.block(principal, sessionId, blockId);
      if (!block || block.type !== 'diagram') throw new NotFoundException();
      if (!block.projectileSnapshot) {
        if (!block.projectileBinding) return { status: 'unavailable' as const, recovery: 'original_source' as const,
          reason: 'No reviewed simulation is attached. The original source remains available.' };
        const binding = petrosProjectileBindingSchema.parse(block.projectileBinding);
        const defaultInput = { schemaVersion: 'petros.projectile-input.v1' as const,
          capability: PETROS_PROJECTILE_CAPABILITY, assumptions: PETROS_PROJECTILE_ASSUMPTIONS,
          launchVelocity: { x: 10, y: 10, unit: 'm/s' as const }, gravity: { value: 9.81, unit: 'm/s^2' as const },
          elapsedTime: { value: 0, unit: 's' as const } };
        await this.authority(principal, sessionId, { schemaVersion: 'petros.projectile-command.v1',
          operationId: block.id, expectedVersion: 0, binding, action: { kind: 'initialise', input: defaultInput } });
        return { status: 'ready' as const, binding, defaultInput };
      }
      const prior = petrosProjectileSnapshotSchema.parse(block.projectileSnapshot);
      const command: PetrosProjectileCommand = { schemaVersion: 'petros.projectile-command.v1',
        operationId: prior.operationId, expectedVersion: prior.version, binding: prior.binding,
        action: { kind: 'initialise', input: prior.state.input } };
      this.assertDiagramBinding(block, command);
      await this.authority(principal, sessionId, command, prior);
      return { status: 'available' as const, snapshot: prior, replayed: false };
    });
  }

  async command(principal: Principal, sessionId: string, blockId: string, raw: unknown, signal?: AbortSignal) {
    this.enabled();
    const command = petrosProjectileCommandSchema.parse(raw);
    if (command.binding.originalDiagramBlockId !== blockId) throw conflict('PETROS_PROJECTILE_BINDING_SCOPE');
    const commandHash = hash(command);
    signal?.throwIfAborted();
    const prepared = await this.transaction(principal, async () => {
      // Read immutable input without holding the block lock during numeric computation.
      await this.session(principal, sessionId);
      const block = await this.repo.block(principal, sessionId, blockId);
      if (!block || block.type !== 'diagram') throw new NotFoundException();
      this.assertDiagramBinding(block, command);
      const prior = block.projectileSnapshot ? petrosProjectileSnapshotSchema.parse(block.projectileSnapshot) : null;
      const policy = await this.authority(principal, sessionId, command, prior);
      const receipt = await this.repo.receipt(principal, blockId, command.operationId);
      if (receipt) return { replay: this.replay(receipt, commandHash), prior, policy };
      if ((prior?.version ?? 0) !== command.expectedVersion) throw conflict('PETROS_PROJECTILE_STALE');
      if (prior && hash(prior.binding) !== hash(command.binding)) throw conflict('PETROS_PROJECTILE_BINDING_CHANGED');
      if ((command.action.kind === 'initialise') !== (prior === null)) throw conflict('PETROS_PROJECTILE_INITIALISATION_CONFLICT');
      return { replay: null, prior, policy };
    });
    if (prepared.replay) return prepared.replay;
    signal?.throwIfAborted();
    // No tenant transaction or provider exists across this fixed, bounded analytic kernel.
    const state = command.action.kind === 'initialise'
      ? evaluatePetrosProjectile(command.action.input)
      : updatePetrosProjectileParameter(prepared.prior!.state, command.action.change);
    const next = petrosProjectileSnapshotSchema.parse({ schemaVersion: 'petros.projectile-snapshot.v1',
      version: command.expectedVersion + 1, binding: command.binding, state, policy: prepared.policy,
      operationId: command.operationId, commandHash });
    return this.transaction(principal, async () => {
      this.enabled();
      await this.authority(principal, sessionId, command, next);
      const block = await this.repo.block(principal, sessionId, blockId, true);
      if (!block || block.type !== 'diagram') throw new NotFoundException();
      this.assertDiagramBinding(block, command);
      const receipt = await this.repo.receipt(principal, blockId, command.operationId);
      if (receipt) return this.replay(receipt, commandHash);
      const prior = block.projectileSnapshot ? petrosProjectileSnapshotSchema.parse(block.projectileSnapshot) : null;
      if ((prior?.version ?? 0) !== command.expectedVersion || hash(prior) !== hash(prepared.prior))
        throw conflict('PETROS_PROJECTILE_STALE');
      signal?.throwIfAborted();
      await this.repo.commit(principal, blockId, next);
      await this.record(principal, sessionId, blockId, command, 'committed', next.version);
      signal?.throwIfAborted();
      return { status: 'available' as const, snapshot: next, replayed: false };
    });
  }

  async cancel(principal: Principal, sessionId: string, blockId: string, raw: unknown) {
    this.enabled();
    const command = petrosProjectileCommandSchema.parse(raw);
    if (command.binding.originalDiagramBlockId !== blockId) throw conflict('PETROS_PROJECTILE_BINDING_SCOPE');
    const commandHash = hash(command);
    return this.transaction(principal, async () => {
      const initial = await this.repo.block(principal, sessionId, blockId);
      const prior = initial?.projectileSnapshot ? petrosProjectileSnapshotSchema.parse(initial.projectileSnapshot) : null;
      await this.authority(principal, sessionId, command, prior);
      const block = await this.repo.block(principal, sessionId, blockId, true);
      if (!block || block.type !== 'diagram') throw new NotFoundException();
      this.assertDiagramBinding(block, command);
      const receipt = await this.repo.receipt(principal, blockId, command.operationId);
      if (receipt) return this.replay(receipt, commandHash); // Already committed is reported honestly.
      if ((block.projectileSnapshot ? petrosProjectileSnapshotSchema.parse(block.projectileSnapshot).version : 0) !== command.expectedVersion)
        throw conflict('PETROS_PROJECTILE_STALE');
      await this.repo.cancel(principal, blockId, command.operationId, commandHash);
      await this.record(principal, sessionId, blockId, command, 'cancelled', command.expectedVersion);
      return { status: 'cancelled' as const, operationId: command.operationId };
    });
  }
  private async record(principal: Principal, sessionId: string, blockId: string, command: PetrosProjectileCommand,
    status: string, version: number) {
    const metadata = { capability: command.binding.capability, status, version, learningEvidenceCreated: false };
    await this.loop.recordEvent({ institutionId: principal.institutionId, studentId: principal.studentId,
      sessionId, blockId, type: 'visual.projectile_command', payload: metadata, correlationId: command.operationId });
    await this.audit.logAudit({ actorType: ActorType.InstitutionUser, actorId: principal.institutionUserId,
      institutionId: principal.institutionId, module: 'petros', action: 'petros.visual.projectile_command',
      entityType: 'petros_teaching_block', entityId: blockId, correlationId: command.operationId, newState: metadata });
  }
}
