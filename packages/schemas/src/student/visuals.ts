import { z } from 'zod';
import { collectVisualGraphIssues, computeExpectedDepths } from './visual-graph-rules';

export {
  collectVisualGraphIssues,
  isArchetypeCompatible,
  type VisualGraphIssue,
  type GraphForValidation,
  type VisualNodeType,
  type VisualEdgeType,
} from './visual-graph-rules';

export const GRAPH_SCHEMA_VERSION = 1 as const;
export const AI_GRAPH_NODE_LIMIT = 60;
export const AI_GRAPH_DEPTH_LIMIT = 6;
export const CANVAS_NODE_LIMIT = 200;
export const CANVAS_GRAPH_MAX_BYTES = 400_000;

export const visualArchetypeSchema = z.enum([
  'mind_map',
  'flowchart',
  'cycle',
  'timeline',
  'hierarchy',
  'comparison',
]);

export const visualNodeTypeSchema = z.enum([
  'concept',
  'process_step',
  'decision',
  'example',
  'question',
  'definition',
  'formula',
  'note',
]);

export const visualNodeStatusSchema = z.enum(['normal', 'shaky', 'resolved']);
export const visualNodeOriginSchema = z.enum([
  'ai',
  'student',
  'ai_expansion',
  'alternative_path',
]);

export const visualEdgeTypeSchema = z.enum([
  'leads_to',
  'causes',
  'requires',
  'contrasts_with',
  'example_of',
  'part_of',
  'alternative_to',
]);

export const graphLocalIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, underscore, or hyphen');

export const libraryPageSourceRefSchema = z
  .object({
    kind: z.literal('library_page'),
    item_id: z.string().uuid(),
    page_id: z.string().uuid().optional(),
    page_index: z.number().int().min(0),
    quote: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const learnTopicSourceRefSchema = z
  .object({
    kind: z.literal('learn_topic'),
    topic_id: z.string().uuid(),
    topic_key: z.string().trim().min(1).max(200),
  })
  .strict();

export const learnSessionBlockSourceRefSchema = z
  .object({
    kind: z.literal('learn_session_block'),
    session_id: z.string().uuid(),
    block_id: z.string().uuid().optional(),
  })
  .strict();

export const visualSourceRefSchema = z.discriminatedUnion('kind', [
  libraryPageSourceRefSchema,
  learnTopicSourceRefSchema,
  learnSessionBlockSourceRefSchema,
]);

export const visualGraphNodeSchema = z
  .object({
    id: graphLocalIdSchema,
    type: visualNodeTypeSchema,
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().max(1_500),
    depth: z.number().int().min(0).max(AI_GRAPH_DEPTH_LIMIT),
    collapsed: z.boolean(),
    status: visualNodeStatusSchema,
    origin: visualNodeOriginSchema,
    source_ref: visualSourceRefSchema.optional(),
  })
  .strict();

export const visualGraphEdgeSchema = z
  .object({
    id: graphLocalIdSchema,
    source: graphLocalIdSchema,
    target: graphLocalIdSchema,
    type: visualEdgeTypeSchema,
    label: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const visualPositionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

export const visualViewportSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().finite().min(0.05).max(4),
  })
  .strict();

export const visualLayoutSnapshotSchema = z
  .object({
    algorithm: z.enum([
      'elk_radial',
      'elk_layered',
      'elk_mrtree',
      'custom_cycle',
      'custom_timeline',
      'custom_comparison',
    ]),
    positions: z.record(graphLocalIdSchema, visualPositionSchema),
    viewport: visualViewportSchema.optional(),
  })
  .strict();

const canvasGraphShape = z
  .object({
    graph_schema_version: z.literal(GRAPH_SCHEMA_VERSION),
    title: z.string().trim().min(1).max(200),
    archetype: visualArchetypeSchema,
    root_node_id: graphLocalIdSchema.nullable(),
    nodes: z.array(visualGraphNodeSchema).max(CANVAS_NODE_LIMIT),
    edges: z.array(visualGraphEdgeSchema).max(600),
    layout_cache: z
      .record(visualArchetypeSchema, visualLayoutSnapshotSchema)
      .default({}),
  })
  .strict();

function addStructuralGraphIssues(
  graph: z.infer<typeof canvasGraphShape>,
  ctx: z.RefinementCtx,
) {
  const nodeIds = new Set<string>();
  for (const [index, node] of graph.nodes.entries()) {
    if (nodeIds.has(node.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nodes', index, 'id'],
        message: `Duplicate node id: ${node.id}`,
      });
    }
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const [index, edge] of graph.edges.entries()) {
    if (edgeIds.has(edge.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['edges', index, 'id'],
        message: `Duplicate edge id: ${edge.id}`,
      });
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['edges', index, 'source'],
        message: `Unknown source node: ${edge.source}`,
      });
    }
    if (!nodeIds.has(edge.target)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['edges', index, 'target'],
        message: `Unknown target node: ${edge.target}`,
      });
    }
    if (edge.source === edge.target) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['edges', index],
        message: 'Self edges are not allowed',
      });
    }
  }
  if (graph.root_node_id !== null && !nodeIds.has(graph.root_node_id)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['root_node_id'],
      message: 'Root node does not exist',
    });
  }
  for (const [archetype, layout] of Object.entries(graph.layout_cache)) {
    for (const id of Object.keys(layout?.positions ?? {})) {
      if (!nodeIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['layout_cache', archetype, 'positions', id],
          message: 'Position references an unknown node',
        });
      }
    }
  }
}

