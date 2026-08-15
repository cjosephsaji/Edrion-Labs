import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AuditWriter } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import { schema } from '@edrion/database';
import {
  PETROS_MEDIA_SCHEMA_VERSION,
  confirmPetrosHandwritingSchema,
  confirmPetrosQuestionSchema,
  petrosHandwritingEvaluationSchema,
  petrosHandwritingRecognitionSchema,
  petrosImageUnderstandingSchema,
  petrosMediaObjectSchema,
  petrosQuestionExtractionSchema,
  petrosSpeechTranscriptionSchema,
  type ConfirmPetrosHandwritingInput,
  type ConfirmPetrosQuestionInput,
  type CreatePetrosMediaIntentInput,
  type PetrosMediaUploadHeaders,
  type PetrosModalityClientEventInput,
  type PetrosModalityDashboardQuery,
  type ProcessPetrosMediaInput,
  type StartPetrosFiveMinuteInput,
  type StartPetrosVoiceSessionInput,
  type SubmitPetrosVoiceTurnInput,
} from '@edrion/schemas';
import type { PetrosAiExecuteResult } from '../../petros-ai-routing/petros-ai-gateway.service';
import { PetrosAiGatewayService } from '../../petros-ai-routing/petros-ai-gateway.service';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { API_ENV, AUDIT_WRITER } from '../../../common/tokens';
import { baseAudit, type ActionContext } from '../../../common/action-context';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { StudentStorageService } from '../storage/student-storage.service';
import type { PetrosOwnerScope } from '../petros-loop/petros-loop.repository';
import { PetrosLoopService } from '../petros-loop/petros-loop.service';
import { PetrosInputModesRepository } from './petros-input-modes.repository';
import {
  PETROS_AUDIO_MIMES,
  PETROS_IMAGE_MIMES,
  inspectAndSanitiseMedia,
  scanMedia,
  signMediaAccess,
  verifyMediaAccess,
} from './petros-media-safety';

const MAX_PROCESS_ATTEMPTS = 3;
type PetrosMediaJobRow = typeof schema.petrosMediaJobs.$inferSelect;
type PetrosMediaObjectRow = typeof schema.petrosMediaObjects.$inferSelect;

