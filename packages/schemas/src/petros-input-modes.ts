import { z } from 'zod';

export const PETROS_MEDIA_SCHEMA_VERSION = 'petros.media.v1';
export const PETROS_MEDIA_MODES = [
  'snap_question',
  'handwriting',
  'voice',
  'five_minute',
] as const;
export const PETROS_MEDIA_KINDS = [
  'question_photo',
  'handwriting_page',
  'voice_turn',
] as const;
export const PETROS_MEDIA_STATES = [
  'upload_intent',
  'uploaded',
  'scanning',
  'quarantined',
  'ready_for_processing',
  'processing',
  'needs_confirmation',
  'ready',
  'session_created',
  'retryable_failure',
  'failed',
  'cancelled',
  'expired',
  'deleted',
] as const;
export const PETROS_MEDIA_JOB_KINDS = [
  'scan',
  'image_understanding',
  'question_extraction',
  'handwriting_recognition',
  'work_evaluation',
  'speech_transcription',
  'spoken_interaction',
  'speech_synthesis',
  'cleanup',
] as const;
export const PETROS_MEDIA_JOB_STATES = [
  'queued',
  'running',
  'needs_confirmation',
  'completed',
  'retryable_failure',
  'failed',
  'cancelled',
] as const;

export const petrosMediaModeSchema = z.enum(PETROS_MEDIA_MODES);
export const petrosMediaKindSchema = z.enum(PETROS_MEDIA_KINDS);
export const petrosMediaStateSchema = z.enum(PETROS_MEDIA_STATES);
export const petrosMediaJobKindSchema = z.enum(PETROS_MEDIA_JOB_KINDS);
export const petrosMediaJobStateSchema = z.enum(PETROS_MEDIA_JOB_STATES);

const boundedText = z.string().trim().min(1).max(2_000);
const confidence = z.number().min(0).max(1);
const normalisedRegionSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .strict();

export const petrosMediaLimitsSchema = z
  .object({
    allowedMimeTypes: z.array(z.string()).min(1),
    maxBytes: z.number().int().positive(),
    maxDurationSeconds: z.number().int().positive().nullable(),
    maxPixels: z.number().int().positive().nullable(),
    uploadExpiresAt: z.string().datetime(),
    rawMediaExpiresAt: z.string().datetime(),
    retentionDisclosure: boundedText,
  })
  .strict();
export type PetrosMediaLimits = z.infer<typeof petrosMediaLimitsSchema>;

export const createPetrosMediaIntentSchema = z
  .object({
    kind: petrosMediaKindSchema,
    filename: z.string().trim().min(1).max(255),
    declaredMimeType: z.string().trim().min(3).max(120),
    sizeBytes: z.number().int().positive(),
    durationSeconds: z.number().positive().max(3_600).nullable().default(null),
    width: z.number().int().positive().nullable().default(null),
    height: z.number().int().positive().nullable().default(null),
    pageIndex: z.number().int().min(0).max(19).default(0),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type CreatePetrosMediaIntentInput = z.infer<typeof createPetrosMediaIntentSchema>;

export const petrosMediaTransformSchema = z
  .object({
    rotationDegrees: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    crop: normalisedRegionSchema.nullable(),
  })
  .strict();

export const petrosMediaUploadHeadersSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    transform: petrosMediaTransformSchema.default({ rotationDegrees: 0, crop: null }),
  })
  .strict();
export type PetrosMediaUploadHeaders = z.infer<typeof petrosMediaUploadHeadersSchema>;

