import { buildCompanionCue } from './petros-companion-cues';
import { timePetrosStage } from './petros-performance';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { ApiEnv } from '@edrion/config';
import { and, eq, lt, runInStudentTenant, schema, sql, type Database } from '@edrion/database';
import { randomUUID } from 'node:crypto';
import {
  applyStudentCanvasCommand,
  allocationExplanationReady,
  applyTrustedCanvasOperations,
  initialSharedCanvas,
  restoreStudentPracticeState,
  validateSharedCanvas,
  m4AdmissionSchema,
  m4CommandSchema,
  m4CommitSchema,
  m4SnapshotSchema,
  m4ReceiptSchema,
  m4PublicTaskSchema,
  m4EvaluationSchema,
  composeLearningUI,
  type M4Receipt,
  type M4Snapshot,
  type SharedCanvasState,
  type M4Evaluation,
} from '@edrion/schemas';
import { API_ENV, DATABASE } from '../../../common/tokens';
import { StudentAuthService } from '../auth/student-auth.service';
import { SurfacesService } from '../surfaces/surfaces.service';
import type { InstitutionalStudentPrincipal as Owner } from '../student.types';
import { PetrosEvidenceAdmissionService } from '../../petros-learner-model/petros-evidence-admission.service';
import { PetrosContentUnitRepository } from '../knowledge/petros-content-unit.repository';
import { PetrosV2SessionRepository } from './petros-v2-session.repository';
import {
  m4Hash,
  m4EvaluationMatchesManifest,
  m4PublicationSchema,
  m4StateSchema,
  type M4State,
  type M4Publication,
} from './petros-v2-contracts.server';

import { PetrosV2OrchestratorService } from './petros-v2-orchestrator.service';
import { runTrustedExperiment } from './petros-equation-validator';
import { compileTeachingExperience } from './petros-experience-compiler';
import { completedEquationSteps } from './petros-teaching-actions';
import type { PetrosTeachingContext } from './petros-v2-context';

const conflict = (code: string) =>
  new ConflictException({
    code,
    message:
      code === 'M5_EXPLANATION_REQUIRED'
        ? 'Finish or cancel your current test, then save an explanation of your latest result before continuing.'
        : code === 'M4_REVISION_CONFLICT'
          ? 'Your lesson changed. Your local work is still available; refresh before trying again.'
          : 'This action is not available in the current lesson state.',
  });
const missing = () =>
  new NotFoundException({ code: 'M4_UNAVAILABLE', message: 'This lesson is not available.' });