@Injectable()
export class PetrosInputModesService {
  constructor(
    private readonly repo: PetrosInputModesRepository,
    private readonly storage: StudentStorageService,
    private readonly gateway: PetrosAiGatewayService,
    private readonly loop: PetrosLoopService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async createMediaIntent(
    principal: InstitutionalStudentPrincipal,
    input: CreatePetrosMediaIntentInput,
  ) {
    const scope = owner(principal);
    const existing = await this.repo.findMediaByKey(scope, input.idempotencyKey);
    if (existing) return { media: await this.dto(scope, existing), limits: this.limits(existing.kind) };
    if ((await this.repo.dailyMediaCount(scope)) >= this.env.PETROS_MEDIA_DAILY_UPLOAD_LIMIT) {
      throw new ConflictException({
        code: 'PETROS_MEDIA_DAILY_LIMIT',
        message: 'Today’s configured media-upload limit has been reached.',
      });
    }
    const limits = this.limits(input.kind);
    this.validateIntent(input, limits);
    const now = new Date();
    const uploadExpiresAt = new Date(now.getTime() + 15 * 60_000);
    const rawMediaExpiresAt = new Date(
      now.getTime() +
        (input.kind === 'voice_turn'
          ? this.env.PETROS_MEDIA_AUDIO_RETENTION_HOURS
          : this.env.PETROS_MEDIA_IMAGE_RETENTION_HOURS) *
          3_600_000,
    );
    const mode = modeForKind(input.kind);
    const row = await this.repo.createMedia({
      schemaVersion: PETROS_MEDIA_SCHEMA_VERSION,
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      kind: input.kind,
      mode,
      state: 'upload_intent',
      filename: safeFilename(input.filename),
      declaredMimeType: input.declaredMimeType.split(';')[0]!.trim().toLowerCase(),
      sizeBytes: input.sizeBytes,
      durationMs: input.durationSeconds == null ? null : Math.round(input.durationSeconds * 1_000),
      width: input.width,
      height: input.height,
      pageIndex: input.pageIndex,
      transform: { rotationDegrees: 0, crop: null },
      idempotencyKey: input.idempotencyKey,
      correlationId: randomUUID(),
      uploadExpiresAt,
      rawMediaExpiresAt,
    });
    const persisted = row ?? (await this.repo.findMediaByKey(scope, input.idempotencyKey));
    if (!persisted) throw new Error('Petros media upload intent was not persisted.');
    await this.event(persisted, 'upload_intent_created', input.idempotencyKey, {
      mediaUnits: units(persisted),
      payload: { retentionHours: input.kind === 'voice_turn' ? this.env.PETROS_MEDIA_AUDIO_RETENTION_HOURS : this.env.PETROS_MEDIA_IMAGE_RETENTION_HOURS },
    });
    return {
      media: await this.dto(scope, persisted),
      upload: { method: 'PUT', url: `/student/petros/media/${persisted.id}/content` },
      limits: { ...limits, uploadExpiresAt: uploadExpiresAt.toISOString(), rawMediaExpiresAt: rawMediaExpiresAt.toISOString() },
    };
  }

  async uploadContent(
    principal: InstitutionalStudentPrincipal,
    mediaId: string,
    raw: Buffer,
    input: PetrosMediaUploadHeaders,
  ) {
    const scope = owner(principal);
    const media = await this.requireMedia(scope, mediaId);
    if (media.state !== 'upload_intent' && media.state !== 'retryable_failure') {
      if (media.storageObjectId) return this.dto(scope, media);
      throw invalidState('This upload intent is no longer accepting content.');
    }
    if (media.uploadExpiresAt.getTime() <= Date.now()) {
      const expired = await this.repo.updateMedia(scope, media.id, { state: 'expired', failureCode: 'PETROS_MEDIA_UPLOAD_EXPIRED' });
      return this.dto(scope, expired ?? media);
    }
    const limit = media.kind === 'voice_turn' ? this.env.PETROS_MEDIA_MAX_AUDIO_BYTES : this.env.PETROS_MEDIA_MAX_IMAGE_BYTES;
    if (raw.length > limit) throw new PayloadTooLargeException({ code: 'PETROS_MEDIA_TOO_LARGE', message: 'The file exceeds this mode’s configured limit.' });
    if (raw.length !== media.sizeBytes) {
      throw new BadRequestException({ code: 'PETROS_MEDIA_SIZE_MISMATCH', message: 'The uploaded byte count does not match the upload intent.' });
    }
    const inspected = inspectAndSanitiseMedia(raw, media.declaredMimeType, media.kind as never);
    const width = inspected.width ?? media.width;
    const height = inspected.height ?? media.height;
    if (width && height && width * height > this.env.PETROS_MEDIA_MAX_PIXELS) {
      throw new PayloadTooLargeException({
        code: 'PETROS_MEDIA_RESOLUTION_TOO_LARGE',
        message: 'The image resolution is too large. Crop or resize it before retrying.',
      });
    }
    await this.repo.updateMedia(scope, media.id, {
      state: 'scanning',
      scanStatus: 'running',
      transform: input.transform,
      detectedMimeType: inspected.detectedMimeType,
      checksumSha256: inspected.checksumSha256,
      width,
      height,
      failureCode: null,
    });
    const scanStarted = Date.now();
    let scan: Awaited<ReturnType<typeof scanMedia>>;
    try {
      scan = await scanMedia(inspected.sanitised, this.env);
    } catch (error) {
      const retryable = await this.repo.updateMedia(scope, media.id, {
        state: 'retryable_failure',
        scanStatus: 'failed',
        failureCode: errorCode(error),
      });
      await this.event(media, 'scan_failed', derivedUuid(input.idempotencyKey, 'scan_failed'), {
        stage: 'scan',
        durationMs: Date.now() - scanStarted,
        errorCode: errorCode(error),
      });
      return this.dto(scope, retryable ?? media);
    }
    if (!scan.clean) {
      const quarantined = await this.repo.updateMedia(scope, media.id, {
        state: 'quarantined',
        scanStatus: 'unsafe',
        failureCode: 'PETROS_MEDIA_UNSAFE',
        structuredResult: { safety: { engine: scan.engine, signature: scan.signature } },
      });
      await this.event(media, 'quarantined', derivedUuid(input.idempotencyKey, 'quarantined'), {
        stage: 'scan',
        durationMs: Date.now() - scanStarted,
        errorCode: 'PETROS_MEDIA_UNSAFE',
      });
      return this.dto(scope, quarantined ?? media);
    }
    const duplicate = await this.repo.findDuplicate(scope, media.id, inspected.checksumSha256, media.kind);
    let storageObjectId = duplicate?.storageObjectId ?? null;
    if (!storageObjectId) {
      const stored = await this.storage.upload(
        principal,
        storageKind(media.kind),
        media.filename,
        inspected.detectedMimeType,
        inspected.sanitised,
      );
      storageObjectId = stored.id;
    }
    const uploaded = await this.repo.updateMedia(scope, media.id, {
      storageObjectId,
      state: 'ready_for_processing',
      scanStatus: 'clean',
      detectedMimeType: inspected.detectedMimeType,
      checksumSha256: inspected.checksumSha256,
      duplicateOf: duplicate?.id ?? null,
      width,
      height,
      transform: input.transform,
      structuredResult: {
        provenance: {
          clientFilename: media.filename,
          detectedMimeType: inspected.detectedMimeType,
          metadataStripped: inspected.metadataStripped,
          duplicate: Boolean(duplicate),
        },
      },
      failureCode: null,
    });
    await this.event(media, 'upload_ready', derivedUuid(input.idempotencyKey, 'upload_ready'), {
      stage: 'scan',
      durationMs: Date.now() - scanStarted,
      mediaUnits: units({ ...media, width, height }),
      payload: { duplicate: Boolean(duplicate), metadataStripped: inspected.metadataStripped, scanEngine: scan.engine },
    });
    return this.dto(scope, uploaded ?? media);
  }

  async process(
    principal: InstitutionalStudentPrincipal,
    mediaId: string,
    input: ProcessPetrosMediaInput,
  ) {
    const scope = owner(principal);
    const media = await this.requireMedia(scope, mediaId);
    if (media.state === 'needs_confirmation' || media.state === 'ready' || media.state === 'session_created') return this.processingView(scope, media);
    if (!['ready_for_processing', 'retryable_failure'].includes(media.state)) throw invalidState('This media is not ready to process.');
    if (!media.storageObjectId || !media.detectedMimeType) throw invalidState('The uploaded media is unavailable.');
    const prior = (await this.repo.listJobs(scope, media.id)).filter((job) =>
      ['question_extraction', 'handwriting_recognition', 'speech_transcription'].includes(job.kind),
    );
    if (prior.length >= MAX_PROCESS_ATTEMPTS) {
      const failed = await this.repo.updateMedia(scope, media.id, { state: 'failed', failureCode: 'PETROS_MEDIA_RETRY_LIMIT' });
      return this.processingView(scope, failed ?? media);
    }
    const existingJob = await this.repo.findJobByKey(scope, media.id, input.idempotencyKey);
    if (existingJob) return this.processingView(scope, await this.requireMedia(scope, media.id));
    const jobKind = media.kind === 'question_photo' ? 'question_extraction' : media.kind === 'handwriting_page' ? 'handwriting_recognition' : 'speech_transcription';
    const job = await this.repo.createJob({
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      mediaId: media.id,
      kind: jobKind,
      state: 'running',
      attempts: prior.length + 1,
      maxAttempts: MAX_PROCESS_ATTEMPTS,
      idempotencyKey: input.idempotencyKey,
      functionKey:
        media.kind === 'question_photo'
          ? 'vision.question.extract'
          : media.kind === 'handwriting_page'
            ? 'vision.handwriting.analyse'
            : 'speech.transcribe',
      startedAt: new Date(),
    });
    if (!job) return this.processingView(scope, await this.requireMedia(scope, media.id));
    await this.repo.updateMedia(scope, media.id, { state: 'processing', failureCode: null });
    const stored = await this.storage.getOwned(principal, media.storageObjectId);
    const buffer = await this.storage.readBuffer(stored.storageKey);
    const mediaPart = {
      type: media.kind === 'voice_turn' ? ('audio' as const) : ('image' as const),
      mediaType: media.detectedMimeType,
      dataBase64: buffer.toString('base64'),
    };
    const started = Date.now();
    try {
      let structuredResult: Record<string, unknown>;
      let confidenceValue: number;
      let request: PetrosAiExecuteResult;
      if (media.kind === 'voice_turn') {
        request = await this.mediaFunction(
          media,
          'speech.transcribe',
          [mediaPart],
          petrosSpeechTranscriptionSchema,
          job.id,
        );
        const transcription = petrosSpeechTranscriptionSchema.parse(request.content);
        structuredResult = { ...media.structuredResult, transcription };
        confidenceValue = transcription.confidence;
      } else if (media.kind === 'question_photo') {
        const understood = await this.mediaFunction(media, 'vision.image.understand', [mediaPart], petrosImageUnderstandingSchema, job.id);
        const understanding = petrosImageUnderstandingSchema.parse(understood.content);
        if (!understanding.readable || !understanding.safeToProcess || understanding.inputType === 'unsupported') {
          await this.repo.updateJob(scope, job.id, {
            state: 'retryable_failure',
            attempts: prior.length + 1,
            output: { imageUnderstanding: understanding },
            confidenceBasisPoints: Math.round(understanding.quality.overallConfidence * 10_000),
            errorCode: 'PETROS_MEDIA_UNREADABLE',
            completedAt: new Date(),
          });
          const unreadable = await this.repo.updateMedia(scope, media.id, {
            state: 'retryable_failure',
            structuredResult: { ...media.structuredResult, imageUnderstanding: understanding },
            failureCode: 'PETROS_MEDIA_UNREADABLE',
          });
          return this.processingView(scope, unreadable ?? media);
        }
        request = await this.mediaFunction(
          media,
          'vision.question.extract',
          [
            mediaPart,
            { type: 'text', text: 'Extract every visible question separately. Preserve diagrams as descriptions. Do not solve any question.' },
          ],
          petrosQuestionExtractionSchema,
          job.id,
        );
        const extraction = petrosQuestionExtractionSchema.parse(request.content);
        structuredResult = { ...media.structuredResult, imageUnderstanding: understanding, questionExtraction: extraction };
        confidenceValue = Math.min(understanding.quality.overallConfidence, extraction.overallConfidence);
      } else {
        request = await this.mediaFunction(
          media,
          'vision.handwriting.analyse',
          [
            mediaPart,
            { type: 'text', text: 'Recognize the work line by line in visual order with normalized coordinates and uncertainty. Do not grade or complete the solution yet.' },
          ],
          petrosHandwritingRecognitionSchema,
          job.id,
        );
        const recognition = petrosHandwritingRecognitionSchema.parse(request.content);
        structuredResult = { ...media.structuredResult, handwritingRecognition: recognition };
        confidenceValue = recognition.overallConfidence;
      }
      await this.repo.updateJob(scope, job.id, {
        state: 'needs_confirmation',
        output: structuredResult,
        providerRequestId: request.requestId,
        confidenceBasisPoints: Math.round(confidenceValue * 10_000),
        completedAt: new Date(),
      });
      const confirmed = await this.repo.updateMedia(scope, media.id, {
        state: 'needs_confirmation',
        structuredResult,
        failureCode: null,
      });
      await this.event(media, 'recognition_ready', derivedUuid(input.idempotencyKey, 'recognition_ready'), {
        stage: jobKind,
        durationMs: Date.now() - started,
        confidenceBasisPoints: Math.round(confidenceValue * 10_000),
      });
      return this.processingView(scope, confirmed ?? media);
    } catch (error) {
      const attempts = prior.length + 1;
      const state = attempts < MAX_PROCESS_ATTEMPTS ? 'retryable_failure' : 'failed';
      await this.repo.updateJob(scope, job.id, {
        state,
        attempts,
        errorCode: errorCode(error),
        nextAttemptAt: attempts < MAX_PROCESS_ATTEMPTS ? new Date(Date.now() + attempts * 2_000) : null,
        completedAt: new Date(),
      });
      const failed = await this.repo.updateMedia(scope, media.id, { state, failureCode: providerNeutralError(media.kind) });
      await this.event(media, 'processing_failed', derivedUuid(input.idempotencyKey, 'processing_failed'), {
        stage: jobKind,
        durationMs: Date.now() - started,
        errorCode: errorCode(error),
        retryCount: attempts - 1,
      });
      return this.processingView(scope, failed ?? media);
    }
  }

  async confirmQuestion(
    principal: InstitutionalStudentPrincipal,
    mediaId: string,
    raw: ConfirmPetrosQuestionInput,
  ) {
    const input = confirmPetrosQuestionSchema.parse(raw);
    const scope = owner(principal);
    const media = await this.requireMedia(scope, mediaId);
    if (media.kind !== 'question_photo') throw invalidState('This is not a photographed question.');
    if (media.sessionId) {
      return { media: await this.dto(scope, media), session: await this.loop.document(principal, media.sessionId), opening: snapOpening(input.stuckPoint) };
    }
    const manualFallback = input.selectedQuestionId === 'manual' && media.state === 'retryable_failure';
    if (media.state !== 'needs_confirmation' && !manualFallback) throw invalidState('Confirm the extracted question only after processing finishes.');
    const extraction = manualFallback
      ? null
      : petrosQuestionExtractionSchema.parse(media.structuredResult.questionExtraction);
    const selected = extraction?.questions.find((question) => question.id === input.selectedQuestionId);
    if (!manualFallback && !selected) throw new BadRequestException({ code: 'PETROS_QUESTION_NOT_FOUND', message: 'Select one recognized question.' });
    const sourceFingerprint = digest({ mediaId, correctedQuestion: input.correctedQuestion, stuckPoint: input.stuckPoint });
    const session = await this.loop.create(principal, {
      clientRequestId: derivedUuid(media.id, 'snap_session'),
      sessionType: 'doubt',
      topic: input.correctedQuestion.slice(0, 240),
      goal: `Resolve the ${input.stuckPoint.replace(/_/g, ' ')} point without leading with the complete solution.`,
      timeBudgetSeconds: 480,
      maxMoves: 3,
      learnerContext: {
        language: 'en',
        photographedQuestion: input.correctedQuestion,
        stuckPoint: input.stuckPoint,
        correctionConfirmed: true,
      },
      topicContext: {
        targetConcepts: [input.correctedQuestion.slice(0, 240)],
        scopeBoundaries: ['Teach the stuck point first.', 'Do not lead with the final answer.'],
        sourceQualityConfidence: extraction?.overallConfidence ?? 1,
      },
      sourceContext: {
        door: 'snap_question',
        referenceId: media.id,
        label: 'Student-confirmed photographed question',
        emotionalRegister: 'responsive_neutral',
        registerFactors: [`Student selected: ${input.stuckPoint.replace(/_/g, ' ')}`, 'Question text confirmed by the student'],
        policyDisclosures: ['The original photo is retained only until the disclosed raw-media expiry.', 'Petros teaches the stuck point before offering a complete solution.'],
        returnHref: '/petros',
        returnLabel: 'Back to Petros input modes',
        sourceFingerprint,
      },
      profileContext: { topicKey: `snap:${digest(input.correctedQuestion).slice(0, 64)}`, subjectLabel: 'Photographed question' },
    });
    const corrected = manualFallback || selected!.text.trim() !== input.correctedQuestion.trim();
    const updated = await this.repo.updateMedia(scope, media.id, {
      state: 'session_created',
      sessionId: session.id,
      confirmedAt: new Date(),
      structuredResult: {
        ...media.structuredResult,
        confirmedQuestion: {
          selectedQuestionId: input.selectedQuestionId,
          text: input.correctedQuestion,
          stuckPoint: input.stuckPoint,
          studentSourceOfTruth: true,
        },
      },
      correctionAudit: {
        corrected,
        extractedTextHash: selected ? digest(selected.text) : null,
        manualFallback,
        confirmedTextHash: digest(input.correctedQuestion),
        confirmedAt: new Date().toISOString(),
      },
      failureCode: null,
    });
    await this.event(media, 'student_confirmed', input.idempotencyKey, { sessionId: session.id, payload: { corrected, stuckPoint: input.stuckPoint } });
    return { media: await this.dto(scope, updated ?? media), session, opening: snapOpening(input.stuckPoint) };
  }

  async confirmHandwriting(
    principal: InstitutionalStudentPrincipal,
    mediaId: string,
    raw: ConfirmPetrosHandwritingInput,
  ) {
    const input = confirmPetrosHandwritingSchema.parse(raw);
    const scope = owner(principal);
    const media = await this.requireMedia(scope, mediaId);
    if (media.kind !== 'handwriting_page') throw invalidState('This is not a handwriting page.');
    if (media.sessionId) {
      return {
        media: await this.dto(scope, media),
        evaluation: petrosHandwritingEvaluationSchema.parse(media.structuredResult.handwritingEvaluation),
        session: await this.loop.document(principal, media.sessionId),
      };
    }
    if (media.state !== 'needs_confirmation' || !media.storageObjectId || !media.detectedMimeType) throw invalidState('Confirm recognized work only after processing finishes.');
    const recognition = petrosHandwritingRecognitionSchema.parse(media.structuredResult.handwritingRecognition);
    const recognizedIds = new Set(recognition.lines.map((line) => line.id));
    if (input.correctedLines.some((line) => !recognizedIds.has(line.id))) {
      throw new BadRequestException({ code: 'PETROS_HANDWRITING_LINE_MISMATCH', message: 'One corrected line is not part of the recognized page.' });
    }
    const prior = (await this.repo.listJobs(scope, media.id)).filter((candidate) => candidate.kind === 'work_evaluation');
    if (prior.length >= MAX_PROCESS_ATTEMPTS) throw invalidState('The work-evaluation retry limit has been reached.');
    const job = await this.repo.createJob({
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      mediaId: media.id,
      kind: 'work_evaluation',
      state: 'running',
      attempts: prior.length + 1,
      maxAttempts: MAX_PROCESS_ATTEMPTS,
      idempotencyKey: input.idempotencyKey,
      functionKey: 'working.evaluate_steps',
      startedAt: new Date(),
    });
    if (!job) return { media: await this.dto(scope, media), evaluation: null, session: null };
    const stored = await this.storage.getOwned(principal, media.storageObjectId);
    const buffer = await this.storage.readBuffer(stored.storageKey);
    const started = Date.now();
    try {
      const request = await this.mediaFunction(
        media,
        'working.evaluate_steps',
        [
          { type: 'image', mediaType: media.detectedMimeType, dataBase64: buffer.toString('base64') },
          {
            type: 'text',
            text: JSON.stringify({
              studentConfirmedLines: input.correctedLines,
              instruction: 'Use these corrected lines as source of truth. Find the first logical break, consequence errors, mark-losing lines, what a grader circles, one missing teaching step, and a reattempt. Never invent an uncertain line.',
            }),
          },
        ],
        petrosHandwritingEvaluationSchema,
        job.id,
      );
      const evaluation = petrosHandwritingEvaluationSchema.parse(request.content);
      const correctedIds = new Set(input.correctedLines.map((line) => line.id));
      if (evaluation.lines.some((line) => !correctedIds.has(line.lineId))) {
        throw new BadRequestException({ code: 'PETROS_HANDWRITING_OUTPUT_MISMATCH', message: 'The work evaluation referred to an unconfirmed line.' });
      }
      const firstLine = input.correctedLines.sort((a, b) => a.order - b.order)[0]!.text;
      const sourceFingerprint = digest({ mediaId, lines: input.correctedLines });
      const session = await this.loop.create(principal, {
        clientRequestId: derivedUuid(media.id, 'handwriting_session'),
        sessionType: 'repair',
        topic: firstLine.slice(0, 240),
        goal: `Repair the first break in the student’s confirmed working, teach the missing step, and support a reattempt.`,
        timeBudgetSeconds: 600,
        maxMoves: 4,
        learnerContext: { errorCategory: evaluation.lines.find((line) => line.status === 'first_break')?.category ?? 'none', handwritingConfirmed: true },
        topicContext: {
          confirmedLines: input.correctedLines,
          firstBreakLineId: evaluation.firstBreakLineId,
          teachingStep: evaluation.teachingStep,
          reattemptPrompt: evaluation.reattemptPrompt,
        },
        sourceContext: {
          door: 'handwriting',
          referenceId: media.id,
          label: 'Student-confirmed handwritten attempt',
          emotionalRegister: 'flat_practical',
          registerFactors: ['Line recognition confirmed by the student', 'First-break and consequence errors are separated'],
          policyDisclosures: ['The original page is owner-private and expires under the disclosed raw-media policy.', 'Low-confidence lines are never treated as certain.'],
          returnHref: '/petros',
          returnLabel: 'Back to Petros input modes',
          sourceFingerprint,
        },
        profileContext: { topicKey: `handwriting:${digest(firstLine).slice(0, 64)}`, subjectLabel: 'Handwritten work' },
      });
      const correctedCount = input.correctedLines.filter((line) => recognition.lines.find((candidate) => candidate.id === line.id)?.text.trim() !== line.text.trim()).length;
      await this.repo.updateJob(scope, job.id, {
        state: 'completed',
        output: evaluation as unknown as Record<string, unknown>,
        providerRequestId: request.requestId,
        confidenceBasisPoints: Math.round(evaluation.overallConfidence * 10_000),
        completedAt: new Date(),
      });
      const updated = await this.repo.updateMedia(scope, media.id, {
        state: 'session_created',
        sessionId: session.id,
        confirmedAt: new Date(),
        structuredResult: {
          ...media.structuredResult,
          studentConfirmedLines: input.correctedLines,
          handwritingEvaluation: evaluation,
        },
        correctionAudit: {
          correctedCount,
          recognizedLinesHash: digest(recognition.lines.map((line) => ({ id: line.id, text: line.text }))),
          confirmedLinesHash: digest(input.correctedLines),
          confirmedAt: new Date().toISOString(),
        },
        failureCode: null,
      });
      await this.event(media, 'handwriting_evaluated', derivedUuid(input.idempotencyKey, 'evaluated'), {
        sessionId: session.id,
        stage: 'work_evaluation',
        durationMs: Date.now() - started,
        confidenceBasisPoints: Math.round(evaluation.overallConfidence * 10_000),
        payload: { correctedCount, hasFirstBreak: Boolean(evaluation.firstBreakLineId) },
      });
      return { media: await this.dto(scope, updated ?? media), evaluation, session };
    } catch (error) {
      await this.repo.updateJob(scope, job.id, { state: prior.length + 1 < MAX_PROCESS_ATTEMPTS ? 'retryable_failure' : 'failed', errorCode: errorCode(error), completedAt: new Date() });
      const failed = await this.repo.updateMedia(scope, media.id, { state: 'retryable_failure', failureCode: 'PETROS_HANDWRITING_EVALUATION_UNAVAILABLE' });
      await this.event(media, 'processing_failed', derivedUuid(input.idempotencyKey, 'evaluation_failed'), { stage: 'work_evaluation', durationMs: Date.now() - started, errorCode: errorCode(error) });
      return { media: await this.dto(scope, failed ?? media), evaluation: null, session: null };
    }
  }

  async startVoice(principal: InstitutionalStudentPrincipal, input: StartPetrosVoiceSessionInput) {
    const sourceFingerprint = digest({ concept: input.concept, language: input.language, mixedLanguage: input.mixedLanguage });
    let session = await this.loop.create(principal, {
      clientRequestId: input.idempotencyKey,
      sessionType: 'learn',
      topic: input.concept,
      goal: `Learn ${input.concept} through concise spoken generation and checks.`,
      timeBudgetSeconds: 900,
      maxMoves: 5,
      learnerContext: { language: input.language, mixedLanguage: input.mixedLanguage, voiceOptional: true, handsFree: input.handsFree },
      topicContext: { voiceSession: true, essentialInformationAlsoText: true },
      sourceContext: {
        door: 'voice',
        label: 'Optional voice learning session',
        emotionalRegister: 'responsive_neutral',
        registerFactors: ['Short spoken turns', 'Transcript remains correctable', 'Voice can switch to text at any time'],
        policyDisclosures: ['Recording is turn-based, never continuous after pause or close.', 'No identity, mood, disability, or biometric conclusion is inferred from voice.'],
        returnHref: '/petros',
        returnLabel: 'Back to Petros input modes',
        sourceFingerprint,
      },
      profileContext: { topicKey: `voice:${digest(input.concept).slice(0, 64)}`, subjectLabel: input.concept },
    });
    if (!session.blocks.length) session = await this.loop.continue(principal, session.id, derivedUuid(input.idempotencyKey, 'voice_open'));
    await this.repo.recordEvent({
      institutionId: principal.institutionId,
      studentId: principal.studentId,
      sessionId: session.id,
      mode: 'voice',
      type: 'session_started',
      idempotencyKey: derivedUuid(input.idempotencyKey, 'voice_started'),
      correlationId: randomUUID(),
      payload: { handsFree: input.handsFree, mixedLanguage: input.mixedLanguage },
    });
    return { session, recordingPolicy: { continuous: false, stopOnPauseCloseBackground: true, transcriptAlwaysVisible: true } };
  }

  async voiceTurn(principal: InstitutionalStudentPrincipal, input: SubmitPetrosVoiceTurnInput) {
    const scope = owner(principal);
    const media = await this.requireMedia(scope, input.mediaId);
    if (media.kind !== 'voice_turn' || !media.storageObjectId || !media.detectedMimeType || media.state !== 'needs_confirmation') {
      throw invalidState('Review the transcript before submitting this voice turn.');
    }
    let document = await this.loop.document(principal, input.sessionId);
    const transcription = petrosSpeechTranscriptionSchema.parse(media.structuredResult.transcription);
    const transcript = input.transcriptCorrection?.trim() || transcription.text;
    const corrected = transcript !== transcription.text;
    const started = Date.now();
    try {
      const current = document.blocks.find((block) => block.status === 'current');
      const activeQuestion = current?.questions.find((question) => question.active);
      if (current && activeQuestion) {
        document = await this.loop.submitAnswer(principal, document.id, current.id, {
          idempotencyKey: derivedUuid(input.idempotencyKey, 'spoken_answer'),
          questionId: activeQuestion.id,
          answer: transcript,
          confidence: input.confidence,
          expectedBlockVersion: current.version,
        });
        const refreshed = document.blocks.find((block) => block.id === current.id);
        if (refreshed?.status === 'current' && !refreshed.questions.some((question) => question.active)) {
          document = await this.loop.complete(principal, document.id, current.id, {
            idempotencyKey: derivedUuid(input.idempotencyKey, 'spoken_complete'),
            blockType: current.content.type,
            expectedBlockVersion: refreshed.version,
            interactionState: { voice: true },
            observedOutcome: { completed: true, spokenAnswer: true },
          });
        }
      } else if (current) {
        document = await this.loop.composerQuestion(principal, document.id, {
          idempotencyKey: derivedUuid(input.idempotencyKey, 'spoken_observation'),
          question: transcript,
          expectedSessionVersion: document.version,
        });
        const refreshed = document.blocks.find((block) => block.id === current.id);
        if (refreshed?.status === 'current') {
          document = await this.loop.complete(principal, document.id, current.id, {
            idempotencyKey: derivedUuid(input.idempotencyKey, 'spoken_complete'),
            blockType: current.content.type,
            expectedBlockVersion: refreshed.version,
            interactionState: { voice: true },
            observedOutcome: { completed: true, spokenObservation: true },
          });
        }
      }
      if (document.status === 'active' && !document.blocks.some((block) => block.status === 'current')) {
        document = await this.loop.continue(principal, document.id, derivedUuid(input.idempotencyKey, 'spoken_continue'));
      }
      const spokenText = conciseSpokenText(document);
      let audio: { dataBase64: string; mimeType: string } | null = null;
      let voiceFunction: 'interaction.spoken' | 'speech.synthesise' | 'text_only' = 'text_only';
      let degradation: string | null = null;
      try {
        const spoken = await this.gateway.execute({
          context: {
            functionKey: 'interaction.spoken',
            topic: document.topic,
            sessionType: document.sessionType,
            inputModality: 'text',
            language: input.language,
            institutionId: scope.institutionId,
            studentId: scope.studentId,
            estimatedTokens: Math.ceil(spokenText.length / 4),
            currentCostMicros: 0,
            previousFailures: 0,
            requiredResponseMs: 8_000,
          },
          system: 'Speak only the supplied structured Petros session move. Keep it concise, announce the choice or progress, preserve mixed-language preferences, and never add a final answer that is absent from the block. The transcript is authoritative.',
          input: [{ type: 'text', text: spokenText }],
          sessionId: document.id,
          correlationId: media.correlationId,
          metadata: { mode: 'voice', mediaId: media.id, loopStep: 'SPOKEN_MOVE', interruption: input.interruptPrevious },
          disableCache: true,
        });
        audio = audioContent(spoken.content);
        voiceFunction = 'interaction.spoken';
        await this.event(media, 'spoken_ready', derivedUuid(input.idempotencyKey, 'spoken_ready'), {
          sessionId: document.id,
          functionKey: spoken.functionKey,
          stage: 'spoken_interaction',
          durationMs: spoken.responseTimeMs,
          estimatedCostMicros: spoken.estimatedCostMicros,
          actualCostMicros: spoken.actualCostMicros,
          retryCount: spoken.retryCount,
          fallbackTier: spoken.fallbackTier,
          providerKey: spoken.providerKey,
          modelKey: spoken.modelKey,
          cacheHit: spoken.cached,
        });
      } catch (spokenError) {
        await this.event(media, 'processing_failed', derivedUuid(input.idempotencyKey, 'spoken_interaction_failed'), {
          sessionId: document.id,
          functionKey: 'interaction.spoken',
          stage: 'spoken_interaction',
          errorCode: errorCode(spokenError),
        });
        try {
          const tts = await this.gateway.execute({
            context: {
              functionKey: 'speech.synthesise',
              topic: document.topic,
              sessionType: document.sessionType,
              inputModality: 'text',
              language: input.language,
              institutionId: scope.institutionId,
              studentId: scope.studentId,
              estimatedTokens: Math.ceil(spokenText.length / 4),
              currentCostMicros: 0,
              previousFailures: 1,
              requiredResponseMs: 8_000,
            },
            input: [{ type: 'text', text: spokenText }],
            sessionId: document.id,
            correlationId: media.correlationId,
            metadata: { mode: 'voice', mediaId: media.id, loopStep: 'TTS_FALLBACK' },
            disableCache: true,
          });
          audio = audioContent(tts.content);
          voiceFunction = 'speech.synthesise';
          degradation = 'The live spoken-interaction route was unavailable, so Petros used text-to-speech.';
          await this.event(media, 'spoken_ready', derivedUuid(input.idempotencyKey, 'tts_ready'), {
            sessionId: document.id,
            functionKey: tts.functionKey,
            stage: 'speech_synthesis',
            durationMs: tts.responseTimeMs,
            estimatedCostMicros: tts.estimatedCostMicros,
            actualCostMicros: tts.actualCostMicros,
            retryCount: tts.retryCount,
            fallbackTier: tts.fallbackTier,
            providerKey: tts.providerKey,
            modelKey: tts.modelKey,
            cacheHit: tts.cached,
          });
        } catch (ttsError) {
          degradation = 'Audio playback is unavailable. The complete transcript remains visible and the session can continue in text.';
          await this.event(media, 'tts_failed', derivedUuid(input.idempotencyKey, 'tts_failed'), {
            sessionId: document.id,
            functionKey: 'speech.synthesise',
            stage: 'speech_synthesis',
            errorCode: errorCode(ttsError),
          });
        }
      }
      const updated = await this.repo.updateMedia(scope, media.id, {
        state: 'ready',
        sessionId: document.id,
        structuredResult: {
          ...media.structuredResult,
          transcription,
          confirmedTranscript: transcript,
          studentSourceOfTruth: corrected,
        },
        correctionAudit: { corrected, providerTranscriptHash: digest(transcription.text), confirmedTranscriptHash: digest(transcript) },
        confirmedAt: new Date(),
      });
      await this.event(media, 'voice_turn_completed', derivedUuid(input.idempotencyKey, 'voice_completed'), {
        sessionId: document.id,
        stage: 'end_to_end',
        durationMs: Date.now() - started,
        confidenceBasisPoints: Math.round(transcription.confidence * 10_000),
        payload: { corrected, voiceFunction, interrupted: input.interruptPrevious, uncertainSegmentCount: transcription.uncertainSegments.length },
      });
      return {
        media: await this.dto(scope, updated ?? media),
        transcript: { ...transcription, text: transcript, corrected },
        session: document,
        spoken: { transcript: spokenText, audio, function: voiceFunction, degradation },
        recordingMustStop: true,
      };
    } catch (error) {
      await this.repo.updateMedia(scope, media.id, { state: 'retryable_failure', failureCode: 'PETROS_VOICE_TURN_UNAVAILABLE' });
      await this.event(media, 'processing_failed', derivedUuid(input.idempotencyKey, 'voice_failed'), { sessionId: input.sessionId, stage: 'loop_observation', durationMs: Date.now() - started, errorCode: errorCode(error) });
      throw new ServiceUnavailableException({ code: 'PETROS_VOICE_TURN_UNAVAILABLE', message: 'Petros could not apply this confirmed turn. Your transcript is still available; retry or continue in text.' });
    }
  }

  async startFiveMinute(principal: InstitutionalStudentPrincipal, input: StartPetrosFiveMinuteInput) {
    const sourceFingerprint = digest({ concept: input.concept, goal: input.goal, language: input.language });
    let session = await this.loop.create(principal, {
      clientRequestId: input.idempotencyKey,
      sessionType: 'learn',
      topic: input.concept,
      goal: input.goal ?? `Own one useful idea about ${input.concept} in five minutes.`,
      timeBudgetSeconds: 300,
      maxMoves: 4,
      learnerContext: { language: input.language, fiveMinute: true, explicitExpansionRequired: true },
      topicContext: { fiveMinute: true, sequence: ['one_guess', 'one_teaching_move', 'one_check', 'one_card_or_forward_link'] },
      sourceContext: {
        door: 'five_minute',
        label: 'Finite five-minute session',
        emotionalRegister: 'calm_focused',
        registerFactors: ['Exactly one concept', 'Four bounded moves', 'Expansion requires an explicit choice'],
        policyDisclosures: ['The session ends deliberately near five minutes.', 'Continuing into a full session is never automatic.'],
        returnHref: '/petros',
        returnLabel: 'Back to Petros input modes',
        sourceFingerprint,
      },
      profileContext: { topicKey: `five-minute:${digest(input.concept).slice(0, 64)}`, subjectLabel: input.concept },
    });
    if (!session.blocks.length) session = await this.loop.continue(principal, session.id, derivedUuid(input.idempotencyKey, 'five_minute_open'));
    await this.repo.recordEvent({
      institutionId: principal.institutionId,
      studentId: principal.studentId,
      sessionId: session.id,
      mode: 'five_minute',
      type: 'session_started',
      idempotencyKey: derivedUuid(input.idempotencyKey, 'five_minute_started'),
      correlationId: randomUUID(),
      mediaUnits: { promisedSeconds: 300, maxMoves: 4 },
      payload: { explicitExpansionRequired: true },
    });
    return { session, finitePromise: { seconds: 300, moves: 4, expansionRequiresChoice: true } };
  }

  async clientEvent(principal: InstitutionalStudentPrincipal, input: PetrosModalityClientEventInput) {
    const scope = owner(principal);
    let media: PetrosMediaObjectRow | undefined;
    if (input.mediaId) media = await this.requireMedia(scope, input.mediaId);
    if (input.sessionId) await this.loop.document(principal, input.sessionId);
    const event = await this.repo.recordEvent({
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      mediaId: media?.id,
      sessionId: input.sessionId,
      mode: input.mode,
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      correlationId: media?.correlationId ?? randomUUID(),
      durationMs: input.durationMs,
      payload: {},
    });
    return { recorded: Boolean(event), duplicate: !event };
  }

  async read(principal: InstitutionalStudentPrincipal, mediaId: string) {
    const scope = owner(principal);
    return this.processingView(scope, await this.requireMedia(scope, mediaId));
  }

  async access(principal: InstitutionalStudentPrincipal, mediaId: string) {
    const media = await this.requireMedia(owner(principal), mediaId);
    if (!media.storageObjectId || ['deleted', 'expired', 'quarantined'].includes(media.state)) throw mediaNotFound();
    const expiresEpochSeconds = Math.floor(Date.now() / 1_000) + 300;
    const token = signMediaAccess({ mediaId, studentId: principal.studentId, expiresEpochSeconds, secret: this.signingSecret() });
    return {
      url: `/student/petros/media/${mediaId}/content?expires=${expiresEpochSeconds}&token=${token}`,
      expiresAt: new Date(expiresEpochSeconds * 1_000).toISOString(),
    };
  }

  async stream(principal: InstitutionalStudentPrincipal, mediaId: string, expires: number, token: string) {
    const media = await this.requireMedia(owner(principal), mediaId);
    if (!verifyMediaAccess({ mediaId, studentId: principal.studentId, expiresEpochSeconds: expires, token, secret: this.signingSecret() })) throw mediaNotFound();
    if (!media.storageObjectId || ['deleted', 'expired', 'quarantined'].includes(media.state)) throw mediaNotFound();
    const stored = await this.storage.getOwned(principal, media.storageObjectId);
    return { row: stored, stream: this.storage.stream(stored.storageKey) };
  }

  async cancel(principal: InstitutionalStudentPrincipal, mediaId: string, idempotencyKey: string) {
    const scope = owner(principal);
    const media = await this.requireMedia(scope, mediaId);
    if (['deleted', 'expired', 'session_created'].includes(media.state)) return this.dto(scope, media);
    const jobs = await this.repo.listJobs(scope, media.id);
    await Promise.all(
      jobs.filter((job) => ['queued', 'running', 'retryable_failure'].includes(job.state)).map((job) =>
        this.repo.updateJob(scope, job.id, { state: 'cancelled', cancelledAt: new Date() }),
      ),
    );
    const cancelled = await this.repo.updateMedia(scope, media.id, { state: 'cancelled', failureCode: null });
    await this.event(media, 'cancelled', idempotencyKey, {});
    return this.dto(scope, cancelled ?? media);
  }

  async delete(principal: InstitutionalStudentPrincipal, mediaId: string, idempotencyKey: string) {
    const scope = owner(principal);
    const media = await this.requireMedia(scope, mediaId);
    if (media.state === 'deleted') return this.dto(scope, media);
    const deleted = await this.repo.updateMedia(scope, media.id, {
      state: 'deleted',
      deletedAt: new Date(),
      structuredResult: {},
      correctionAudit: {},
      failureCode: null,
    });
    await this.removeUnreferencedRaw(principal, media);
    await this.event(media, 'deleted', idempotencyKey, { stage: 'cleanup' });
    return this.dto(scope, deleted ?? media);
  }

  async export(principal: InstitutionalStudentPrincipal, mediaId: string) {
    const scope = owner(principal);
    const media = await this.requireMedia(scope, mediaId);
    const jobs = await this.repo.listJobs(scope, media.id);
    return {
      schemaVersion: PETROS_MEDIA_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      media: {
        id: media.id,
        kind: media.kind,
        mode: media.mode,
        state: media.state,
        detectedMimeType: media.detectedMimeType,
        sizeBytes: media.sizeBytes,
        durationMs: media.durationMs,
        dimensions: media.width && media.height ? { width: media.width, height: media.height } : null,
        rawMediaExpiresAt: media.rawMediaExpiresAt.toISOString(),
        sessionId: media.sessionId,
        correlationId: media.correlationId,
      },
      structuredResult: media.structuredResult,
      correctionAudit: media.correctionAudit,
      jobs: jobs.map((job) => ({ kind: job.kind, state: job.state, attempts: job.attempts, functionKey: job.functionKey, confidenceBasisPoints: job.confidenceBasisPoints, errorCode: job.errorCode })),
      rawMediaIncluded: false,
      disclosure: 'Raw media is excluded from this JSON export. Use the short-lived owner preview before its retention expiry if the original is still available.',
    };
  }

  async cleanupExpired(ctx: ActionContext) {
    const rows = await this.repo.listExpiredRaw(250);
    let deleted = 0;
    for (const media of rows) {
      const principal = { kind: 'institutional', institutionId: media.institutionId, studentId: media.studentId } as InstitutionalStudentPrincipal;
      await this.repo.updateMedia(owner(principal), media.id, { state: 'expired', deletedAt: new Date(), structuredResult: {}, correctionAudit: {} });
      await this.removeUnreferencedRaw(principal, media);
      deleted += 1;
    }
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: 'petros.modalities.cleanup.run',
      module: 'petros',
      entityType: 'petros_media_cleanup',
      entityId: 'expired-raw-media',
      newState: { deleted, contentInspected: false },
    } as Parameters<AuditWriter['logAudit']>[0]);
    return { deleted, rawContentInspected: false };
  }

  async dashboard(query: PetrosModalityDashboardQuery, ctx: ActionContext) {
    const rows = await this.repo.dashboardRows(query);
    const modes = [...new Set([...rows.events.map((row) => row.mode), ...rows.media.map((row) => row.mode)])];
    const stages = [...new Set(rows.events.map((row) => row.stage).filter((value): value is string => Boolean(value)))];
    const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    const byMode = modes.map((mode) => {
      const events = rows.events.filter((event) => event.mode === mode);
      const media = rows.media.filter((item) => item.mode === mode);
      return {
        mode,
        volume: media.length || events.filter((event) => event.type === 'session_started').length,
        success: events.filter((event) => ['recognition_ready', 'handwriting_evaluated', 'voice_turn_completed', 'session_started'].includes(event.type)).length,
        failures: events.filter((event) => Boolean(event.errorCode) || event.type.includes('failed')).length,
        lowConfidence: events.filter((event) => event.confidenceBasisPoints != null && event.confidenceBasisPoints < 6_000).length,
        corrections: events.filter((event) => event.type === 'student_confirmed' || event.payload.corrected === true).length,
        averageDurationMs: average(events.map((event) => event.durationMs).filter((value): value is number => value != null)),
        estimatedCostMicros: events.reduce((sum, event) => sum + event.estimatedCostMicros, 0),
        retries: events.reduce((sum, event) => sum + event.retryCount, 0),
        fallbacks: events.filter((event) => (event.fallbackTier ?? 0) > 0).length,
      };
    });
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: 'petros.modalities.dashboard.view',
      module: 'petros',
      entityType: 'petros_modality_aggregate',
      entityId: query.institutionId ?? 'platform',
      newState: { filters: query, eventBuckets: rows.events.length, mediaRows: rows.media.length, contentInspected: false },
    } as Parameters<AuditWriter['logAudit']>[0]);
    return {
      privacy: 'aggregate_only',
      rawMediaExposed: false,
      learnerContentExposed: false,
      byMode,
      latencyByStage: stages.map((stage) => {
        const events = rows.events.filter((event) => event.stage === stage && event.durationMs != null);
        return { stage, count: events.length, averageMs: average(events.map((event) => event.durationMs!)), maximumMs: Math.max(0, ...events.map((event) => event.durationMs!)) };
      }),
      storage: Object.fromEntries([...new Set(rows.media.map((row) => row.state))].map((state) => [state, rows.media.filter((row) => row.state === state).length])),
      jobs: Object.fromEntries([...new Set(rows.jobs.map((row) => row.state))].map((state) => [state, rows.jobs.filter((row) => row.state === state).length])),
      voiceFailures: {
        permission: rows.events.filter((row) => row.type === 'permission_denied').length,
        disconnect: rows.events.filter((row) => row.type === 'network_disconnect').length,
        noise: rows.events.filter((row) => row.type === 'noise_detected').length,
        tts: rows.events.filter((row) => row.type === 'tts_failed').length,
        backgroundStops: rows.events.filter((row) => row.type === 'background_stop').length,
      },
      fiveMinute: {
        started: rows.events.filter((row) => row.mode === 'five_minute' && row.type === 'session_started').length,
        expansionOffered: rows.events.filter((row) => row.type === 'expansion_offered').length,
        expansionAccepted: rows.events.filter((row) => row.type === 'expansion_accepted').length,
        actualDurationAverageMs: average(rows.events.filter((row) => row.mode === 'five_minute' && row.durationMs != null).map((row) => row.durationMs!)),
      },
      costByFunction: aggregateCost(rows.events, (row) => row.functionKey ?? 'non_ai'),
      costByProviderModel: aggregateCost(rows.events, (row) => `${row.providerKey ?? 'unassigned'}:${row.modelKey ?? 'unassigned'}`),
      costByInstitution: aggregateCost(rows.events, (row) => row.institutionId),
      costByModeAndUnit: modes.map((mode) => {
        const matching = rows.events.filter((row) => row.mode === mode);
        return {
          mode,
          estimatedCostMicros: matching.reduce((sum, row) => sum + row.estimatedCostMicros, 0),
          actualCostMicros: matching.reduce((sum, row) => sum + (row.actualCostMicros ?? 0), 0),
          mediaUnits: matching.reduce<Record<string, number>>((totals, row) => {
            for (const [key, value] of Object.entries(row.mediaUnits)) totals[key] = (totals[key] ?? 0) + value;
            return totals;
          }, {}),
        };
      }),
      cache: {
        hits: rows.events.filter((row) => row.cacheHit).length,
        bypassedSensitiveMedia: rows.events.filter((row) => row.functionKey && !row.cacheHit).length,
      },
      capabilityMismatches: rows.events.filter((row) => row.errorCode?.includes('NO_ELIGIBLE') || row.errorCode?.includes('NO_CAPABLE') || row.errorCode?.includes('CAPABILITY')).length,
      policy: { optimization: 'learning_outcomes_only', rawSupportAccess: false, conversionRankings: false, manipulativeEngagement: false },
    };
  }

  private async mediaFunction(
    media: PetrosMediaObjectRow,
    functionKey: string,
    input: Array<{ type: 'text' | 'image' | 'audio'; text?: string; dataBase64?: string; mediaType?: string }>,
    schema: { parse(value: unknown): unknown },
    jobId: string,
    metadata: Record<string, unknown> = {},
  ) {
    const startedAt = Date.now();
    let result: PetrosAiExecuteResult;
    try {
      result = await this.gateway.execute({
        context: {
          functionKey,
          sessionType: media.mode === 'snap_question' ? 'doubt' : media.mode === 'handwriting' ? 'repair' : 'learn',
          inputModality: media.kind === 'voice_turn' ? 'audio' : 'image',
          institutionId: media.institutionId,
          studentId: media.studentId,
          estimatedTokens: 0,
          currentCostMicros: 0,
          previousFailures: 0,
        },
        system: mediaSystemPrompt(functionKey),
        input,
        responseSchema: zodToJsonSchema(schema as never, { $refStrategy: 'none' }) as Record<string, unknown>,
        correlationId: media.correlationId,
        metadata: { mode: media.mode, mediaId: media.id, jobId, sensitiveMedia: true, ...metadata },
        disableCache: true,
      });
    } catch (error) {
      await this.event(media, 'function_failed', derivedUuid(jobId, functionKey), {
        stage: functionStage(functionKey),
        functionKey,
        durationMs: Date.now() - startedAt,
        errorCode: errorCode(error),
        payload: { mediaJobId: jobId },
      });
      throw error;
    }
    await this.event(media, 'function_completed', derivedUuid(jobId, functionKey), {
      stage: functionStage(functionKey),
      functionKey,
      durationMs: result.responseTimeMs,
      estimatedCostMicros: result.estimatedCostMicros,
      actualCostMicros: result.actualCostMicros,
      retryCount: result.retryCount,
      fallbackTier: result.fallbackTier,
      providerKey: result.providerKey,
      modelKey: result.modelKey,
      cacheHit: result.cached,
      payload: { mediaJobId: jobId },
    });
    return result;
  }

  private limits(kind: string) {
    const audio = kind === 'voice_turn';
    const now = Date.now();
    return {
      allowedMimeTypes: audio ? [...PETROS_AUDIO_MIMES] : [...PETROS_IMAGE_MIMES],
      maxBytes: audio ? this.env.PETROS_MEDIA_MAX_AUDIO_BYTES : this.env.PETROS_MEDIA_MAX_IMAGE_BYTES,
      maxDurationSeconds: audio ? this.env.PETROS_MEDIA_MAX_AUDIO_SECONDS : null,
      maxPixels: audio ? null : this.env.PETROS_MEDIA_MAX_PIXELS,
      uploadExpiresAt: new Date(now + 15 * 60_000).toISOString(),
      rawMediaExpiresAt: new Date(now + (audio ? this.env.PETROS_MEDIA_AUDIO_RETENTION_HOURS : this.env.PETROS_MEDIA_IMAGE_RETENTION_HOURS) * 3_600_000).toISOString(),
      retentionDisclosure: audio
        ? `Raw voice is owner-private and scheduled for deletion after ${this.env.PETROS_MEDIA_AUDIO_RETENTION_HOURS} hour(s). Transcript corrections and learning evidence can remain with the session.`
        : `Raw images are owner-private and scheduled for deletion after ${this.env.PETROS_MEDIA_IMAGE_RETENTION_HOURS} hour(s). Confirmed text and learning evidence can remain with the session.`,
    };
  }

  private validateIntent(input: CreatePetrosMediaIntentInput, limits: ReturnType<PetrosInputModesService['limits']>) {
    const mime = input.declaredMimeType.split(';')[0]!.trim().toLowerCase();
    if (!limits.allowedMimeTypes.includes(mime as never)) throw new BadRequestException({ code: 'PETROS_MEDIA_UNSUPPORTED_TYPE', message: 'Choose a supported image or audio format.' });
    if (input.sizeBytes > limits.maxBytes) throw new PayloadTooLargeException({ code: 'PETROS_MEDIA_TOO_LARGE', message: 'The selected file exceeds this mode’s configured limit.' });
    if (input.kind === 'voice_turn' && (!input.durationSeconds || input.durationSeconds > this.env.PETROS_MEDIA_MAX_AUDIO_SECONDS)) {
      throw new BadRequestException({ code: 'PETROS_MEDIA_DURATION_INVALID', message: `Voice turns must be between 0 and ${this.env.PETROS_MEDIA_MAX_AUDIO_SECONDS} seconds.` });
    }
    if (input.kind !== 'voice_turn' && input.width && input.height && input.width * input.height > this.env.PETROS_MEDIA_MAX_PIXELS) {
      throw new PayloadTooLargeException({ code: 'PETROS_MEDIA_RESOLUTION_TOO_LARGE', message: 'Crop or resize this image before uploading.' });
    }
  }

  private async requireMedia(scope: PetrosOwnerScope, mediaId: string) {
    const row = await this.repo.findMedia(scope, mediaId);
    if (!row) throw mediaNotFound();
    return row;
  }

  private async dto(scope: PetrosOwnerScope, media: PetrosMediaObjectRow) {
    const jobs = await this.repo.listJobs(scope, media.id);
    return petrosMediaObjectSchema.parse({
      schemaVersion: PETROS_MEDIA_SCHEMA_VERSION,
      id: media.id,
      kind: media.kind,
      mode: media.mode,
      state: media.state,
      filename: media.filename,
      declaredMimeType: media.declaredMimeType,
      detectedMimeType: media.detectedMimeType,
      sizeBytes: media.sizeBytes,
      durationSeconds: media.durationMs == null ? null : media.durationMs / 1_000,
      width: media.width,
      height: media.height,
      pageIndex: media.pageIndex,
      transform: media.transform,
      duplicateOf: media.duplicateOf,
      rawMediaExpiresAt: media.rawMediaExpiresAt.toISOString(),
      uploadExpiresAt: media.uploadExpiresAt.toISOString(),
      sessionId: media.sessionId,
      correlationId: media.correlationId,
      failureCode: media.failureCode,
      canRetry: media.state === 'retryable_failure' && jobs.filter((job) => job.state === 'retryable_failure').length < MAX_PROCESS_ATTEMPTS,
      canDelete: !['deleted', 'expired'].includes(media.state),
      jobs: jobs.map(jobDto),
      createdAt: media.createdAt.toISOString(),
      updatedAt: media.updatedAt.toISOString(),
    });
  }

  private async processingView(scope: PetrosOwnerScope, media: PetrosMediaObjectRow) {
    return {
      media: await this.dto(scope, media),
      imageUnderstanding: media.structuredResult.imageUnderstanding ?? null,
      questionExtraction: media.structuredResult.questionExtraction ?? null,
      handwritingRecognition: media.structuredResult.handwritingRecognition ?? null,
      handwritingEvaluation: media.structuredResult.handwritingEvaluation ?? null,
      transcription: media.structuredResult.transcription ?? null,
    };
  }

  private event(
    media: PetrosMediaObjectRow,
    type: string,
    idempotencyKey: string,
    extra: Partial<{
      sessionId: string;
      stage: string;
      functionKey: string;
      providerKey: string;
      modelKey: string;
      cacheHit: boolean;
      durationMs: number;
      mediaUnits: Record<string, number>;
      estimatedCostMicros: number;
      actualCostMicros: number;
      retryCount: number;
      fallbackTier: number;
      confidenceBasisPoints: number;
      errorCode: string;
      payload: Record<string, unknown>;
    }>,
  ) {
    return this.repo.recordEvent({
      institutionId: media.institutionId,
      studentId: media.studentId,
      mediaId: media.id,
      sessionId: extra.sessionId,
      mode: media.mode,
      type,
      stage: extra.stage,
      functionKey: extra.functionKey,
      providerKey: extra.providerKey,
      modelKey: extra.modelKey,
      cacheHit: extra.cacheHit ?? false,
      idempotencyKey,
      correlationId: media.correlationId,
      durationMs: extra.durationMs,
      mediaUnits: extra.mediaUnits ?? {},
      estimatedCostMicros: extra.estimatedCostMicros ?? 0,
      actualCostMicros: extra.actualCostMicros,
      retryCount: extra.retryCount ?? 0,
      fallbackTier: extra.fallbackTier,
      confidenceBasisPoints: extra.confidenceBasisPoints,
      errorCode: extra.errorCode,
      payload: extra.payload ?? {},
    });
  }

  private signingSecret() {
    if (this.env.PETROS_MEDIA_SIGNING_SECRET) return this.env.PETROS_MEDIA_SIGNING_SECRET;
    if (this.env.NODE_ENV === 'production') throw new Error('PETROS_MEDIA_SIGNING_SECRET is required in production.');
    return this.env.SESSION_COOKIE_SECRET;
  }

  private async removeUnreferencedRaw(principal: InstitutionalStudentPrincipal, media: PetrosMediaObjectRow) {
    if (!media.storageObjectId) return;
    if ((await this.repo.mediaReferenceCount(media.storageObjectId)) > 0) return;
    try {
      const stored = await this.storage.getOwned(principal, media.storageObjectId);
      await this.storage.removeFile(stored.storageKey);
      await this.repo.deleteStorageObject(stored.id);
    } catch {
      // The bytes may already have been removed by another deduplicated-media cleanup.
    }
  }
}