export const canvasGraphSchema = canvasGraphShape.superRefine(addStructuralGraphIssues);

function addCompleteGraphIssues(
  graph: z.infer<typeof canvasGraphShape>,
  ctx: z.RefinementCtx,
) {
  addStructuralGraphIssues(graph, ctx);
  if (graph.nodes.length < 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['nodes'],
      message: 'A complete graph needs at least two nodes',
    });
  }
  if (graph.root_node_id === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['root_node_id'],
      message: 'A complete graph needs a root',
    });
  }
  for (const issue of collectVisualGraphIssues(graph)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: issue.path,
      message: issue.message,
    });
  }
}

export const completeCanvasGraphSchema = canvasGraphShape.superRefine(addCompleteGraphIssues);

/**
 * The AI boundary only.
 *
 * This schema is fed to zodToJsonSchema for OpenAI structured outputs, which requires
 * every property to be present — the model cannot omit an optional field, so it emits
 * `label: ""` and the storage rule (`min(1)`) rejected the whole graph, failing every
 * generation. Treat an empty/blank label as "no label" here and normalize it away, so
 * nothing empty is ever stored and the storage schema stays strict.
 */
/** Accepts `label: ""` / null from structured output; storage schema stays strict. */
export const aiVisualGraphEdgeSchema = visualGraphEdgeSchema.extend({
  label: z.string().max(120).nullish(),
});

const aiCanvasGraphShape = canvasGraphShape.extend({
  edges: z.array(aiVisualGraphEdgeSchema).max(600),
});

/**
 * Depth is derived from graph structure, never authored. The model was numbering
 * timeline steps 2,3,4... down the chain when the rule puts every backbone step at
 * depth 1, which failed the whole generation. Recompute depth from the structure the
 * model actually produced rather than trusting its arithmetic; the validator below
 * still enforces the same rule, so nothing is loosened.
 */
function normalizeAiGraph(
  graph: z.infer<typeof aiCanvasGraphShape>,
): z.infer<typeof canvasGraphShape> {
  // Drop the key entirely rather than carrying `label: undefined`, so the result is the
  // canonical graph type and nothing empty is ever persisted.
  const edges: z.infer<typeof visualGraphEdgeSchema>[] = graph.edges.map((edge) => {
    const label = edge.label?.trim();
    const base = { id: edge.id, source: edge.source, target: edge.target, type: edge.type };
    return label ? { ...base, label } : base;
  });

  const nodes = graph.root_node_id
    ? (() => {
        const expected = computeExpectedDepths({ ...graph, edges }, graph.root_node_id);
        return graph.nodes.map((node) => {
          const depth = expected.get(node.id);
          return depth === undefined || depth === node.depth ? node : { ...node, depth };
        });
      })()
    : graph.nodes;

  return { ...graph, nodes, edges };
}

