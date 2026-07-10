import { randomUUID } from 'node:crypto';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import {
  completeCanvasGraphSchema,
  conceptMapContentSchema,
  legacyGraphSpecSchema,
  GRAPH_SCHEMA_VERSION,
  type CompleteCanvasGraph,
  type VisualArchetype,
  type VisualEdgeType,
  type VisualGraphEdge,
  type VisualGraphNode,
} from '@edrion/schemas';
import type { Database } from '../client';
import * as schema from '../schema/index';

type LegacyArtifactRow = {
  id: string;
  institutionId: string | null;
  studentId: string | null;
  independentUserId: string | null;
  itemId: string | null;
  kind: string;
  title: string;
  content: unknown;
  fromLabel: string;
};

type PageRow = { id: string; pageIndex: number };

export type VisualCanvasesV1Report = {
  scanned: number;
  migrated: number;
  skippedInvalid: number;
  skippedOrphanEdges: number;
};

function toLocalId(raw: string, index: number, used: Set<string>): string {
  let candidate = raw.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  if (!/^[A-Za-z0-9_-]+$/.test(candidate) || !candidate) {
    candidate = `n_${index}`;
  }
  let suffix = 0;
  let unique = candidate;
  while (used.has(unique)) {
    suffix += 1;
    unique = `${candidate.slice(0, 58)}_${suffix}`;
  }
  used.add(unique);
  return unique;
}

function parsePageRef(
  sourceLocation: string | undefined,
  itemId: string | null,
  pages: PageRow[],
): VisualGraphNode['source_ref'] {
  if (!itemId || !sourceLocation) return undefined;
  const match = sourceLocation.match(/p\.?\s*(\d+)/i);
  if (!match) return undefined;
  const pageIndex = Number(match[1]) - 1;
  if (!Number.isFinite(pageIndex) || pageIndex < 0) return undefined;
  const page = pages.find((p) => p.pageIndex === pageIndex);
  return {
    kind: 'library_page',
    item_id: itemId,
    page_index: pageIndex,
    ...(page ? { page_id: page.id } : {}),
  };
}

function pickRoot(
  nodeIds: string[],
  archetype: VisualArchetype,
  edges: Array<{ source: string; target: string; type: VisualEdgeType }>,
): string | null {
  if (!nodeIds.length) return null;
  const first = nodeIds[0]!;
  if (archetype === 'mind_map') {
    const outgoingPartOf = new Set(
      edges.filter((e) => e.type === 'part_of').map((e) => e.source),
    );
    const candidates = nodeIds.filter((id) => !outgoingPartOf.has(id));
    return candidates[0] ?? first;
  }
  const incomingLeadsTo = new Set(
    edges.filter((e) => e.type === 'leads_to').map((e) => e.target),
  );
  const candidates = nodeIds.filter((id) => !incomingLeadsTo.has(id));
  return candidates[0] ?? first;
}

function computeDepths(rootId: string, edges: VisualGraphEdge[]): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adj.get(edge.source) ?? [];
    list.push(edge.target);
    adj.set(edge.source, list);
  }
  const depths = new Map<string, number>();
  const queue: string[] = [rootId];
  depths.set(rootId, 0);
  while (queue.length) {
    const current = queue.shift()!;
    const depth = depths.get(current) ?? 0;
    for (const next of adj.get(current) ?? []) {
      if (!depths.has(next)) {
        depths.set(next, depth + 1);
        queue.push(next);
      }
    }
  }
  return depths;
}