function owner(principal: InstitutionalStudentPrincipal): PetrosOwnerScope {
  return { institutionId: principal.institutionId, studentId: principal.studentId };
}

function modeForKind(kind: string) {
  return kind === 'question_photo' ? 'snap_question' : kind === 'handwriting_page' ? 'handwriting' : 'voice';
}

function storageKind(kind: string) {
  return kind === 'question_photo' ? 'petros_question_photo' : kind === 'handwriting_page' ? 'petros_handwriting_page' : 'petros_voice_turn';
}

function safeFilename(value: string) {
  return value.replace(/[\r\n\0/\\]/g, '_').slice(0, 255);
}

function invalidState(message: string) {
  return new ConflictException({ code: 'PETROS_MEDIA_INVALID_STATE', message });
}

function mediaNotFound() {
  return new NotFoundException({ code: 'PETROS_MEDIA_NOT_FOUND', message: 'Media not found.' });
}

function errorCode(error: unknown) {
  if (error && typeof error === 'object') {
    const response = 'getResponse' in error && typeof error.getResponse === 'function' ? error.getResponse() : error;
    if (response && typeof response === 'object' && 'code' in response && typeof response.code === 'string') return response.code.slice(0, 120);
  }
  return error instanceof Error ? error.name.slice(0, 120) : 'PETROS_MEDIA_PROCESSING_ERROR';
}