export const aiGeneratedGraphSchema = aiCanvasGraphShape
  .transform(normalizeAiGraph)
  .superRefine((graph, ctx) => {
    addCompleteGraphIssues(graph, ctx);
    if (graph.nodes.length > AI_GRAPH_NODE_LIMIT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nodes'],
        message: `AI output is limited to ${AI_GRAPH_NODE_LIMIT} nodes`,
      });
    }
    if (graph.nodes.some((node) => node.origin !== 'ai')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nodes'],
        message: 'Initial AI output must use origin=ai',
      });
    }
    if (Object.keys(graph.layout_cache).length !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['layout_cache'],
        message: 'AI must not produce layout coordinates',
      });
    }
  });

export const visualGraphPatchSchema = z
  .object({
    proposal_id: z.string().uuid(),
    canvas_id: z.string().uuid(),
    base_version: z.number().int().min(1),
    kind: z.enum(['expansion', 'alternative']),
    anchor_node_id: graphLocalIdSchema,
    summary: z.string().trim().min(1).max(240),
    nodes: z.array(visualGraphNodeSchema).min(1).max(10),
    edges: z.array(visualGraphEdgeSchema).min(1).max(30),
    expires_at: z.string().datetime(),
  })
  .strict();

export const memoryNodeMatchSchema = z
  .object({
    student_node_id: graphLocalIdSchema,
    reference_node_id: graphLocalIdSchema,
    method: z.enum(['normalized_title', 'embedding']),
  })
  .strict();

export const memoryMissingNodeSchema = z
  .object({
    reference_node: visualGraphNodeSchema,
    suggested_parent_student_node_id: graphLocalIdSchema.optional(),
  })
  .strict();

export const memoryWrongEdgeSchema = z
  .object({
    student_edge_id: graphLocalIdSchema,
    reason: z.enum(['wrong_relation', 'reversed_direction', 'unsupported_connection']),
    expected_type: visualEdgeTypeSchema.optional(),
  })
  .strict();

export const memoryGraphDiffSchema = z
  .object({
    check_id: z.string().uuid(),
    canvas_id: z.string().uuid(),
    matching_mode: z.enum(['embeddings', 'normalized_title_fallback']),
    matched_nodes: z.array(memoryNodeMatchSchema),
    missing_nodes: z.array(memoryMissingNodeSchema),
    extra_student_node_ids: z.array(graphLocalIdSchema),
    correct_edges: z.array(
      z
        .object({
          student_edge_id: graphLocalIdSchema,
          reference_edge_id: graphLocalIdSchema,
        })
        .strict(),
    ),
    missing_edges: z.array(
      z
        .object({
          reference_edge: visualGraphEdgeSchema,
          source_student_node_id: graphLocalIdSchema.optional(),
          target_student_node_id: graphLocalIdSchema.optional(),
        })
        .strict(),
    ),
    wrong_edges: z.array(memoryWrongEdgeSchema),
    evidence_lines: z.array(z.string().trim().min(1).max(240)).min(1).max(4),
    created_at: z.string().datetime(),
  })
  .strict();

export const visualQuizQuestionPrivateSchema = z
  .object({
    id: z.string().uuid(),
    prompt: z.string().trim().min(1).max(500),
    options: z
      .array(
        z
          .object({
            key: z.enum(['a', 'b', 'c', 'd']),
            label: z.string().trim().min(1).max(240),
          })
          .strict(),
      )
      .length(4),
    correct_key: z.enum(['a', 'b', 'c', 'd']),
    feedback: z.string().trim().min(1).max(500),
  })
  .strict();

export const visualQuizPublicSchema = z
  .object({
    quiz_id: z.string().uuid(),
    canvas_id: z.string().uuid(),
    node_id: graphLocalIdSchema,
    questions: z
      .array(
        visualQuizQuestionPrivateSchema.omit({
          correct_key: true,
          feedback: true,
        }),
      )
      .min(2)
      .max(3),
    expires_at: z.string().datetime(),
  })
  .strict();

