import { z } from 'zod';

export const knowledgeItemKindSchema = z.enum([
  'upload_pdf',
  'upload_scan',
  'upload_doc',
  'saved_material',
  'topic_pack',
]);

export const knowledgeArtifactKindSchema = z.enum([
  'summary',
  'quiz',
  'topic_pack',
  'visual',
  'concept_map',
  'glossary',
]);

export const freshnessBucketSchema = z.enum(['fresh', 'fading', 'due']);

export const createKnowledgeItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  collectionId: z.string().uuid().optional(),
  objectIds: z.array(z.string().uuid()).min(1),
});

export const patchKnowledgeItemPagesSchema = z.object({
  objectIds: z.array(z.string().uuid()).min(1),
});

export const createCollectionSchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().max(20).optional(),
});

export const patchCollectionSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  color: z.string().max(20).optional(),
  sequence: z.number().int().optional(),
});

export const summaryContentSchema = z.object({
  title: z.string(),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
});

export const deckGenerationSchema = z.object({
  title: z.string(),
  cards: z.array(z.object({ prompt: z.string(), answer: z.string() })),
});

export const quizItemSchema = z.object({
  qtype: z.enum(['mcq', 'short']),
  prompt: z.string(),
  options: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
  correctKey: z.string().optional(),
  markingNote: z.string().optional(),
});

export const quizContentSchema = z.object({
  items: z.array(quizItemSchema),
});

export const conceptMapNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  miniDefinition: z.string(),
  sourceLocation: z.string(),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
});

export const conceptMapEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  relation: z.enum(['depends_on', 'part_of', 'step']),
});

export const conceptMapContentSchema = z.object({
  title: z.string(),
  layout: z.enum(['web', 'flowchart']),
  nodes: z.array(conceptMapNodeSchema),
  edges: z.array(conceptMapEdgeSchema),
});

export const glossaryEntrySchema = z.object({
  term: z.string(),
  definition: z.string(),
  sourceLocation: z.string(),
});

export const glossaryContentSchema = z.object({
  title: z.string(),
  entries: z.array(glossaryEntrySchema),
});

export const libraryTutorInputSchema = z.object({
  focusConcept: z.string().min(1).max(200).optional(),
});

export const quizAttemptSchema = z.object({
  answers: z.array(
    z.object({
      itemIndex: z.number().int().nonnegative(),
      choiceKey: z.string().optional(),
      answerText: z.string().optional(),
    }),
  ),
});

export const flashcardReviewSchema = z.object({
  cardId: z.string().uuid(),
  result: z.enum(['got_it', 'again']),
});

export const patchDeckSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export const patchFlashcardSchema = z.object({
  prompt: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  sequence: z.number().int().optional(),
});

export const createFlashcardSchema = z.object({
  prompt: z.string().min(1),
  answer: z.string().min(1),
  sequence: z.number().int().optional(),
});

export const deckFromSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

export const libraryGeneratedItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.union([knowledgeArtifactKindSchema, z.literal('deck')]),
  title: z.string(),
  fromLabel: z.string(),
  freshness: freshnessBucketSchema.optional(),
  meta: z.string().optional(),
  createdAt: z.string(),
});

export const libraryOverviewSchema = z.object({
  collections: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      color: z.string().nullable(),
      count: z.number().int(),
    }),
  ),
  uploads: z.array(
    z.object({
      id: z.string().uuid(),
      kind: knowledgeItemKindSchema,
      title: z.string(),
      meta: z.string(),
      aiRead: z.boolean(),
      createdAt: z.string(),
    }),
  ),
  generated: z.array(libraryGeneratedItemSchema),
  recentAdded: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      kind: z.string(),
    }),
  ),
});

export type CreateKnowledgeItemInput = z.infer<typeof createKnowledgeItemSchema>;
export type LibraryOverviewDto = z.infer<typeof libraryOverviewSchema>;
export type ConceptMapContent = z.infer<typeof conceptMapContentSchema>;
export type GlossaryContent = z.infer<typeof glossaryContentSchema>;
export type LibraryTutorInput = z.infer<typeof libraryTutorInputSchema>;