type Session = NonNullable<Awaited<ReturnType<PetrosV2SessionRepository['session']>>>;
export const M4_EXECUTION = 'petros.m4.evaluation.v1';
@Injectable()
export class PetrosV2SessionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly repo: PetrosV2SessionRepository,
    private readonly auth: StudentAuthService,
    private readonly surfaces: SurfacesService,
    private readonly evidence: PetrosEvidenceAdmissionService,
    private readonly sources: PetrosContentUnitRepository,
  ) {}
  get enabled() {
    return this.env.PETROS_V2_SESSIONS_ENABLED === true;
  }
  async scoped<T>(p: Owner, work: () => Promise<T>) {
    return timePetrosStage('transaction', () =>
      runInStudentTenant(this.db, p, async () => {
        await timePetrosStage('transaction_setup', async () => {
          await this.db.execute(sql`set local statement_timeout='10s'`);
          await this.db.execute(sql`set local lock_timeout='3s'`);
        });
        await timePetrosStage('owner_authorization', async () => {
          const current = await this.auth.resolveInstitutionalWorker(p.institutionUserId);
          if (
            current.institutionId !== p.institutionId ||
            current.studentId !== p.studentId ||
            !current.permissions.includes('student.learn.use') ||
            !(await this.surfaces.isPortalEnabled(current))
          )
            throw new ForbiddenException();
        });
        return work();
      }),
    );
  }
  private async authority(p: Owner, id: string, pin?: string) {
    const row = await this.repo.publication(id);
    if (!row) return null;
    const publication = m4PublicationSchema.parse(row.content);
    if (!publication.recipientIds.includes(p.studentId)) return null;
    if (m4Hash(publication) !== row.content_hash || (pin && pin !== row.content_hash)) return null;
    // Reuse the source owner's entitlement, restricted-role assertion and withdrawal lock order.
    try {
      await timePetrosStage('source_authority', () =>
        this.sources.resolveOriginal(publication.binding, publication.sourceHash, false, true),
      );
    } catch {
      return null;
    }
    return publication;
  }
  async entry(p: Owner) {
    if (!this.enabled)
      return {
        enabled: false,
        available: false,
        lessons: [],
        message: 'This lesson is not available yet.',
      };
    return this.scoped(p, async () => {
      const lessons = [];
      for (const r of await this.repo.available()) {
        const pub = await this.authority(p, r.id);
        if (!pub) continue;
        const existing = await this.repo.existing(p, r.id, randomUUID());
        const intent = await this.repo.intents.createV2ReleaseIntent(p, r.id, m4Hash(pub));
        if (intent)
          lessons.push({
            intentId: intent.id,
            title: pub.lesson.title,
            subject: pub.lesson.subject,
            objective: pub.lesson.objective.label,
            sessionId: existing?.id ?? null,
          });
      }
      return {
        enabled: true,
        available: lessons.length > 0,
        lessons,
        message: lessons.length
          ? 'Choose a lesson to continue.'
          : 'This lesson is not available yet.',
      };
    });
  }
  async engine(p: Owner, id: string) {
    return this.scoped(p, async () => {
      const row = await this.repo.engine(p, id);
      if (!row) throw missing();
      return row;
    });
  }
  async prepareIntent(p: Owner, publicationId: string) {
    return this.scoped(p, async () => {
      if (!this.enabled) throw conflict('M4_ADMISSION_DISABLED');
      const pub = await this.authority(p, publicationId);
      if (!pub) throw missing();
      const intent = await this.repo.intents.createV2ReleaseIntent(p, publicationId, m4Hash(pub));
      if (!intent) throw missing();
      return intent.id;
    });
  }
  async admit(p: Owner, raw: unknown) {
    if (!this.enabled) throw conflict('M4_ADMISSION_DISABLED');
    const input = m4AdmissionSchema.parse(raw);
    return this.scoped(p, async () => {
      await this.repo.lock(`admit:${p.studentId}`);
      const intent = await this.repo.intents.findIntent(p, input.intentId, true);
      if (
        !intent ||
        intent.schemaVersion !== 'petros.v2.admission-intent.v1' ||
        !['resolved', 'started'].includes(intent.status) ||
        intent.expiresAt.getTime() <= Date.now()
      )
        throw missing();
      const publicationId = String(intent.resolvedIntent.publicationId);
      const publication = await this.authority(p, publicationId, intent.sourceFingerprint);
      if (!publication) throw missing();
      const row = await this.repo.publication(publicationId);
      if (!row) throw missing();
      const existing = await this.repo.existing(p, publicationId, input.commandId);
      if (existing) {
        const old = m4StateSchema.parse(existing.state);
        if (
          old.publicationId !== publicationId ||
          (existing.clientRequestId === input.commandId && old.admissionIntentId !== input.intentId)
        )
          throw conflict('M4_COMMAND_ID_REUSED');
        await this.repo.intents.markStarted(p, intent.id, existing.id);
        return { id: existing.id, engine: 'v2' as const, resumed: existing.status !== 'closed' };
      }
      if (intent.sessionId) {
        const pinned = await this.owned(p, intent.sessionId);
        return { id: pinned.id, engine: 'v2' as const, resumed: pinned.status !== 'closed' };
      }
      const id = randomUUID(),
        state = m4StateSchema.parse({
          publicationId,
          publicationHash: row.content_hash,
          admissionIntentId: intent.id,
          requestedBy: p.institutionUserId,
          stage: 'admitting',
          epoch: 0,
          taskId: null,
          responseId: null,
          contentViewed: false,
          draft: '',
          workspaceId: null,
          checkpointId: null,
          undo: [],
          redo: [],
          blockedReason: null,
        });
      await this.repo.create(
        p,
        id,
        input.commandId,
        state,
        publication.lesson.title,
        publication.lesson.objective.label,
      );
      await this.repo.event(p, id, 'm4.admitting', {}, input.commandId);
      state.stage = 'planning';
      await this.repo.event(p, id, 'm4.planning', {}, input.commandId);
      state.stage = 'delivering';
      await this.repo.event(p, id, 'm4.delivering', {}, input.commandId);
      await this.repo.event(
        p,
        id,
        'm4.exposure',
        { kind: 'instruction_issued', publicationHash: state.publicationHash },
        input.commandId,
      );
      await this.repo.save(p, id, state, 'active', 0);
      await this.repo.intents.markStarted(p, intent.id, id);
      if (publication.canvas || publication.instruments.some((i) => i.teaching))
        await this.createWorkspace(p, id, state, publication);
      return { id, engine: 'v2' as const, resumed: false };
    });
  }
  private async owned(p: Owner, id: string) {
    const s = await this.repo.session(p, id);
    if (!s) throw missing();
    return s;
  }
  private async revalidate(p: Owner, s: Session, state: M4State) {
    const pub = await this.authority(p, state.publicationId, state.publicationHash);
    if (!pub && !state.blockedReason) {
      state.blockedReason =
        'This lesson is unavailable. Your submitted answer and saved work are preserved.';
      state.epoch++;
      s.version++;
      s.status = s.status === 'closed' ? 'closed' : 'paused';
      await this.repo.save(p, s.id, state, s.status, s.version);
      await this.repo.event(p, s.id, 'm4.authority_lost', {});
      // Append an invalidation; original response, evaluation and evidence remain immutable.
      const old = await this.repo.evaluation(p, s.id, state.responseId);
      if (old && old.result.status !== 'invalidated') {
        const result = m4EvaluationSchema.parse({
          ...old.result,
          id: randomUUID(),
          status: 'invalidated',
          supersedes: old.id,
          criteria: old.result.criteria.map((c) => ({
            ...c,
            status: 'abstained',
            origin: 'review_required',
            feedback: 'This feedback is no longer current.',
          })),
          reason: 'Current lesson authority is unavailable.',
        });
        await this.db.insert(schema.petrosV2Evaluations).values({
          id: result.id,
          institutionId: p.institutionId,
          studentId: p.studentId,
          sessionId: s.id,
          responseId: old.responseId,
          publicationHash: old.publicationHash,
          contractHash: old.contractHash,
          result,
          supersedes: old.id,
        });
        const event = await this.evidence.latestEvent(p, s.id);
        // No source-backed teaching is returned here. The immutable public lesson pin supplies lineage only.
        const previous = await this.db.execute<{ content: unknown }>(
          sql`select content from m4_historical_publication(${s.id}::uuid)`,
        );
        if (previous[0])
          await this.evidence.admit(
            p,
            s.id,
            m4PublicationSchema.parse(previous[0].content),
            result.id,
            event,
          );
      }
    }
    return pub;
  }
  async get(p: Owner, id: string): Promise<M4Snapshot> {
    return this.scoped(p, async () => {
      await this.repo.lock(id);
      const s = await this.owned(p, id),
        state = m4StateSchema.parse(s.state);
      const pub = await this.revalidate(p, s, state);
      return timePetrosStage('public_projection', () => this.snapshot(p, s, state, pub));
    });
  }
  private async snapshot(
    p: Owner,
    s: Session,
    state: M4State,
    pub: M4Publication | null,
  ): Promise<M4Snapshot> {
    const task = await this.repo.task(p, s.id, state.taskId),
      response = await this.repo.response(p, s.id, state.responseId),
      evaluation = await this.repo.evaluation(p, s.id, state.responseId);
    const workspace = state.workspaceId ? await this.repo.workspace(p, state.workspaceId) : null;
    const canvas = workspace
      ? validateSharedCanvas((workspace.snapshot as { canvas: unknown }).canvas)
      : null;
    const blocked = !!state.blockedReason;
    const assisted =
      task?.publicTask.helpPolicy === 'assisted_practice' &&
      (await this.repo.events(p, s.id)).some(
        (event) =>
          event.type === 'm4.exposure' &&
          event.payload.kind === 'answer_relevant_explanation' &&
          event.payload.taskId === task.id,
      );
    const status =
      s.status === 'closed'
        ? 'closed'
        : blocked
          ? 'blocked'
          : s.status === 'paused'
            ? 'paused'
            : 'active';
    let actions =
      status === 'closed'
        ? []
        : blocked
          ? ['close']
          : status === 'paused'
            ? ['resume', 'close', 'canvas_checkpoint']
            : state.stage === 'delivering' && !state.responseId
              ? [
                  'next',
                  'pause',
                  'close',
                  'interrupt',
                  'ask',
                  'replay_demo',
                  'canvas_edit',
                  'canvas_checkpoint',
                  'undo',
                  'redo',
                ]
              : state.stage === 'awaiting_response'
                ? [
                    'pause',
                    'close',
                    'interrupt',
                    'defer',
                    'canvas_edit',
                    'canvas_checkpoint',
                    'undo',
                    'redo',
                    ...(task?.publicTask.helpPolicy === 'assisted_practice' ? ['hint'] : []),
                  ]
                : ['pause', 'close', 'interrupt'];
    const teaching = !blocked && state.teaching && (!task || !!response) ? state.teaching : null;
    if (status === 'active' && pub?.instruments.some((i) => i.teaching)) {
      if (response && evaluation && !teaching) actions.push('teach');
      if (teaching?.status === 'presenting')
        actions = ['teaching_step', 'pause', 'interrupt', 'close', 'ask'];
      if (teaching?.status === 'participating')
        actions = [
          teaching.action.fragment.capability === 'simulation'
            ? 'complete_exploration'
            : 'practice',
          'canvas_edit',
          'undo',
          'redo',
          'canvas_checkpoint',
          'pause',
          'interrupt',
          'close',
        ];
      if (teaching?.status === 'complete') actions.push('verify', 'teach', 'experiment', 'ask');
    }
    const beat = teaching?.action.beats[Math.max(0, teaching.nextBeat - 1)];
    const revealedEquationIds = new Set(
      teaching?.action.beats
        .filter((accepted) => teaching.acceptedPrefix.includes(accepted.id))
        .flatMap((accepted) =>
          accepted.operations.flatMap((operation) =>
            operation.type === 'add' && operation.element.kind === 'equation'
              ? [operation.element.id]
              : [],
          ),
        ),
    );
    const history = await this.repo.historyCounts(p, s.id);
    const snapshot = m4SnapshotSchema.parse({
      engine: 'v2',
      id: s.id,
      lesson:
        blocked || !pub
          ? null
          : task && !response && !assisted
            ? {
                ...pub.lesson,
                explanation: 'The reviewed explanation is unavailable during this issued task.',
                excerpts: [],
                limitations: [],
              }
            : pub.lesson,
      status,
      stage: state.stage,
      revision: s.version,
      epoch: state.epoch,
      task: blocked ? null : (task?.publicTask ?? null),
      draft: state.draft,
      canvas: blocked ? null : canvas,
      checkpointId: state.checkpointId,
      teaching: teaching
        ? {
            capability: teaching.action.fragment.capability,
            decision: teaching.action.decision,
            actionId: teaching.action.id,
            caption: beat?.caption ?? teaching.action.fragment.explanation,
            nextBeat: teaching.nextBeat,
            beatCount: teaching.action.beats.length,
            status: teaching.status,
            reference: teaching.action.fragment.reference,
            accessibleAlternative: teaching.action.fragment.accessibleAlternative,
            limitations: teaching.action.fragment.limitations,
            cue:
              teaching.status === 'participating'
                ? 'yield'
                : teaching.action.decision.uncertainty === 'review_required'
                  ? 'uncertain'
                  : 'point',
            targetId: beat?.targetId ?? null,
            completedStepIds: completedEquationSteps(
              teaching.action.fragment,
              canvas,
              revealedEquationIds,
              response ?? null,
              evaluation?.result ?? null,
            ),
            progressResponseId: response?.id ?? null,
            equationSteps: teaching.action.fragment.equationSteps.filter(
              (step) =>
                revealedEquationIds.has(step.elementId) &&
                canvas?.elements.some(
                  (element) =>
                    element.kind === 'equation' &&
                    element.id === step.elementId &&
                    element.sourceId === `source-${teaching.action.fragment.reference.unitId}`,
                ),
            ),
            simulation: teaching.action.fragment.simulation,
            experiment: teaching.experiment ?? null,
          }
        : null,
      submission: response
        ? {
            id: response.id,
            commandId: response.commandId,
            status: evaluation ? 'complete' : 'pending',
            response: response.response,
          }
        : null,
      evaluation: blocked ? null : (evaluation?.result ?? null),
      actions,
      assistance: assisted ? 'assisted' : 'independent',
      progress: {
        contentViewed: state.contentViewed,
        responsesCommitted: history.committed,
        responsesEvaluated: history.evaluated,
        criteriaObserved: blocked ? 0 : await this.evidence.current(p, s.id),
        mastery: false,
      },
      message: blocked
        ? state.blockedReason
        : state.teachingNotice
          ? state.teachingNotice
          : response && !evaluation
            ? 'Your answer was submitted. Checking your response…'
            : evaluation?.result.status === 'unavailable'
              ? "Your answer is saved. Feedback isn't available yet."
              : evaluation?.result.status === 'review_required'
                ? 'Your response needs teacher review.'
                : status === 'paused'
                  ? 'Your lesson is paused. Your saved work is ready when you return.'
                  : 'Saved to your learning session.',
    });
    return {
      ...snapshot,
      learningUI: composeLearningUI(snapshot),
      companion: buildCompanionCue(snapshot),
    };
  }
  async command(p: Owner, id: string, raw: unknown): Promise<M4Receipt> {
    if (Buffer.byteLength(JSON.stringify(raw)) > 96 * 1024)
      throw new PayloadTooLargeException('M4_PAYLOAD_LIMIT');
    const input = m4CommandSchema.parse(raw);
    if (input.type === 'commit_activity_submission')
      return this.commit(p, id, input.taskId, {
        commandId: input.commandId,
        expectedRevision: input.expectedRevision,
        epoch: input.epoch,
        taskInstanceHash: input.taskInstanceHash,
        canvasRevision: input.canvasRevision,
        response: input.response,
      });
    return this.scoped(p, async () => {
      await this.repo.lock(id);
      const s = await this.owned(p, id),
        state = m4StateSchema.parse(s.state),
        hash = m4Hash(input);
      const pub = await this.revalidate(p, s, state),
        replay = await this.repo.command(p, id, input.commandId);
      if (replay) {
        if (replay.inputSha256 !== hash) throw conflict('M4_COMMAND_ID_REUSED');
        return m4ReceiptSchema.parse(replay.response);
      }
      if (input.expectedRevision !== s.version || input.epoch !== state.epoch)
        throw conflict('M4_REVISION_CONFLICT');
      if (s.status === 'closed') throw conflict('M4_SESSION_CLOSED');
      if (!pub && input.type !== 'close')
        return m4ReceiptSchema.parse({
          commandId: input.commandId,
          status: 'blocked',
          revision: s.version,
          epoch: state.epoch,
          responseId: state.responseId,
          message: state.blockedReason,
        });
      if (state.blockedReason && input.type !== 'close')
        throw conflict('M4_NEW_ADMISSION_REQUIRED');
      if (s.status === 'paused' && !['resume', 'close', 'canvas_checkpoint'].includes(input.type))
        throw conflict('M4_SESSION_PAUSED');
      if (input.type === 'teach') {
        if (
          !pub ||
          !state.responseId ||
          !(await this.repo.evaluation(p, id, state.responseId)) ||
          (state.teaching && state.teaching.status !== 'complete')
        )
          throw conflict('M5_TEACHING_NOT_AVAILABLE');
        const context = await this.teachingContext(p, s, state, pub);
        if (context.canvas?.invitation && !context.canvas.invitation.submitted)
          throw conflict('M5_STUDENT_EDIT_IN_PROGRESS');
        const freshCanvas = {
          ...initialSharedCanvas(
            context.canvas!.activityId,
            `teaching-${(state.teachingDecisions ?? 0) + 1}`,
          ),
          mode: 'session' as const,
          revision: context.canvas!.revision + 1,
        };
        context.canvas = freshCanvas;
        if (input.preference === 'experiment') context.requestedStrategy = 'bounded_experiment';
        if (input.preference === 'process') context.requestedStrategy = 'participation';
        if (input.preference === 'graph') {
          context.requestedStrategy = 'participation';
          context.requestedCapability = 'graph';
        }
        const decision = new PetrosV2OrchestratorService().decide(context);
        state.teachingNotice = decision.fragmentId ? '' : decision.reason;
        await this.repo.event(p, id, 'm5.decision', { decision }, input.commandId);
        if (decision.fragmentId) {
          const action = compileTeachingExperience(decision, context);
          state.undo = [];
          state.redo = [];
          await this.saveCanvas(p, id, state, freshCanvas, input.commandId, hash);
          state.teaching = {
            action,
            nextBeat: 0,
            status: 'presenting',
            acceptedPrefix: [],
            timeline: {
              schemaVersion: 'petros.v2.presentation-checkpoint.v1',
              timelineId: action.id,
              epoch: state.epoch,
              beats: action.beats.map((beat) => ({
                id: beat.id,
                actionId: action.id,
                canvasOperationIds: beat.operations.map(() => randomUUID()),
                speechSegmentId: null,
                cueId: randomUUID(),
                studentCheckpointId: null,
                barrier: 'semantic_operation',
              })),
              completedOperations: [],
              completedBeatIds: [],
              audioAck: null,
              state: 'playing',
              resumeEpoch: state.epoch,
            },
          };
        }
        state.teachingDecisions = (state.teachingDecisions ?? 0) + 1;
      } else if (input.type === 'teaching_step') {
        const runtime = state.teaching;
        if (
          !pub ||
          !runtime ||
          runtime.status !== 'presenting' ||
          runtime.action.id !== input.actionId ||
          runtime.nextBeat !== input.nextBeat
        )
          throw conflict('M5_STALE_PRESENTATION');
        // Epoch changes cancel callbacks; an explicit new command may resume the accepted prefix.
        const w = await this.repo.workspace(p, state.workspaceId!);
        const canvas = validateSharedCanvas(w?.snapshot.canvas),
          beat = runtime.action.beats[runtime.nextBeat];
        if (!beat || canvas.revision !== runtime.action.expectedCanvasRevision + runtime.nextBeat)
          throw conflict('M5_CANVAS_CONFLICT');
        const next = applyTrustedCanvasOperations(canvas, beat.operations, canvas.revision, {
          commandId: input.commandId,
          sessionId: id,
          at: new Date().toISOString(),
          sourceRevisionId: runtime.action.fragment.reference.sourceRevisionId,
          sourceHash: runtime.action.fragment.reference.sourceHash,
        });
        next.completedActionIds.push(`m5-${runtime.action.id}-${beat.id}`);
        next.lastActionSequence++;
        runtime.nextBeat++;
        if (runtime.nextBeat === runtime.action.beats.length) {
          next.authorizedSourceIds = [
            runtime.action.fragment.reference,
            ...(runtime.action.fragment.additionalSources ?? []).map((s) => s.reference),
          ].map((r) => `source-${r.unitId}`);
          next.invitation = runtime.action.fragment.checkpoint;
          runtime.status = next.invitation ? 'participating' : 'complete';
        }
        runtime.acceptedPrefix.push(beat.id);
        runtime.timeline.completedBeatIds.push(beat.id);
        runtime.timeline.completedOperations.push(
          ...runtime.timeline.beats[runtime.nextBeat - 1]!.canvasOperationIds,
        );
        runtime.timeline.resumeEpoch = state.epoch;
        runtime.timeline.state =
          runtime.status === 'presenting'
            ? 'playing'
            : runtime.status === 'participating'
              ? 'paused'
              : 'completed';
        await this.saveCanvas(p, id, state, next, input.commandId, hash);
        if (beat.operations.some((op) => op.type === 'add' && op.element.kind === 'allocation'))
          await this.repo.event(
            p,
            id,
            'm4.exposure',
            {
              kind: 'answer_relevant_explanation',
              taskId: state.taskId,
              actionId: runtime.action.id,
            },
            input.commandId,
          );
        await this.repo.event(
          p,
          id,
          'm5.semantic_operation',
          { actionId: runtime.action.id, beatId: beat.id, canvasRevision: next.revision },
          input.commandId,
        );
      } else if (input.type === 'complete_exploration') {
        const runtime = state.teaching;
        if (
          !runtime ||
          runtime.status !== 'participating' ||
          runtime.action.fragment.capability !== 'simulation'
        )
          throw conflict('M5_ACTIVITY_UNAVAILABLE');
        const workspace = await this.repo.workspace(p, state.workspaceId!);
        const canvas = validateSharedCanvas(workspace?.snapshot.canvas);
        const labs = canvas.elements.filter((e) => e.kind === 'allocation');
        if (
          !labs.length ||
          labs.some(
            (e) =>
              e.kind === 'allocation' &&
              (!allocationExplanationReady(e.resource, e.annotation) ||
                !e.resource.observations.some((o) => o.prediction)),
          )
        )
          throw conflict('M5_EXPLANATION_REQUIRED');
        for (const e of labs)
          if (e.kind === 'allocation') {
            const a = e.resource.attempts?.find((a) => a.id === e.resource.activeAttemptId);
            if (a?.status === 'explained') a.status = 'completed';
          }
        canvas.invitation!.submitted = true;
        canvas.revision++;
        runtime.status = 'complete';
        runtime.timeline.state = 'completed';
        state.undo = [];
        state.redo = [];
        await this.saveCanvas(p, id, state, canvas, input.commandId, hash);
        await this.repo.event(
          p,
          id,
          'm5.exploration_saved',
          { checkpointId: state.checkpointId, actionId: runtime.action.id, assessed: false },
          input.commandId,
        );
      } else if (input.type === 'experiment') {
        const runtime = state.teaching;
        if (
          !runtime ||
          runtime.status !== 'complete' ||
          !runtime.action.fragment.simulation ||
          runtime.action.fragment.simulation.kernel !== input.input.kernel
        )
          throw conflict('M5_EXPERIMENT_UNAVAILABLE');
        const result = runTrustedExperiment(input.input);
        runtime.experiment = {
          kernel: input.input.kernel,
          input: input.input,
          values: Object.fromEntries(
            Object.entries(result.output).filter(
              (entry): entry is [string, number] => typeof entry[1] === 'number',
            ),
          ),
          summary: result.assumptions.join(' ') + ' ' + result.limitations.join(' '),
        };
        await this.repo.event(p, id, 'm5.experiment', { result }, input.commandId);
      } else if (input.type === 'practice' || input.type === 'verify') {
        if (
          !pub ||
          !state.teaching ||
          (input.type === 'practice'
            ? state.teaching.status !== 'participating'
            : state.teaching.status !== 'complete')
        )
          throw conflict('M5_ACTIVITY_UNAVAILABLE');
        const role = input.type === 'practice' ? 'practice' : 'verification';
        const used = new Set(
          (
            await this.db
              .select({ id: schema.petrosV2Tasks.candidateId })
              .from(schema.petrosV2Tasks)
              .where(
                and(
                  eq(schema.petrosV2Tasks.sessionId, id),
                  eq(schema.petrosV2Tasks.studentId, p.studentId),
                ),
              )
          ).map((t) => t.id),
        );
        let pin: M4Publication['instruments'][number] | undefined;
        for (const candidate of pub.instruments.filter(
          (i) =>
            i.teaching?.taskRole === role &&
            !used.has(i.candidateId) &&
            (role === 'verification' ||
              i.teaching!.fragmentIds.includes(state.teaching!.action.fragment.id)),
        )) {
          const instrument = await this.repo.publicInstrument(
            state.publicationId,
            candidate.candidateId,
          );
          if (!instrument) continue;
          if (role === 'verification') {
            const q = schema.petrosV2Tasks;
            const seen = await this.db
              .select({ id: q.id })
              .from(q)
              .where(
                and(
                  eq(q.institutionId, p.institutionId),
                  eq(q.studentId, p.studentId),
                  eq(q.equivalenceKey, instrument.equivalence_key),
                ),
              )
              .limit(1);
            if (seen.length) continue;
          }
          pin = candidate;
          break;
        }
        if (!pin) throw conflict('M5_FRESH_QUALIFIED_TASK_UNAVAILABLE');
        if (role === 'practice') {
          const workspace = await this.repo.workspace(p, state.workspaceId!);
          const canvas = validateSharedCanvas(workspace?.snapshot.canvas);
          if (
            canvas.elements.some(
              (e) =>
                e.kind === 'allocation' && !allocationExplanationReady(e.resource, e.annotation),
            )
          )
            throw conflict('M5_EXPLANATION_REQUIRED');
          if (canvas.elements.some((e) => e.kind === 'allocation')) {
            for (const e of canvas.elements)
              if (e.kind === 'allocation') {
                const a = e.resource.attempts?.find((a) => a.id === e.resource.activeAttemptId);
                if (a?.status === 'explained') a.status = 'completed';
              }
            canvas.revision++;
            await this.saveCanvas(p, id, state, canvas, input.commandId, hash);
          }
        }
        if (role === 'verification') {
          // A clean assessment workspace; old instruction stays in immutable checkpoints.
          const canvas = initialSharedCanvas(`activity-${randomUUID()}`);
          canvas.mode = 'session';
          await this.saveCanvas(p, id, state, canvas, input.commandId, hash);
        }
        state.taskId = null;
        state.responseId = null;
        state.draft = '';
        state.undo = [];
        state.redo = [];
        state.stage = 'awaiting_response';
        state.teaching = null;
        await this.issue(p, id, state, pub, input.commandId, pin);
        if (role === 'practice')
          await this.repo.event(
            p,
            id,
            'm4.exposure',
            { kind: 'answer_relevant_explanation', taskId: state.taskId },
            input.commandId,
          );
        if (role === 'verification')
          await this.repo.event(
            p,
            id,
            'm5.independent_boundary',
            { taskId: state.taskId, reviewId: pin.reviewId },
            input.commandId,
          );
      } else if (input.type === 'pause' || input.type === 'defer') {
        s.status = 'paused';
        state.epoch++;
        if (state.teaching) {
          state.teaching.timeline.state = 'paused';
          state.teaching.timeline.resumeEpoch = state.epoch;
        }
      } else if (input.type === 'resume') {
        if (s.status !== 'paused') throw conflict('M4_INVALID_TRANSITION');
        s.status = 'active';
        state.epoch++;
      } else if (input.type === 'close') {
        s.status = 'closed';
        state.epoch++;
      } else if (input.type === 'interrupt') {
        state.epoch++;
        if (state.teaching) {
          state.teaching.timeline.state = 'interrupted';
          state.teaching.timeline.resumeEpoch = state.epoch;
        }
        await this.repo.event(p, id, 'm4.interrupt', { epoch: state.epoch }, input.commandId);
      } else if (input.type === 'next') {
        if (state.stage !== 'delivering' || state.taskId || !pub)
          throw conflict('M4_INVALID_TRANSITION');
        state.contentViewed = true;
        state.stage = 'awaiting_response';
        await this.issue(p, id, state, pub, input.commandId);
      } else if (input.type === 'hint') {
        const task = await this.repo.task(p, id, state.taskId);
        if (
          state.stage !== 'awaiting_response' ||
          task?.publicTask.helpPolicy !== 'assisted_practice'
        )
          throw conflict('M4_HINT_UNAVAILABLE');
        // No generated pre-answer coaching. Re-read the approved public explanation only.
        await this.repo.event(
          p,
          id,
          'm4.exposure',
          { kind: 'answer_relevant_explanation', taskId: state.taskId },
          input.commandId,
        );
      } else if (input.type === 'ask') {
        if (state.taskId && !state.responseId) throw conflict('M4_ASSESSMENT_HELP_RESTRICTED');
        if (
          input.target &&
          !pub?.lesson.references.some((reference) => m4Hash(reference) === m4Hash(input.target))
        )
          throw conflict('M4_SOURCE_TARGET_UNAVAILABLE');
        await this.repo.event(
          p,
          id,
          'm4.exposure',
          { kind: 'source_access', ...(input.target ? { target: input.target } : {}) },
          input.commandId,
        );
      } else if (input.type === 'replay_demo') {
        if (state.stage !== 'delivering' || state.responseId)
          throw conflict('M4_REPLAY_UNAVAILABLE');
        await this.repo.event(p, id, 'm4.exposure', { kind: 'replay' }, input.commandId);
      } else if (input.type === 'canvas_checkpoint') {
        if (state.responseId && state.teaching?.status !== 'participating')
          throw conflict('M4_RESPONSE_ALREADY_COMMITTED');
        if (input.canvasRevision !== (await this.canvasRevision(p, state)))
          throw conflict('M4_CANVAS_CONFLICT');
        state.draft = input.draft;
        if (state.workspaceId)
          await this.saveCanvas(
            p,
            id,
            state,
            validateSharedCanvas(
              (await this.repo.workspace(p, state.workspaceId))!.snapshot.canvas,
            ),
            input.commandId,
            hash,
          );
      } else if (input.type === 'canvas_edit' || input.type === 'undo' || input.type === 'redo') {
        if (!state.workspaceId || (state.responseId && state.teaching?.status !== 'participating'))
          throw conflict('M4_CANVAS_LOCKED');
        const w = await this.repo.workspace(p, state.workspaceId);
        if (!w) throw conflict('M4_CANVAS_UNAVAILABLE');
        const canvas = validateSharedCanvas(w.snapshot.canvas);
        let next: SharedCanvasState;
        try {
          if (input.type === 'canvas_edit') {
            next = applyStudentCanvasCommand(canvas, input.edit, {
              commandId: input.commandId,
              sessionId: id,
              at: new Date().toISOString(),
              sourceRevisionId: pub!.sourceRevisionId,
              sourceHash: pub!.sourceHash,
            });
            state.redo = [];
          } else {
            const history = input.type === 'undo' ? state.undo : state.redo,
              targetId = history.pop();
            if (!targetId) throw new Error('History unavailable');
            const target = await this.repo.checkpoint(p, w.id, targetId);
            if (!target) throw new Error('Checkpoint unavailable');
            next = restoreStudentPracticeState(
              canvas,
              validateSharedCanvas(target.snapshot.canvas),
              {
                commandId: input.commandId,
                sessionId: id,
                at: new Date().toISOString(),
                sourceRevisionId: pub!.sourceRevisionId,
                sourceHash: pub!.sourceHash,
              },
            );
            if (input.type === 'undo') state.redo.push(state.checkpointId!);
            else state.undo.push(state.checkpointId!);
          }
        } catch {
          throw conflict('M4_CANVAS_CONFLICT');
        }
        if (input.type === 'canvas_edit' && state.checkpointId)
          state.undo = [...state.undo, state.checkpointId].slice(-50);
        await this.saveCanvas(p, id, state, next, input.commandId, hash);
      }
      s.version++;
      await this.repo.save(p, id, state, s.status, s.version);
      const receipt = m4ReceiptSchema.parse({
        commandId: input.commandId,
        status: 'committed',
        revision: s.version,
        epoch: state.epoch,
        responseId: state.responseId,
        message:
          input.type === 'hint'
            ? 'Review the lesson explanation. This attempt will be recorded as assisted practice.'
            : 'Your change is saved.',
      });
      await this.db.insert(schema.petrosSessionCommands).values({
        institutionId: p.institutionId,
        studentId: p.studentId,
        sessionId: id,
        idempotencyKey: input.commandId,
        command: `m4.${input.type}`,
        inputSha256: hash,
        requestedBy: p.institutionUserId,
        status: 'completed',
        response: receipt,
        completedAt: new Date(),
      });
      await this.repo.event(
        p,
        id,
        `m4.${input.type}`,
        { revision: s.version, epoch: state.epoch },
        input.commandId,
      );
      return receipt;
    });
  }
  private async issue(
    p: Owner,
    id: string,
    state: M4State,
    pub: M4Publication,
    commandId: string,
    selected?: M4Publication['instruments'][number],
  ) {
    const pin =
        selected ?? pub.instruments.find((i) => !i.teaching || i.teaching.taskRole === 'initial')!,
      instrument = await this.repo.publicInstrument(state.publicationId, pin.candidateId);
    if (!instrument) throw conflict('M4_TASK_UNAVAILABLE');
    const taskId = randomUUID(),
      instanceHash = m4Hash({
        taskId,
        publicationHash: state.publicationHash,
        ...pin,
        objective: pub.lesson.objective,
        sourceHash: pub.sourceHash,
      });
    const publicTask = m4PublicTaskSchema.parse({
      ...(instrument.public_task as object),
      taskId,
      instanceHash,
    });
    await this.db.insert(schema.petrosV2Tasks).values({
      id: taskId,
      institutionId: p.institutionId,
      studentId: p.studentId,
      sessionId: id,
      candidateId: pin.candidateId,
      reviewId: pin.reviewId,
      contractHash: pin.hash,
      instanceHash,
      equivalenceKey: instrument.equivalence_key,
      publicTask,
    });
    state.taskId = taskId;
    await this.repo.event(
      p,
      id,
      'm4.exposure',
      { kind: 'task_issued', taskId, equivalenceKey: instrument.equivalence_key },
      commandId,
    );
  }
  private async canvasRevision(p: Owner, state: M4State) {
    return state.workspaceId
      ? validateSharedCanvas((await this.repo.workspace(p, state.workspaceId))?.snapshot.canvas)
          .revision
      : 0;
  }
  async commit(p: Owner, id: string, taskId: string, raw: unknown): Promise<M4Receipt> {
    const input = m4CommitSchema.parse(raw),
      hash = m4Hash({ taskId, ...input });
    if (Buffer.byteLength(JSON.stringify(input.response)) > 64 * 1024)
      throw new PayloadTooLargeException('M4_RESPONSE_LIMIT');
    return this.scoped(p, async () => {
      await this.repo.lock(`submit:${p.studentId}`);
      await this.repo.lock(id);
      const s = await this.owned(p, id),
        state = m4StateSchema.parse(s.state);
      const pub = await this.revalidate(p, s, state),
        replay = await this.repo.command(p, id, input.commandId);
      if (replay) {
        if (replay.inputSha256 !== hash) throw conflict('M4_COMMAND_ID_REUSED');
        return m4ReceiptSchema.parse(
          replay.response ?? {
            commandId: input.commandId,
            status: 'pending',
            revision: s.version,
            epoch: state.epoch,
            responseId: state.responseId,
            message: 'Your answer is saved.',
          },
        );
      }
      if (!pub || state.blockedReason)
        return m4ReceiptSchema.parse({
          commandId: input.commandId,
          status: 'blocked',
          revision: s.version,
          epoch: state.epoch,
          responseId: state.responseId,
          message: state.blockedReason,
        });
      if (s.status !== 'active' || state.stage !== 'awaiting_response' || state.responseId)
        throw conflict('M4_RESPONSE_NOT_ACCEPTED');
      if (input.expectedRevision !== s.version || input.epoch !== state.epoch)
        throw conflict('M4_REVISION_CONFLICT');
      const commands = schema.petrosSessionCommands;
      const busy = await this.db
        .select({ id: commands.id })
        .from(commands)
        .where(
          and(
            eq(commands.institutionId, p.institutionId),
            eq(commands.studentId, p.studentId),
            sql`${commands.executionVersion} is not null AND ${commands.executionState} in ('queued','running')`,
          ),
        )
        .limit(1);
      if (busy.length) throw conflict('M4_PENDING_EVALUATION_EXISTS');
      const task = await this.repo.task(p, id, state.taskId);
      if (
        !task ||
        task.id !== taskId ||
        state.taskId !== taskId ||
        task.instanceHash !== input.taskInstanceHash
      )
        throw conflict('M4_TASK_INSTANCE_CONFLICT');
      const publicTask = m4PublicTaskSchema.parse(task.publicTask);
      if (publicTask.responseKind !== input.response.kind)
        throw conflict('M4_RESPONSE_KIND_INVALID');
      if (
        input.response.kind === 'choice' &&
        !publicTask.choices.some((c) => c.id === (input.response as { choiceId: string }).choiceId)
      )
        throw conflict('M4_CHOICE_INVALID');
      if (input.response.kind === 'structured') {
        const values = input.response.values;
        if (
          Object.keys(values).length !== publicTask.fields.length ||
          publicTask.fields.some(
            (f) =>
              !(f.id in values) ||
              (f.kind === 'number' && typeof values[f.id] !== 'number') ||
              (f.kind !== 'number' && typeof values[f.id] !== 'string') ||
              (f.kind === 'choice' && !f.choices.some((c) => c.id === values[f.id])) ||
              (f.kind === 'text' && !String(values[f.id]).trim()),
          )
        )
          throw conflict('M4_STRUCTURED_RESPONSE_INVALID');
      }
      if (input.canvasRevision !== (await this.canvasRevision(p, state)))
        throw conflict('M4_CANVAS_CONFLICT');
      if (
        input.response.kind === 'canvas_snapshot' &&
        input.response.checkpointId !== state.checkpointId
      )
        throw conflict('M4_CHECKPOINT_CONFLICT');
      const events = await this.repo.events(p, id),
        q = schema.petrosV2Tasks;
      // Only an unused, separately reviewed transfer family can start a new independent boundary.
      // Earlier exposure remains historical and is never removed. Any subsequent help is still assisted.
      const boundary = events.findIndex(
        (e) => e.type === 'm5.independent_boundary' && e.payload.taskId === task.id,
      );
      const exposureEvents = boundary >= 0 ? events.slice(boundary + 1) : events;
      const repeated = await this.db
        .select({ id: q.id })
        .from(q)
        .where(
          and(
            eq(q.institutionId, p.institutionId),
            eq(q.studentId, p.studentId),
            eq(q.equivalenceKey, task.equivalenceKey),
            lt(q.issuedAt, task.issuedAt),
          ),
        )
        .limit(1);
      const responseId = randomUUID(),
        workspace = state.workspaceId ? await this.repo.workspace(p, state.workspaceId) : null;
      if (workspace) {
        const canvas = validateSharedCanvas(workspace.snapshot.canvas);
        if (canvas.invitation) canvas.invitation.submitted = true;
        canvas.revision++;
        await this.saveCanvas(p, id, state, canvas, input.commandId, hash);
      }
      await this.db.insert(schema.petrosV2Responses).values({
        id: responseId,
        institutionId: p.institutionId,
        studentId: p.studentId,
        sessionId: id,
        taskId,
        commandId: input.commandId,
        response: input.response,
        responseHash: m4Hash(input.response),
        taskInstanceHash: task.instanceHash,
        sessionRevision: s.version,
        epoch: state.epoch,
        canvasRevision: workspace
          ? validateSharedCanvas(
              (await this.repo.workspace(p, state.workspaceId!))!.snapshot.canvas,
            ).revision
          : input.canvasRevision,
        checkpointId: state.checkpointId,
        snapshotHash: workspace
          ? m4Hash((await this.repo.workspace(p, state.workspaceId!))!.snapshot)
          : null,
        exposure: {
          assisted:
            events.length >= 1000 ||
            exposureEvents.some(
              (e) =>
                e.type === 'm4.exposure' &&
                [
                  'answer_relevant_explanation',
                  'solution_bearing_source_access',
                  'source_access',
                  'replay',
                ].includes(String(e.payload.kind)),
            ),
          repeated: repeated.length > 0,
          outsideHelp: 'unknown',
          eventIds: events.filter((e) => e.type === 'm4.exposure').map((e) => e.id),
        },
      });
      state.responseId = responseId;
      state.stage = 'evaluating';
      s.version++;
      await this.repo.save(p, id, state, s.status, s.version);
      const receipt = m4ReceiptSchema.parse({
        commandId: input.commandId,
        status: 'pending',
        revision: s.version,
        epoch: state.epoch,
        responseId,
        message: 'Your answer was submitted. Checking your response…',
      });
      await this.db.insert(schema.petrosSessionCommands).values({
        institutionId: p.institutionId,
        studentId: p.studentId,
        sessionId: id,
        idempotencyKey: input.commandId,
        command: 'm4.evaluate',
        inputSha256: hash,
        requestedBy: p.institutionUserId,
        status: 'in_progress',
        response: null,
        executionVersion: M4_EXECUTION,
        executionState: 'queued',
        executionInput: { responseId, receipt },
        sourceFingerprint: state.publicationHash,
        nextDispatchAt: new Date(),
      });
      await this.repo.event(p, id, 'm4.response_committed', { responseId }, input.commandId);
      return receipt;
    });
  }
  async operation(p: Owner, id: string, commandId: string) {
    return this.scoped(p, async () => {
      const s = await this.owned(p, id),
        c = await this.repo.command(p, id, commandId);
      if (!c) throw missing();
      return m4ReceiptSchema.parse(
        c.response ?? { ...(c.executionInput?.receipt as object), revision: s.version },
      );
    });
  }
  async due() {
    return this.db.execute<{ session_id: string; requested_by: string }>(
      sql`select * from m4_due_commands()`,
    );
  }
  async workerPrincipal(userId: string) {
    return this.auth.resolveInstitutionalWorker(userId);
  }
  async claim(p: Owner, id: string) {
    return this.scoped(p, async () => {
      await this.repo.lock(id);
      const s = await this.owned(p, id),
        state = m4StateSchema.parse(s.state),
        response = await this.repo.response(p, id, state.responseId),
        task = await this.repo.task(p, id, state.taskId);
      if (!response || !task) return null;
      const c = await this.repo.command(p, id, response.commandId);
      if (
        !c ||
        c.executionState === 'succeeded' ||
        (c.executionState === 'running' &&
          c.executionLeaseUntil &&
          c.executionLeaseUntil.getTime() > Date.now())
      )
        return null;
      const exhausted = c.executionAttempts >= 3;
      const pub = await this.revalidate(p, s, state);
      const fence = c.executionFence + 1;
      await this.db
        .update(schema.petrosSessionCommands)
        .set({
          executionState: 'running',
          executionAttempts: Math.min(3, c.executionAttempts + 1),
          executionFence: fence,
          executionLeaseUntil: new Date(Date.now() + 30_000),
          nextDispatchAt: null,
        })
        .where(eq(schema.petrosSessionCommands.id, c.id));
      return {
        institutionId: p.institutionId,
        studentId: p.studentId,
        sessionId: id,
        taskId: task.id,
        contractHash: task.contractHash,
        responseId: response.id,
        response: response.response,
        commandId: response.commandId,
        fence,
        publicationHash: state.publicationHash,
        authorized: !!pub && !state.blockedReason && !exhausted,
        objectiveId: pub?.lesson.objective.id ?? randomUUID(),
      };
    });
  }
  async publish(
    p: Owner,
    claim: NonNullable<Awaited<ReturnType<PetrosV2SessionService['claim']>>>,
    result: M4Evaluation,
  ) {
    return this.scoped(p, async () => {
      await this.repo.lock(claim.sessionId);
      const s = await this.owned(p, claim.sessionId),
        state = m4StateSchema.parse(s.state),
        c = await this.repo.command(p, s.id, claim.commandId);
      if (
        !c ||
        c.executionState !== 'running' ||
        c.executionFence !== claim.fence ||
        !c.executionLeaseUntil ||
        c.executionLeaseUntil.getTime() <= Date.now()
      )
        return false;
      const pub = await this.revalidate(p, s, state);
      let safe = m4EvaluationSchema.parse(result);
      if (safe.responseId !== state.responseId) throw conflict('M4_EVALUATION_RESPONSE_MISMATCH');
      if (pub && !state.blockedReason && ['evaluated', 'review_required'].includes(safe.status)) {
        const task = await this.repo.task(p, s.id, state.taskId);
        if (!task || task.id !== claim.taskId || task.contractHash !== claim.contractHash)
          throw conflict('M4_EVALUATION_TASK_MISMATCH');
        const [manifest] = await this.db.execute<{ manifest: unknown }>(
          sql`select m4_criterion_manifest(${state.publicationId}::uuid,${task.candidateId}::uuid) as manifest`,
        );
        if (!m4EvaluationMatchesManifest(safe, manifest?.manifest))
          throw conflict('M4_EVALUATION_CRITERIA_MISMATCH');
      }

      if (!pub || state.blockedReason)
        safe = m4EvaluationSchema.parse({
          ...safe,
          status: 'invalidated',
          criteria: safe.criteria.map((c) => ({
            ...c,
            status: 'abstained',
            origin: 'review_required',
            feedback: 'Feedback is unavailable while this lesson is withdrawn.',
          })),
          reason: 'Current authority unavailable.',
        });
      await this.db.insert(schema.petrosV2Evaluations).values({
        id: safe.id,
        institutionId: p.institutionId,
        studentId: p.studentId,
        sessionId: s.id,
        responseId: claim.responseId,
        publicationHash: state.publicationHash,
        contractHash: claim.contractHash,
        result: safe,
      });
      if (pub && !state.blockedReason) await this.evidence.admit(p, s.id, pub, safe.id);
      state.stage = 'delivering';
      s.version++;
      await this.repo.save(p, s.id, state, s.status, s.version);
      const receipt = m4ReceiptSchema.parse({
        commandId: claim.commandId,
        status: state.blockedReason
          ? 'blocked'
          : safe.status === 'unavailable'
            ? 'unavailable'
            : 'complete',
        revision: s.version,
        epoch: state.epoch,
        responseId: claim.responseId,
        message:
          state.blockedReason ??
          (safe.status === 'unavailable'
            ? "Your answer is saved. Feedback isn't available yet."
            : 'Your response has been checked.'),
      });
      await this.db
        .update(schema.petrosSessionCommands)
        .set({
          status: 'completed',
          executionState: 'succeeded',
          response: receipt,
          executionLeaseUntil: null,
          completedAt: new Date(),
        })
        .where(eq(schema.petrosSessionCommands.id, c.id));
      await this.repo.event(
        p,
        s.id,
        'm4.evaluation_completed',
        { evaluationId: safe.id, status: safe.status },
        claim.commandId,
      );
      return true;
    });
  }
  private async teachingContext(
    p: Owner,
    s: Session,
    state: M4State,
    pub: M4Publication,
  ): Promise<PetrosTeachingContext> {
    const task = await this.repo.task(p, s.id, state.taskId);
    const pin = pub.instruments.find((i) => i.candidateId === task?.candidateId);
    const manifest = pin?.teaching;
    if (!manifest) throw conflict('M5_REVIEWED_TEACHING_UNAVAILABLE');
    const responses = await this.db
      .select()
      .from(schema.petrosV2Responses)
      .where(
        and(
          eq(schema.petrosV2Responses.sessionId, s.id),
          eq(schema.petrosV2Responses.studentId, p.studentId),
          eq(schema.petrosV2Responses.institutionId, p.institutionId),
        ),
      )
      .orderBy(schema.petrosV2Responses.committedAt);
    const evidence = [];
    for (const response of responses) {
      const evaluation = await this.repo.evaluation(p, s.id, response.id);
      const task = await this.repo.task(p, s.id, response.taskId);
      if (evaluation && task)
        evidence.push({
          evaluation: m4EvaluationSchema.parse(evaluation.result),
          assisted: response.exposure.assisted,
          repeated: response.exposure.repeated,
          equivalenceKey: task.equivalenceKey,
          committed: response.responseHash === m4Hash(response.response),
        });
    }
    return {
      institutionId: p.institutionId,
      studentId: p.studentId,
      sessionId: s.id,
      objectiveId: pub.lesson.objective.id,
      publication: pub,
      publicationHash: state.publicationHash,
      epoch: state.epoch,
      canvas: validateSharedCanvas(
        (await this.repo.workspace(p, state.workspaceId!))?.snapshot.canvas,
      ),
      manifest,
      authority: { source: true, review: true, scope: true, currentEpoch: true },
      evidence,
      capabilities: [
        'source',
        'diagram',
        'equation',
        'graph',
        'table',
        'process',
        'simulation',
        'code_trace',
      ],
      accessibility: { textAlternative: true, reducedMotion: false },
      budget: {
        remainingDecisions: 20 - (state.teachingDecisions ?? 0),
        deadline: Date.now() + 20000,
        providerAuthorized: false,
      },
      independentTaskOpen: !!state.taskId && !state.responseId,
      selectedTarget: null,
      committedResponse: responses.find((r) => r.id === state.responseId)?.response,
    };
  }
  private async createWorkspace(p: Owner, id: string, state: M4State, pub: M4Publication) {
    const blockId = randomUUID(),
      decisionId = randomUUID(),
      canvas = validateSharedCanvas(
        pub.canvas ?? { ...initialSharedCanvas(`activity-${id}`), mode: 'session' },
      );
    await this.db.insert(schema.petrosPlanningDecisions).values({
      id: decisionId,
      sessionId: id,
      institutionId: p.institutionId,
      studentId: p.studentId,
      sequence: 1,
      selectedMoveType: 'layered_explanation',
      targetConcept: pub.lesson.objective.label,
      studentSafeReason: 'Reviewed lesson workspace.',
      decisionFactors: [],
      moveParameters: {},
      expectedEvidence: 'No evidence from viewing or editing.',
      progressEffect: {},
      termination: {},
      guessFirst: {},
      observationResponse: {},
      source: 'deterministic_fallback',
      functionKey: 'm4.bounded',
      promptVersion: 'm4',
      schemaVersion: 'm4',
      correlationId: randomUUID(),
    });
    await this.db.insert(schema.petrosTeachingBlocks).values({
      id: blockId,
      sessionId: id,
      decisionId,
      institutionId: p.institutionId,
      studentId: p.studentId,
      sequence: 1,
      type: 'layered_explanation',
      content: {},
      delivery: 'deterministic_fallback',
      functionKey: 'm4.bounded',
      promptVersion: 'm4',
      schemaVersion: 'm4',
      correlationId: randomUUID(),
    });
    state.workspaceId = blockId;
    await this.saveCanvas(p, id, state, canvas, randomUUID(), m4Hash(canvas));
    await this.repo.save(p, id, state, 'active', 0);
  }
  private async saveCanvas(
    p: Owner,
    id: string,
    state: M4State,
    canvas: SharedCanvasState,
    operationId: string,
    hash: string,
  ) {
    const workspaceId = state.workspaceId!;
    const old = await this.repo.workspace(p, workspaceId),
      version = (old?.version ?? 0) + 1,
      checkpointId = randomUUID();
    if (version > 500) throw conflict('M4_CHECKPOINT_LIMIT');
    const snapshot = {
      schemaVersion: 'petros.v2.workspace.v1',
      workspaceId,
      version,
      canvas,
      publicationHash: state.publicationHash,
      taskId: state.taskId,
      draft: state.draft,
      presentation: state.teaching?.timeline ?? null,
    };
    if (Buffer.byteLength(JSON.stringify(snapshot)) > 96 * 1024) throw conflict('M4_PAYLOAD_LIMIT');
    if (old)
      await this.db
        .update(schema.petrosWorkspaces)
        .set({ version, snapshot, updatedAt: new Date() })
        .where(eq(schema.petrosWorkspaces.id, workspaceId));
    else
      await this.db.insert(schema.petrosWorkspaces).values({
        id: workspaceId,
        institutionId: p.institutionId,
        studentId: p.studentId,
        sessionId: id,
        blockId: workspaceId,
        version,
        snapshot,
        policy: { schemaVersion: 'petros.v2.workspace-policy.v1' },
      });
    await this.db.insert(schema.petrosWorkspaceCheckpoints).values({
      id: checkpointId,
      workspaceId,
      institutionId: p.institutionId,
      studentId: p.studentId,
      version,
      branchId: canvas.branchId,
      parentCheckpointId: state.checkpointId,
      snapshot,
    });
    await this.db.insert(schema.petrosWorkspaceOperations).values({
      institutionId: p.institutionId,
      studentId: p.studentId,
      sessionId: id,
      blockId: workspaceId,
      operationId,
      commandHash: hash,
      status: 'committed',
      checkpointId,
      command: {
        schemaVersion: 'petros.v2.workspace-command.v1',
        programId: workspaceId,
        operationId,
        canvasRevision: canvas.revision,
      },
    });
    state.checkpointId = checkpointId;
  }
}