export const visualSseEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('queued'),
      sequence: z.number().int().positive(),
      job_id: z.string(),
      operation: z.enum(['generate', 'expand', 'alternative', 'check_memory', 'node_quiz']),
    })
    .strict(),
  z
    .object({
      type: z.literal('started'),
      sequence: z.number().int().positive(),
      job_id: z.string(),
      estimated_nodes: z.number().int().min(0).max(AI_GRAPH_NODE_LIMIT).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('node_batch'),
      sequence: z.number().int().positive(),
      nodes: z.array(visualGraphNodeSchema).min(1).max(8),
      received: z.number().int().min(1),
      total: z.number().int().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('edge_batch'),
      sequence: z.number().int().positive(),
      edges: z.array(visualGraphEdgeSchema).min(1).max(16),
      received: z.number().int().min(1),
      total: z.number().int().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('graph_ready'),
      sequence: z.number().int().positive(),
      canvas_id: z.string().uuid(),
      graph: completeCanvasGraphSchema,
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal('patch_proposal_ready'),
      sequence: z.number().int().positive(),
      proposal: visualGraphPatchSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('memory_diff_ready'),
      sequence: z.number().int().positive(),
      diff: memoryGraphDiffSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('quiz_ready'),
      sequence: z.number().int().positive(),
      quiz: visualQuizPublicSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('limit_reached'),
      sequence: z.number().int().positive(),
      scope: z.string(),
      limit: z.number().int().positive(),
      used: z.number().int().nonnegative(),
      remaining: z.literal(0),
      resets_at: z.string().datetime(),
    })
    .strict(),
  z
    .object({
      type: z.literal('error'),
      sequence: z.number().int().positive(),
      code: z.string(),
      message: z.string(),
      retryable: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('done'),
      sequence: z.number().int().positive(),
      job_id: z.string(),
    })
    .strict(),
]);

export type VisualArchetype = z.infer<typeof visualArchetypeSchema>;
export type VisualGraphNode = z.infer<typeof visualGraphNodeSchema>;
export type VisualGraphEdge = z.infer<typeof visualGraphEdgeSchema>;
export type CanvasGraph = z.infer<typeof canvasGraphSchema>;
export type CompleteCanvasGraph = z.infer<typeof completeCanvasGraphSchema>;
export type VisualGraphPatch = z.infer<typeof visualGraphPatchSchema>;
export type MemoryGraphDiff = z.infer<typeof memoryGraphDiffSchema>;
export type VisualSseEvent = z.infer<typeof visualSseEventSchema>;

// ── Transport schemas ────────────────────────────────────────────────────────

export const visualQuotaScopeStateSchema = z
  .object({
    limit: z.number().int().positive(),
    used: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    resets_at: z.string().datetime(),
  })
  .strict();

export const visualQuotaResponseSchema = z
  .object({
    scopes: z.record(z.string(), visualQuotaScopeStateSchema),
  })
  .strict();

export const visualProposalInputSchema = z
  .object({
    mode: z.enum(['prompt', 'source', 'topic', 'session']),
    prompt: z.string().trim().min(1).max(2000).optional(),
    source_id: z.string().uuid().optional(),
    topic_id: z.string().uuid().optional(),
    session_id: z.string().uuid().optional(),
    preferred_archetype: visualArchetypeSchema.optional(),
    decline_retry_token: z.string().optional(),
    client_request_id: z.string().uuid(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.mode === 'prompt' && !input.prompt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['prompt'], message: 'Required for prompt mode' });
    }
    if (input.mode === 'source' && !input.source_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['source_id'], message: 'Required for source mode' });
    }
    if (input.mode === 'topic' && !input.topic_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['topic_id'], message: 'Required for topic mode' });
    }
    if (input.mode === 'session' && !input.session_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['session_id'], message: 'Required for session mode' });
    }
  });

export const visualProposalResponseSchema = z
  .object({
    proposal_id: z.string().uuid(),
    title: z.string(),
    archetype: visualArchetypeSchema,
    estimated_nodes: z.object({ min: z.number().int().min(0), max: z.number().int().min(0) }).strict(),
    rationale: z.string(),
    source_label: z.string().optional(),
    expires_at: z.string().datetime(),
    quota: visualQuotaResponseSchema,
  })
  .strict();

export const visualGenerateInputSchema = z
  .object({
    proposal_id: z.string().uuid(),
    archetype_override: visualArchetypeSchema.optional(),
    client_request_id: z.string().uuid(),
  })
  .strict();

export const visualExpandInputSchema = z
  .object({
    canvas_id: z.string().uuid(),
    node_id: graphLocalIdSchema,
    client_request_id: z.string().uuid(),
  })
  .strict();