export const petrosMediaJobSchema = z
  .object({
    id: z.string().uuid(),
    kind: petrosMediaJobKindSchema,
    state: petrosMediaJobStateSchema,
    attempts: z.number().int().nonnegative(),
    maxAttempts: z.number().int().positive(),
    functionKey: z.string().nullable(),
    confidence: confidence.nullable(),
    errorCode: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const petrosMediaObjectSchema = z
  .object({
    schemaVersion: z.literal(PETROS_MEDIA_SCHEMA_VERSION),
    id: z.string().uuid(),
    kind: petrosMediaKindSchema,
    mode: petrosMediaModeSchema,
    state: petrosMediaStateSchema,
    filename: z.string(),
    declaredMimeType: z.string(),
    detectedMimeType: z.string().nullable(),
    sizeBytes: z.number().int().nonnegative(),
    durationSeconds: z.number().nullable(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    pageIndex: z.number().int().nonnegative(),
    transform: petrosMediaTransformSchema,
    duplicateOf: z.string().uuid().nullable(),
    rawMediaExpiresAt: z.string().datetime(),
    uploadExpiresAt: z.string().datetime(),
    sessionId: z.string().uuid().nullable(),
    correlationId: z.string().uuid(),
    failureCode: z.string().nullable(),
    canRetry: z.boolean(),
    canDelete: z.boolean(),
    jobs: z.array(petrosMediaJobSchema),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PetrosMediaObject = z.infer<typeof petrosMediaObjectSchema>;

export const petrosImageUnderstandingSchema = z
  .object({
    readable: z.boolean(),
    inputType: z.enum(['printed_question', 'handwritten_work', 'mixed', 'unsupported']),
    quality: z
      .object({
        overallConfidence: confidence,
        issues: z
          .array(
            z.enum([
              'low_light',
              'glare',
              'rotation',
              'blur',
              'cropped_content',
              'multiple_questions',
              'handwriting_overlap',
              'unsupported_content',
            ]),
          )
          .max(8),
        guidance: z.array(boundedText).max(8),
      })
      .strict(),
    detectedQuestionCount: z.number().int().min(0).max(20),
    hasDiagram: z.boolean(),
    safeToProcess: z.boolean(),
  })
  .strict();
export type PetrosImageUnderstanding = z.infer<typeof petrosImageUnderstandingSchema>;

export const petrosQuestionExtractionSchema = z
  .object({
    questions: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(80),
            text: boundedText,
            context: z.string().trim().max(1_200),
            confidence,
            region: normalisedRegionSchema,
            hasDiagram: z.boolean(),
            diagramDescription: z.string().trim().max(1_200).nullable(),
            warnings: z.array(boundedText).max(6),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    overallConfidence: confidence,
    requiresStudentSelection: z.boolean(),
    requiresRetake: z.boolean(),
    retakeGuidance: z.array(boundedText).max(8),
  })
  .strict();
export type PetrosQuestionExtraction = z.infer<typeof petrosQuestionExtractionSchema>;

export const petrosHandwritingRecognitionSchema = z
  .object({
    overallConfidence: confidence,
    requiresCorrection: z.boolean(),
    lines: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(80),
            order: z.number().int().positive(),
            text: z.string().trim().max(1_000),
            confidence,
            region: normalisedRegionSchema,
            uncertainTokens: z.array(z.string().trim().min(1).max(120)).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(120),
    pageWarnings: z.array(boundedText).max(8),
  })
  .strict();
export type PetrosHandwritingRecognition = z.infer<typeof petrosHandwritingRecognitionSchema>;

export const PETROS_WORK_ERROR_CATEGORIES = [
  'concept',
  'method',
  'arithmetic',
  'notation',
  'misread',
  'time_pressure',
  'none',
] as const;

export const petrosHandwritingEvaluationSchema = z
  .object({
    overallConfidence: confidence,
    firstBreakLineId: z.string().trim().min(1).max(80).nullable(),
    markLosingLineIds: z.array(z.string().trim().min(1).max(80)).max(20),
    lines: z
      .array(
        z
          .object({
            lineId: z.string().trim().min(1).max(80),
            status: z.enum(['correct', 'first_break', 'consequence_error', 'uncertain']),
            category: z.enum(PETROS_WORK_ERROR_CATEGORIES),
            consequenceOfLineId: z.string().trim().min(1).max(80).nullable(),
            feedback: boundedText,
            graderCircle: z.string().trim().max(500).nullable(),
            markImpact: z.string().trim().max(500).nullable(),
            confidence,
          })
          .strict(),
      )
      .min(1)
      .max(120),
    teachingStep: boundedText,
    reattemptPrompt: boundedText,
    accessibleSummary: boundedText,
    uncertaintyDisclosure: z.string().trim().max(1_000).nullable(),
  })
  .strict();
export type PetrosHandwritingEvaluation = z.infer<typeof petrosHandwritingEvaluationSchema>;

export const processPetrosMediaSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    language: z.enum(['en', 'hi', 'ml', 'ta', 'te', 'kn', 'auto']).optional(),
  })
  .strict();
export type ProcessPetrosMediaInput = z.infer<typeof processPetrosMediaSchema>;

export const confirmPetrosQuestionSchema = z
  .object({
    selectedQuestionId: z.string().trim().min(1).max(80),
    correctedQuestion: boundedText,
    stuckPoint: z.enum(['understanding', 'setting_up', 'choosing_method', 'solving']),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type ConfirmPetrosQuestionInput = z.infer<typeof confirmPetrosQuestionSchema>;

export const confirmPetrosHandwritingSchema = z
  .object({
    correctedLines: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(80),
            order: z.number().int().positive(),
            text: z.string().trim().min(1).max(1_000),
          })
          .strict(),
      )
      .min(1)
      .max(120),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type ConfirmPetrosHandwritingInput = z.infer<typeof confirmPetrosHandwritingSchema>;

export const startPetrosVoiceSessionSchema = z
  .object({
    concept: z.string().trim().min(2).max(240),
    language: z.string().trim().min(2).max(40).default('en'),
    mixedLanguage: z.boolean().default(false),
    handsFree: z.boolean().default(false),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type StartPetrosVoiceSessionInput = z.infer<typeof startPetrosVoiceSessionSchema>;

export const submitPetrosVoiceTurnSchema = z
  .object({
    mediaId: z.string().uuid(),
    sessionId: z.string().uuid(),
    transcriptCorrection: z.string().trim().min(1).max(4_000).optional(),
    confidence: z.enum(['sure', 'think_so', 'guessing']).default('think_so'),
    language: z.string().trim().min(2).max(40).default('en'),
    mixedLanguage: z.boolean().default(false),
    interruptPrevious: z.boolean().default(false),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type SubmitPetrosVoiceTurnInput = z.infer<typeof submitPetrosVoiceTurnSchema>;

export const petrosSpeechTranscriptionSchema = z
  .object({
    text: z.string().trim().min(1).max(8_000),
    language: z.string().trim().min(2).max(40).nullable(),
    confidence,
    uncertainSegments: z
      .array(
        z
          .object({
            startSeconds: z.number().nonnegative(),
            endSeconds: z.number().nonnegative(),
            text: z.string().max(500),
            confidence,
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export type PetrosSpeechTranscription = z.infer<typeof petrosSpeechTranscriptionSchema>;

export const startPetrosFiveMinuteSchema = z
  .object({
    concept: z.string().trim().min(2).max(240),
    goal: z.string().trim().min(3).max(600).optional(),
    language: z.string().trim().min(2).max(40).default('en'),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type StartPetrosFiveMinuteInput = z.infer<typeof startPetrosFiveMinuteSchema>;

export const petrosMediaAccessSchema = z
  .object({
    url: z.string().startsWith('/'),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type PetrosMediaAccess = z.infer<typeof petrosMediaAccessSchema>;

export const petrosModalityClientEventSchema = z
  .object({
    mode: petrosMediaModeSchema,
    type: z.enum([
      'permission_denied',
      'recording_started',
      'recording_stopped',
      'background_stop',
      'network_disconnect',
      'noise_detected',
      'transcript_corrected',
      'tts_failed',
      'switched_to_text',
      'interruption',
      'headset_changed',
      'expansion_offered',
      'expansion_accepted',
    ]),
    mediaId: z.string().uuid().optional(),
    sessionId: z.string().uuid().optional(),
    durationMs: z.number().int().nonnegative().max(3_600_000).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type PetrosModalityClientEventInput = z.infer<typeof petrosModalityClientEventSchema>;

export const petrosModalityDashboardQuerySchema = z.object({
  institutionId: z.string().uuid().optional(),
  mode: petrosMediaModeSchema.optional(),
  functionKey: z.string().trim().min(1).max(160).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type PetrosModalityDashboardQuery = z.infer<typeof petrosModalityDashboardQuerySchema>;