function providerNeutralError(kind: string) {
  if (kind === 'question_photo') return 'PETROS_QUESTION_EXTRACTION_UNAVAILABLE';
  if (kind === 'handwriting_page') return 'PETROS_HANDWRITING_RECOGNITION_UNAVAILABLE';
  return 'PETROS_VOICE_TRANSCRIPTION_UNAVAILABLE';
}

function functionStage(functionKey: string) {
  if (functionKey === 'vision.image.understand') return 'image_understanding';
  if (functionKey === 'vision.question.extract') return 'question_extraction';
  if (functionKey === 'vision.handwriting.analyse') return 'handwriting_recognition';
  if (functionKey === 'working.evaluate_steps') return 'work_evaluation';
  if (functionKey === 'speech.transcribe') return 'speech_transcription';
  if (functionKey === 'speech.synthesise') return 'speech_synthesis';
  if (functionKey === 'interaction.spoken') return 'spoken_interaction';
  return 'ai_function';
}

function aggregateCost<T extends { estimatedCostMicros: number; actualCostMicros: number | null }>(
  rows: T[],
  key: (row: T) => string,
) {
  const totals = new Map<string, { key: string; estimatedCostMicros: number; actualCostMicros: number }>();
  for (const row of rows) {
    const bucket = key(row);
    const current = totals.get(bucket) ?? { key: bucket, estimatedCostMicros: 0, actualCostMicros: 0 };
    current.estimatedCostMicros += row.estimatedCostMicros;
    current.actualCostMicros += row.actualCostMicros ?? 0;
    totals.set(bucket, current);
  }
  return [...totals.values()].sort((a, b) => b.estimatedCostMicros - a.estimatedCostMicros);
}