export const visualAlternativeInputSchema = visualExpandInputSchema;

export const visualMemoryCheckInputSchema = z
  .object({
    canvas_id: z.string().uuid(),
    canvas_version: z.number().int().min(1),
    client_request_id: z.string().uuid(),
  })
  .strict();

export const visualNodeQuizInputSchema = visualExpandInputSchema;

export const visualQuizSubmitInputSchema = z
  .object({
    answers: z.array(
      z
        .object({
          question_id: z.string().uuid(),
          choice_key: z.enum(['a', 'b', 'c', 'd']),
        })
        .strict(),
    ),
    client_mutation_id: z.string().uuid(),
  })
  .strict();

export const visualQuizSubmitResponseSchema = z
  .object({
    results: z.array(
      z
        .object({
          question_id: z.string().uuid(),
          correct: z.boolean(),
          feedback: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export const visualJobAcceptedSchema = z
  .object({
    job_id: z.string(),
    stream_url: z.string(),
    canvas_id: z.string().uuid().optional(),
  })
  .strict();

export const visualJobEventsQuerySchema = z
  .object({
    after: z.coerce.number().int().nonnegative().optional(),
  })
  .strict();

export const visualCanvasCreateInputSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    archetype: visualArchetypeSchema,
    origin: z.literal('memory'),
    topic_id: z.string().uuid(),
    graph: canvasGraphSchema,
    client_mutation_id: z.string().uuid(),
  })
  .strict();

export const visualCanvasListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().datetime().optional(),
    source_id: z.string().uuid().optional(),
    topic_id: z.string().uuid().optional(),
  })
  .strict();

export const visualCanvasPatchInputSchema = z
  .object({
    base_version: z.number().int().min(1),
    title: z.string().trim().min(1).max(200),
    archetype: visualArchetypeSchema,
    graph: canvasGraphSchema,
    client_mutation_id: z.string().uuid(),
  })
  .strict();

export const visualCanvasDeleteHeadersSchema = z
  .object({
    'if-match': z.coerce.number().int().min(1),
  })
  .strict();

export const visualCanvasDtoSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    archetype: visualArchetypeSchema,
    graph: canvasGraphSchema,
    schema_version: z.number().int(),
    origin: z.enum(['prompt', 'library_source', 'learn_topic', 'learn_session', 'memory', 'legacy']),
    source_id: z.string().uuid().nullable(),
    topic_id: z.string().uuid().nullable(),
    source_session_id: z.string().uuid().nullable(),
    version: z.number().int().positive(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();

export const visualCanvasSummarySchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    archetype: visualArchetypeSchema,
    origin: visualCanvasDtoSchema.shape.origin,
    node_count: z.number().int().nonnegative(),
    from_label: z.string().nullable(),
    updated_at: z.string().datetime(),
  })
  .strict();

export const visualCanvasListResponseSchema = z
  .object({
    items: z.array(visualCanvasSummarySchema),
    next_cursor: z.string().datetime().nullable(),
  })
  .strict();

export const visualCanvasPatchResponseSchema = z
  .object({
    canvas: visualCanvasDtoSchema,
    conflict_resolved: z.enum(['last_write_wins']).nullable(),
  })
  .strict();

export const visualRevisionListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(20).default(20),
  })
  .strict();

export const visualRevisionSummarySchema = z
  .object({
    id: z.string().uuid(),
    revision_number: z.number().int().positive(),
    reason: z.enum(['created', 'autosave', 'ai_patch', 'restore', 'migration']),
    created_at: z.string().datetime(),
    title: z.string(),
    archetype: visualArchetypeSchema,
  })
  .strict();

export const visualRevisionListResponseSchema = z
  .object({
    items: z.array(visualRevisionSummarySchema),
  })
  .strict();

export const visualRevisionRestoreInputSchema = z
  .object({
    base_version: z.number().int().min(1),
    client_mutation_id: z.string().uuid(),
  })
  .strict();

export const visualApplyProposalInputSchema = z
  .object({
    proposal_id: z.string().uuid(),
    base_version: z.number().int().min(1),
    client_mutation_id: z.string().uuid(),
  })
  .strict();