function convertConceptMap(
  content: ReturnType<typeof conceptMapContentSchema.parse>,
  itemId: string | null,
  pages: PageRow[],
): { graph: CompleteCanvasGraph | null; droppedEdges: number } {
  const archetype: VisualArchetype = content.layout === 'flowchart' ? 'flowchart' : 'mind_map';
  const usedIds = new Set<string>();
  const idMap = new Map<string, string>();
  const nodes: VisualGraphNode[] = content.nodes.map((node, index) => {
    const id = toLocalId(node.id, index, usedIds);
    idMap.set(node.id, id);
    return {
      id,
      type: 'concept',
      title: node.label,
      body: node.miniDefinition,
      depth: 0,
      collapsed: false,
      status: 'normal',
      origin: 'ai',
      source_ref: parsePageRef(node.sourceLocation, itemId, pages),
    };
  });

  let droppedEdges = 0;
  const edges: VisualGraphEdge[] = [];
  content.edges.forEach((edge, index) => {
    const source = idMap.get(edge.from);
    const target = idMap.get(edge.to);
    if (!source || !target) {
      droppedEdges += 1;
      return;
    }
    const type: VisualEdgeType =
      edge.relation === 'depends_on'
        ? 'requires'
        : edge.relation === 'step'
          ? 'leads_to'
          : 'part_of';
    edges.push({
      id: `e_${index}`,
      source,
      target,
      type,
    });
  });

  if (nodes.length < 2) return { graph: null, droppedEdges };

  const rootId = pickRoot(
    nodes.map((n) => n.id),
    archetype,
    edges,
  );
  if (!rootId) return { graph: null, droppedEdges };

  const depths = computeDepths(rootId, edges);
  for (const node of nodes) {
    node.depth = depths.get(node.id) ?? (node.id === rootId ? 0 : 1);
  }

  const graph: CompleteCanvasGraph = {
    graph_schema_version: GRAPH_SCHEMA_VERSION,
    title: content.title,
    archetype,
    root_node_id: rootId,
    nodes,
    edges,
    layout_cache: {},
  };

  const parsed = completeCanvasGraphSchema.safeParse(graph);
  return parsed.success ? { graph: parsed.data, droppedEdges } : { graph: null, droppedEdges };
}

function convertVisualSpec(
  content: ReturnType<typeof legacyGraphSpecSchema.parse>,
  title: string,
): { graph: CompleteCanvasGraph | null; droppedEdges: number } {
  const archetype: VisualArchetype =
    content.layout === 'mind_map' ? 'mind_map' : 'flowchart';
  const usedIds = new Set<string>();
  const idMap = new Map<string, string>();
  const nodes: VisualGraphNode[] = content.nodes.map((node, index) => {
    const id = toLocalId(node.id, index, usedIds);
    idMap.set(node.id, id);
    return {
      id,
      type: 'concept',
      title: node.label,
      body: node.detail ?? '',
      depth: 0,
      collapsed: false,
      status: 'normal',
      origin: 'ai',
      source_ref: undefined,
    };
  });

  let droppedEdges = 0;
  const edges: VisualGraphEdge[] = [];
  content.edges.forEach((edge, index) => {
    const source = idMap.get(edge.from);
    const target = idMap.get(edge.to);
    if (!source || !target) {
      droppedEdges += 1;
      return;
    }
    if (content.layout === 'mind_map') {
      edges.push({
        id: `e_${index}`,
        source: target,
        target: source,
        type: 'part_of',
      });
    } else {
      edges.push({
        id: `e_${index}`,
        source,
        target,
        type: 'leads_to',
      });
    }
  });

  if (nodes.length < 2) return { graph: null, droppedEdges };

  const rootId = pickRoot(
    nodes.map((n) => n.id),
    archetype,
    edges,
  );
  if (!rootId) return { graph: null, droppedEdges };

  const depths = computeDepths(rootId, edges);
  for (const node of nodes) {
    node.depth = depths.get(node.id) ?? (node.id === rootId ? 0 : 1);
  }

  const graph: CompleteCanvasGraph = {
    graph_schema_version: GRAPH_SCHEMA_VERSION,
    title,
    archetype,
    root_node_id: rootId,
    nodes,
    edges,
    layout_cache: {},
  };

  const parsed = completeCanvasGraphSchema.safeParse(graph);
  return parsed.success ? { graph: parsed.data, droppedEdges } : { graph: null, droppedEdges };
}