function digest(value: unknown) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function derivedUuid(seed: string, label: string) {
  const hex = createHash('sha256').update(`${seed}:${label}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function units(media: Pick<PetrosMediaObjectRow, 'sizeBytes' | 'durationMs' | 'width' | 'height'>) {
  return {
    bytes: media.sizeBytes,
    ...(media.durationMs == null ? {} : { audioSeconds: Math.round(media.durationMs / 1_000) }),
    ...(media.width && media.height ? { pixels: media.width * media.height } : {}),
  };
}

function jobDto(job: PetrosMediaJobRow) {
  return {
    id: job.id,
    kind: job.kind,
    state: job.state,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    functionKey: job.functionKey,
    confidence: job.confidenceBasisPoints == null ? null : job.confidenceBasisPoints / 10_000,
    errorCode: job.errorCode,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function snapOpening(stuckPoint: ConfirmPetrosQuestionInput['stuckPoint']) {
  const next: Record<typeof stuckPoint, string> = {
    understanding: 'Restate what the question is asking in your own words and identify the quantity or claim that must change.',
    setting_up: 'List the givens, the unknown, and the one relationship that connects them before doing any calculation.',
    choosing_method: 'Name the clue that rules one method in and the tempting alternative out.',
    solving: 'Take only the first reversible step, then check that it still points at the requested result.',
  };
  return {
    prompt: 'Where are you stuck—understanding, setting up, choosing a method, or solving?',
    selected: stuckPoint,
    fastestUsefulNextStep: next[stuckPoint],
    completeSolutionIncluded: false,
  };
}

function mediaSystemPrompt(functionKey: string) {
  const privacy = 'Never infer identity, disability, mood, mental health, or any biometric/emotional conclusion. Return strict JSON only and do not add fields.';
  if (functionKey === 'vision.image.understand') return `Assess only readability, content type, quality problems, question count, and whether processing is safe. ${privacy}`;
  if (functionKey === 'vision.question.extract') return `Extract visible question text, context, normalized coordinates, confidence, diagram description, and honest warnings. Do not solve the question. ${privacy}`;
  if (functionKey === 'vision.handwriting.analyse') return `Recognize every handwritten line in visual order with normalized coordinates, confidence, and uncertain tokens. Do not grade or complete the work. ${privacy}`;
  if (functionKey === 'working.evaluate_steps') return `Treat the student-confirmed lines as authoritative. Distinguish the first logical break from later consequence errors; classify concept, method, arithmetic, notation, misread, or time-pressure errors; identify mark loss and what a grader circles; teach one missing step and offer a reattempt. Never replace the whole solution. ${privacy}`;
  return `Transcribe the turn with language, confidence, and uncertain time segments. Preserve mixed language and never infer speaker identity or emotion. ${privacy}`;
}

function audioContent(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.dataBase64 !== 'string' || typeof row.mimeType !== 'string') return null;
  return { dataBase64: row.dataBase64, mimeType: row.mimeType };
}

export function conciseSpokenText(document: Awaited<ReturnType<PetrosLoopService['document']>>) {
  const current = document.blocks.find((block) => block.status === 'current') ?? document.blocks.at(-1);
  if (!current) return `The ${document.topic} session is ready for the next step.`;
  const prefix = `Move ${current.sequence} of ${document.maxMoves}.`;
  const activeQuestion = current.questions.find((question) => question.active);
  if (activeQuestion) {
    const choices = activeQuestion.choices?.map((choice) => choice.label).join(', ');
    return spokenLimit(`${prefix} ${activeQuestion.prompt}${choices ? ` Options: ${choices}.` : ''}`);
  }
  const latestFeedback = current.questions
    .flatMap((question) => question.attempts)
    .at(-1)?.feedback;
  if (latestFeedback) return spokenLimit(`${prefix} ${latestFeedback}`);

  const content = current.content as unknown as Record<string, unknown>;
  const preferredKeys = [
    'prompt',
    'instructions',
    'goal',
    'firstLayer',
    'problemStatement',
    'commitmentPrompt',
    'correction',
    'keyDistinction',
    'fallbackText',
    'takeaway',
    'conclusion',
    'connection',
    'openQuestion',
  ];
  const spoken = preferredKeys
    .map((key) => content[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .slice(0, 2);
  return spokenLimit([prefix, typeof content.title === 'string' ? content.title : '', ...spoken].filter(Boolean).join(' '));
}

function spokenLimit(value: string, maxCharacters = 360) {
  const normalised = value.replace(/\s+/g, ' ').trim();
  if (normalised.length <= maxCharacters) return normalised;
  const candidate = normalised.slice(0, maxCharacters - 1);
  const sentenceEnd = Math.max(candidate.lastIndexOf('. '), candidate.lastIndexOf('? '), candidate.lastIndexOf('! '));
  const wordEnd = candidate.lastIndexOf(' ');
  const end = sentenceEnd >= Math.floor(maxCharacters * 0.55) ? sentenceEnd + 1 : wordEnd;
  return `${candidate.slice(0, Math.max(1, end)).trimEnd()}…`;
}