export const visualRevisionQueueEnqueueShakySchema = z
  .object({
    action: z.literal('enqueue_shaky'),
    node_ids: z.array(graphLocalIdSchema).min(1),
    client_mutation_id: z.string().uuid(),
  })
  .strict();

export const visualRevisionQueueResolveSchema = z
  .object({
    action: z.literal('resolve'),
    node_ids: z.array(graphLocalIdSchema).min(1),
    client_mutation_id: z.string().uuid(),
  })
  .strict();

export const visualRevisionQueueEnqueueMemoryMissingSchema = z
  .object({
    action: z.literal('enqueue_memory_missing'),
    check_id: z.string().uuid(),
    reference_node_ids: z.array(graphLocalIdSchema).min(1),
    client_mutation_id: z.string().uuid(),
  })
  .strict();

export const visualRevisionQueueInputSchema = z.discriminatedUnion('action', [
  visualRevisionQueueEnqueueShakySchema,
  visualRevisionQueueResolveSchema,
  visualRevisionQueueEnqueueMemoryMissingSchema,
]);

export const visualRevisionQueueResponseSchema = z
  .object({
    queued: z.boolean(),
    manual_reason_count: z.number().int().nonnegative(),
  })
  .strict();

export const visualMemoryTopicSchema = z
  .object({
    topic_id: z.string().uuid(),
    topic_key: z.string(),
    title: z.string(),
    subject_label: z.string(),
    last_touched: z.string().datetime(),
  })
  .strict();

export const visualMemoryTopicsResponseSchema = z
  .object({
    topics: z.array(visualMemoryTopicSchema),
  })
  .strict();

export const visualLegacyLookupSuccessSchema = z
  .object({
    canvas_id: z.string().uuid(),
  })
  .strict();

export const visualLegacyLookupRebuildSchema = z
  .object({
    code: z.literal('VISUAL_LEGACY_REBUILD_REQUIRED'),
    message: z.string(),
  })
  .strict();

export const visualLegacyLookupResponseSchema = z.union([
  visualLegacyLookupSuccessSchema,
  visualLegacyLookupRebuildSchema,
]);

export type VisualProposalInput = z.infer<typeof visualProposalInputSchema>;
export type VisualProposalResponse = z.infer<typeof visualProposalResponseSchema>;
export type VisualGenerateInput = z.infer<typeof visualGenerateInputSchema>;
export type VisualExpandInput = z.infer<typeof visualExpandInputSchema>;
export type VisualAlternativeInput = z.infer<typeof visualAlternativeInputSchema>;
export type VisualMemoryCheckInput = z.infer<typeof visualMemoryCheckInputSchema>;
export type VisualNodeQuizInput = z.infer<typeof visualNodeQuizInputSchema>;
export type VisualQuizSubmitInput = z.infer<typeof visualQuizSubmitInputSchema>;
export type VisualQuizSubmitResponse = z.infer<typeof visualQuizSubmitResponseSchema>;
export type VisualApplyProposalInput = z.infer<typeof visualApplyProposalInputSchema>;
export type VisualJobAccepted = z.infer<typeof visualJobAcceptedSchema>;
export type VisualCanvasDto = z.infer<typeof visualCanvasDtoSchema>;
export type VisualCanvasSummary = z.infer<typeof visualCanvasSummarySchema>;
export type VisualQuotaResponse = z.infer<typeof visualQuotaResponseSchema>;
export type VisualCanvasCreateInput = z.infer<typeof visualCanvasCreateInputSchema>;
export type VisualCanvasPatchInput = z.infer<typeof visualCanvasPatchInputSchema>;
export type VisualCanvasPatchResponse = z.infer<typeof visualCanvasPatchResponseSchema>;
export type VisualCanvasListResponse = z.infer<typeof visualCanvasListResponseSchema>;
export type VisualRevisionListResponse = z.infer<typeof visualRevisionListResponseSchema>;
export type VisualRevisionQueueInput = z.infer<typeof visualRevisionQueueInputSchema>;
export type VisualRevisionQueueResponse = z.infer<typeof visualRevisionQueueResponseSchema>;
export type VisualMemoryTopicsResponse = z.infer<typeof visualMemoryTopicsResponseSchema>;
export type VisualLegacyLookupResponse = z.infer<typeof visualLegacyLookupResponseSchema>;