function convertArtifact(
  artifact: LegacyArtifactRow,
  pages: PageRow[],
): { graph: CompleteCanvasGraph | null; droppedEdges: number } {
  if (artifact.kind === 'concept_map') {
    const parsed = conceptMapContentSchema.safeParse(artifact.content);
    if (!parsed.success) return { graph: null, droppedEdges: 0 };
    return convertConceptMap(parsed.data, artifact.itemId, pages);
  }
  if (artifact.kind === 'visual') {
    const parsed = legacyGraphSpecSchema.safeParse(artifact.content);
    if (!parsed.success) return { graph: null, droppedEdges: 0 };
    return convertVisualSpec(parsed.data, artifact.title);
  }
  return { graph: null, droppedEdges: 0 };
}

export async function runVisualCanvasesV1Backfill(db: Database): Promise<VisualCanvasesV1Report> {
  const report: VisualCanvasesV1Report = {
    scanned: 0,
    migrated: 0,
    skippedInvalid: 0,
    skippedOrphanEdges: 0,
  };

  const mappedRows = await db
    .select({ legacyArtifactId: schema.visualCanvases.legacyArtifactId })
    .from(schema.visualCanvases)
    .where(sql`${schema.visualCanvases.legacyArtifactId} IS NOT NULL`);
  const mappedIds = mappedRows
    .map((r) => r.legacyArtifactId)
    .filter((id): id is string => id != null);

  const conditions = [
    inArray(schema.knowledgeArtifacts.kind, ['concept_map', 'visual']),
    ...(mappedIds.length ? [notInArray(schema.knowledgeArtifacts.id, mappedIds)] : []),
  ];

  const artifacts = await db
    .select({
      id: schema.knowledgeArtifacts.id,
      institutionId: schema.knowledgeArtifacts.institutionId,
      studentId: schema.knowledgeArtifacts.studentId,
      independentUserId: schema.knowledgeArtifacts.independentUserId,
      itemId: schema.knowledgeArtifacts.itemId,
      kind: schema.knowledgeArtifacts.kind,
      title: schema.knowledgeArtifacts.title,
      content: schema.knowledgeArtifacts.content,
      fromLabel: schema.knowledgeArtifacts.fromLabel,
    })
    .from(schema.knowledgeArtifacts)
    .where(and(...conditions));

  report.scanned = artifacts.length;

  for (const artifact of artifacts) {
    const pages = artifact.itemId
      ? await db
          .select({
            id: schema.knowledgeItemPages.id,
            pageIndex: schema.knowledgeItemPages.pageIndex,
          })
          .from(schema.knowledgeItemPages)
          .where(eq(schema.knowledgeItemPages.itemId, artifact.itemId))
      : [];

    const { graph, droppedEdges } = convertArtifact(artifact, pages);
    report.skippedOrphanEdges += droppedEdges;

    if (!graph) {
      report.skippedInvalid += 1;
      continue;
    }

    const canvasId = randomUUID();
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.visualCanvases)
        .values({
          id: canvasId,
          institutionId: artifact.institutionId,
          studentId: artifact.studentId,
          independentUserId: artifact.independentUserId,
          title: graph.title,
          archetype: graph.archetype,
          graph,
          schemaVersion: GRAPH_SCHEMA_VERSION,
          origin: 'legacy',
          sourceId: artifact.itemId,
          topicId: null,
          sourceSessionId: null,
          legacyArtifactId: artifact.id,
          version: 1,
        })
        .returning();

      await tx.insert(schema.visualCanvasRevisions).values({
        canvasId: created!.id,
        revisionNumber: 1,
        graph,
        schemaVersion: GRAPH_SCHEMA_VERSION,
        title: graph.title,
        archetype: graph.archetype,
        reason: 'migration',
        createdBy: 'system',
      });
    });

    report.migrated += 1;
  }

  return report;
}
