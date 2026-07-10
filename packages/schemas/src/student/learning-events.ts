import { z } from 'zod';

const basePayload = z.object({
  subject: z.string().optional(),
  topicKey: z.string().optional(),
});

export const learningEventPayloadSchemas = {
  'session.started': basePayload.extend({
    sessionId: z.string().uuid(),
    topicKey: z.string(),
    source: z.enum(['path', 'resume', 'tutor_grounded', 'prep_plan', 'intent', 'refresh']),
  }),
  'session.block_completed': basePayload.extend({
    sessionId: z.string().uuid(),
    blockId: z.string().uuid(),
    blockType: z.string(),
  }),
  'session.checkpoint_answered': basePayload.extend({
    sessionId: z.string().uuid(),
    blockId: z.string().uuid(),
    correct: z.boolean(),
    tries: z.number().int(),
    method: z.enum(['mcq', 'explained']),
  }),
  'session.practice_attempted': basePayload.extend({
    sessionId: z.string().uuid().optional(),
    setId: z.string().uuid().optional(),
    itemId: z.string().uuid(),
    correct: z.boolean(),
    hintsUsed: z.number().int(),
  }),
  'session.paused': basePayload.extend({
    sessionId: z.string().uuid(),
    stepIndex: z.number().int(),
  }),
  'session.resumed': basePayload.extend({
    sessionId: z.string().uuid(),
    stepIndex: z.number().int(),
  }),
  'session.completed': basePayload.extend({
    sessionId: z.string().uuid(),
    topicKey: z.string(),
    evidence: z.array(z.string()),
  }),
  'quick.asked': basePayload.extend({
    quickId: z.string().uuid(),
    question: z.string(),
    routedFrom: z.enum(['home', 'drawer', 'explore']),
  }),
  'path.created': basePayload.extend({
    pathId: z.string().uuid(),
  }),
  'path.item_completed': basePayload.extend({
    pathId: z.string().uuid(),
    itemId: z.string().uuid(),
  }),
  'path.edited': basePayload.extend({
    pathId: z.string().uuid(),
    itemId: z.string().uuid().optional(),
  }),
  'revision.completed': basePayload.extend({
    topicKey: z.string(),
    mode: z.enum(['refresh10', 'session', 'flashcards']),
  }),
  'drawer.asked': basePayload.extend({
    contextKind: z.string(),
    contextId: z.string().uuid(),
    pinned: z.boolean(),
  }),
  'library.item_uploaded': basePayload.extend({
    itemId: z.string().uuid(),
    mime: z.string(),
    pages: z.number().int().optional(),
  }),
  'library.item_processed': basePayload.extend({
    itemId: z.string().uuid(),
    mime: z.string(),
    pages: z.number().int().optional(),
  }),
  'library.artifact_generated': basePayload.extend({
    itemId: z.string().uuid().optional(),
    artifactId: z.string().uuid(),
    artifactKind: z.string(),
  }),
  'flashcards.reviewed': basePayload.extend({
    deckId: z.string().uuid(),
    cards: z.number().int(),
    gotIt: z.number().int(),
    again: z.number().int(),
  }),
  'quiz.completed': basePayload.extend({
    artifactId: z.string().uuid(),
    attemptId: z.string().uuid(),
  }),
  'mock.completed': basePayload.extend({
    mockId: z.string().uuid(),
    total: z.number().int(),
    correct: z.number().int(),
    byTopic: z.array(
      z.object({
        topicKey: z.string(),
        total: z.number().int(),
        correct: z.number().int(),
      }),
    ),
  }),
  'exam.blueprint_created': basePayload.extend({
    blueprintId: z.string().uuid(),
    template: z.string(),
    sourceKind: z.string(),
  }),
  'exam.attempt_started': basePayload.extend({
    examId: z.string().uuid(),
    attemptId: z.string().uuid(),
  }),
  'exam.attempt_submitted': basePayload.extend({
    examId: z.string().uuid(),
    attemptId: z.string().uuid(),
  }),
  'exam.graded': basePayload.extend({
    examId: z.string().uuid(),
    attemptId: z.string().uuid(),
    awardedMarks: z.number(),
    maxMarks: z.number(),
  }),
  'exam.retake_weak_started': basePayload.extend({
    sourceExamId: z.string().uuid(),
    newExamId: z.string().uuid(),
    topics: z.array(z.string()),
  }),
  'exam.topics_pushed_to_revision': basePayload.extend({
    attemptId: z.string().uuid(),
    topicLabels: z.array(z.string()),
  }),
  'debate.completed': basePayload.extend({
    debateId: z.string().uuid(),
    format: z.string(),
    mode: z.enum(['solo', 'friend']),
    turns: z.number().int(),
  }),
  'homework.submitted': basePayload.extend({
    homeworkId: z.string().uuid(),
    questionsAnswered: z.number().int().optional(),
    version: z.number().int().optional(),
  }),
  'assignment.submitted': basePayload.extend({
    assignmentId: z.string().uuid(),
    questionsAnswered: z.number().int().optional(),
    version: z.number().int().optional(),
  }),
  'homework.returned': basePayload.extend({
    id: z.string().uuid(),
    marks: z.number().optional(),
    max: z.number().optional(),
  }),
  'assignment.returned': basePayload.extend({
    id: z.string().uuid(),
    marks: z.number().optional(),
    max: z.number().optional(),
  }),
  'report_card.published': basePayload.extend({
    reportCardId: z.string().uuid(),
    term: z.string(),
  }),
  'achievement.unlocked': basePayload.extend({
    badgeKey: z.string(),
    tier: z.string(),
  }),
  'visual.topic_declined': basePayload.extend({
    category: z.string(),
  }),
  'visual.canvas_created': basePayload.extend({
    canvasId: z.string().uuid(),
    origin: z.string(),
    archetype: z.string(),
    nodeCount: z.number().int(),
    edgeCount: z.number().int(),
  }),
  'visual.archetype_changed': basePayload.extend({
    canvasId: z.string().uuid(),
    from: z.string(),
    to: z.string(),
  }),
  'visual.node_marked_shaky': basePayload.extend({
    canvasId: z.string().uuid(),
    nodeId: z.string(),
    topicId: z.string().uuid(),
  }),
  'visual.node_resolved': basePayload.extend({
    canvasId: z.string().uuid(),
    nodeId: z.string(),
    topicId: z.string().uuid(),
  }),
  'visual.branch_expanded': basePayload.extend({
    canvasId: z.string().uuid(),
    anchorNodeId: z.string(),
    addedNodeIds: z.array(z.string()),
  }),
  'visual.alternative_added': basePayload.extend({
    canvasId: z.string().uuid(),
    anchorNodeId: z.string(),
    addedNodeIds: z.array(z.string()),
  }),
  'visual.node_quiz_completed': basePayload.extend({
    canvasId: z.string().uuid(),
    nodeId: z.string(),
    results: z.array(
      z.object({
        questionId: z.string().uuid(),
        correct: z.boolean(),
      }),
    ),
  }),
  'visual.memory_check_completed': basePayload.extend({
    canvasId: z.string().uuid(),
    topicId: z.string().uuid(),
    matchedNodeIds: z.array(z.string()),
    missingReferenceNodeIds: z.array(z.string()),
    correctEdgeIds: z.array(z.string()),
    wrongEdgeIds: z.array(z.string()),
    matchingMode: z.enum(['embeddings', 'normalized_title_fallback']),
  }),
  'visual.revision_queued': basePayload.extend({
    canvasId: z.string().uuid(),
    topicId: z.string().uuid(),
    nodeIds: z.array(z.string()),
    reason: z.enum(['shaky', 'memory_missing']),
  }),
  'visual.canvas_deleted': basePayload.extend({
    canvasId: z.string().uuid(),
    origin: z.string(),
  }),
  'goal.weekly_met': basePayload.extend({
    weekStart: z.string(),
    target: z.number().int(),
    done: z.number().int(),
  }),
} as const;

export type LearningEventType = keyof typeof learningEventPayloadSchemas;

export type LearningEventInput = z.infer<typeof learningEventInputSchema>;

export const learningEventInputSchema = z.object({
  eventType: z.string(),
  payload: z.record(z.unknown()),
  topicKey: z.string().optional(),
  subjectLabel: z.string().optional(),
  contextType: z.string().optional(),
  contextId: z.string().uuid().optional(),
  actorKind: z.enum(['student', 'staff', 'system']).optional(),
  actorId: z.string().uuid().optional(),
});

/** Event types that count toward streak activity. */
export const STREAK_ACTIVITY_EVENT_TYPES = [
  'session.completed',
  'session.practice_attempted',
  'session.checkpoint_answered',
  'revision.completed',
  'quick.asked',
  'flashcards.reviewed',
] as const;

/** Event types that count toward weekly goal progress. */
export const WEEKLY_GOAL_EVENT_TYPES = ['session.completed', 'revision.completed'] as const;
