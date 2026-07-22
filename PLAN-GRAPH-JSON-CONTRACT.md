# Frozen CanvasGraph v1 Contract

Status: **FROZEN (Tier 2)**. Owner: Graph Pipeline. Consumers: Lab Canvas, Edrion Learn visual-spawn, Library “Study this”, and Tier 3 Debate clash maps.

This document is the self-contained wire/storage contract for `visual_canvases.graph`. It reconciles Graph Hyperspec §A with the already-deployed schema in `packages/schemas/src/student/visuals.ts`. The deployed shape wins: consumers must not translate it into the hyperspec’s alternate `schema_version/nodes[].label/edges[].from` dialect.

## 1. Compatibility rules

- The canonical version field is `graph_schema_version: 1`. The table mirror remains `visual_canvases.schema_version = 1`.
- The canonical archetype spellings are `mind_map`, `flowchart`, `cycle`, `timeline`, `hierarchy`, `comparison`. They must exactly match the database CHECK.
- The root object and nested objects are strict. The additions frozen below (`groups`, `group_id`, `event_date`, `color_token`, `pinned`) are optional/defaulted so existing v1 documents remain valid. They do not justify a v2 bump.
- A breaking rename, deletion, semantic reinterpretation, or new required field requires `graph_schema_version: 2` and a registered forward migration. A new optional field does not.
- Storage validation accepts up to 200 nodes and 600 edges for compatibility with existing edited canvases. AI generation and the three consumer methods apply the tighter budgets in §7.
- Graph JSON contains semantic structure and regenerable layout cache only. An LLM never emits layout coordinates. User pins are accepted only by edit endpoints.

## 2. Exact Zod-equivalent shape

```ts
type CanvasGraphV1 = {
  graph_schema_version: 1;
  title: string;                    // trimmed, 1..200 chars
  archetype: VisualArchetype;
  root_node_id: LocalId | null;
  nodes: VisualNodeV1[];            // <= 200 storage; <= 60 generated
  edges: VisualEdgeV1[];            // <= 600 storage; <= 120 generated
  groups?: VisualGroupV1[];         // default []; <= 6 generated
  layout_cache: Partial<Record<VisualArchetype, LayoutSnapshotV1>>;
};

type LocalId = string;              // /^[A-Za-z0-9_-]{1,64}$/

type VisualArchetype =
  | 'mind_map'
  | 'flowchart'
  | 'cycle'
  | 'timeline'
  | 'hierarchy'
  | 'comparison';

type VisualNodeV1 = {
  id: LocalId;
  type:
    | 'concept'
    | 'process_step'
    | 'decision'
    | 'example'
    | 'question'
    | 'definition'
    | 'formula'
    | 'note';
  title: string;                    // trimmed, 1..160 chars
  body: string;                     // trimmed, 0..1500 chars
  depth: number;                    // integer 0..6
  collapsed: boolean;
  status: 'normal' | 'shaky' | 'resolved';
  origin: 'ai' | 'student' | 'ai_expansion' | 'alternative_path';
  source_ref?: VisualSourceRefV1;
  group_id?: LocalId | null;
  event_date?: string | null;       // ISO-8601 date/date-time; timeline use
  color_token?: SubjectAccentToken | null; // token, never arbitrary CSS/hex
  pinned?: { x: number; y: number } | null; // finite numbers; edit-only
};

type VisualEdgeV1 = {
  id: LocalId;
  source: LocalId;
  target: LocalId;
  type:
    | 'leads_to'
    | 'causes'
    | 'requires'
    | 'contrasts_with'
    | 'example_of'
    | 'part_of'
    | 'alternative_to'
    | 'clash';                     // reserved for Tier 3 Debate
  label?: string;                  // trimmed, 1..120 chars
};

type VisualGroupV1 = {
  id: LocalId;
  label: string;                   // trimmed, 1..80 chars, <= 6 words when generated
  color_token?: SubjectAccentToken | null;
};

type VisualSourceRefV1 =
  | {
      kind: 'library_page';
      item_id: UUID;
      page_id?: UUID;
      page_index: number;           // integer >= 0
      quote?: string;               // trimmed, 1..500 chars
    }
  | {
      kind: 'learn_topic';
      topic_id: UUID;
      topic_key: string;            // trimmed, 1..200 chars
    }
  | {
      kind: 'learn_session_block';
      session_id: UUID;
      block_id?: UUID;
    };

type LayoutSnapshotV1 = {
  algorithm:
    | 'elk_radial'
    | 'elk_layered'
    | 'elk_mrtree'
    | 'custom_cycle'
    | 'custom_timeline'
    | 'custom_comparison';
  positions: Record<LocalId, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number }; // zoom 0.05..4
};
```

`SubjectAccentToken` is the exported closed set from the design-token package. It is validated by token name. A consumer must not persist `#rrggbb`, `rgb(...)`, Tailwind class names, or arbitrary CSS in graph JSON.

## 3. Groups

Groups are semantic comparison lanes, not React Flow parent nodes.

- Group IDs are graph-local and unique. Node `group_id` is null/absent or references exactly one `groups[].id`.
- Group order is array order and is stable input to comparison layout.
- Groups do not own nodes and deleting a group is illegal until its nodes are reassigned or cleared.
- Only `comparison` requires groups: exactly 2 or 3 groups. Other archetypes may store no groups; editors must not create them in v1.
- For comparison graphs, `concept`, `definition`, `example`, `formula`, `note`, and `question` nodes belong to a group unless they are deliberate shared attribute/header nodes. Shared attribute nodes are represented by `type='concept'`, `group_id=null`, and must connect with `contrasts_with` to nodes in at least two distinct groups.
- Tier 3 clash maps use two groups (the two sides). `clash` edges cross group boundaries; they never connect two nodes in the same group.

## 4. Universal validation

The shared validator in `packages/schemas/src/student/visuals.ts` is authoritative and must enforce all of these rules with stable error codes:

1. Node IDs, edge IDs, and group IDs are unique within their own namespaces.
2. `root_node_id` is null or references a node. Every edge source/target and every node group reference exists.
3. No self-edge. No duplicate semantic edge `(source,target,type)`; symmetric types (`contrasts_with`, `alternative_to`, and `clash`) canonicalize endpoint order for duplicate detection.
4. Every `layout_cache.*.positions` key references an extant node. Missing positions are permitted because layout is regenerable.
5. Every numeric coordinate is finite. Viewport zoom is 0.05..4.
6. `depth` is 0..6 and matches the expected traversal/tree depth calculated by the existing graph-rule helpers.
7. Node/edge kinds are legal for the selected archetype. `clash` is legal only for `comparison`.
8. A complete graph has at least two nodes and a non-null root. Draft/editor schemas may temporarily allow fewer nodes; generation success and committed revisions may not.
9. Generated node titles are additionally limited to 8 words and 60 characters; generated edge labels to 4 words. The broader storage limits preserve old/manual content.
10. Generation payloads must have `pinned` removed or normalized to null and `layout_cache={}` before validation. Only authenticated edit commands may introduce pins or layout cache.
11. Serialized graph size must be <= 400,000 bytes, matching `CANVAS_GRAPH_MAX_BYTES`.

## 5. Archetype rules

These rules extend, rather than replace, `collectVisualGraphIssues` and `computeExpectedDepths` in `packages/schemas/src/student/visual-graph-rules.ts`.

### `mind_map`

- `root_node_id` identifies the topic root at depth 0.
- Tree structure is expressed primarily with `part_of` (child source, parent target) or depth-consistent traversal edges already supported by the validator.
- Every non-root node has one layout parent; cross-links may use `requires`, `contrasts_with`, or `alternative_to` without changing tree depth.
- Maximum generated depth is 4; storage remains compatible through depth 6.

### `flowchart`

- Root is the first process/concept. `leads_to`, `causes`, and `alternative_to` are traversal edges.
- Traversal cycles are rejected. A `decision` should have two labeled outgoing paths (“Yes” and “No”); labels are presentation semantics because the deployed edge enum has no `yes/no` kinds.
- Non-decision nodes have at most one primary `leads_to` edge; annotation edges do not count.
- `example` and `note` are annotation-only nodes and may not become mandatory traversal bottlenecks.

### `cycle`

- 3..10 generated process/concept nodes form exactly one directed cycle using `leads_to` or `causes`.
- Every core node is in that cycle. Examples/notes may attach via `example_of` or `requires` and do not alter cycle membership.

### `timeline`

- Generated primary event nodes carry valid, non-null `event_date`; date order, not edge order, controls x-position.
- `leads_to`/`causes` may explain relationships but may not contradict ascending event order.
- Non-event explanatory nodes may use the deployed node kinds and attach to a dated event. Their `event_date` may be null.

### `hierarchy`

- Root at depth 0; every non-root node has exactly one parent via `part_of`.
- All nodes are reachable from root; no cycles or multiple parents.
- Generated depth <= 4. Cross-link edge types are rejected for committed hierarchy graphs.

### `comparison`

- Exactly 2 or 3 ordered groups and the group rules in §3.
- At least one comparable concept per group.
- A groupless shared attribute connects to nodes in at least two groups with `contrasts_with`.
- `clash` connects opposite-group argument nodes only. Normal comparisons need not use it.

## 6. Layout contract

- Semantic graph equality does not depend on `layout_cache`. A missing or stale cache is recomputed.
- Browser and server exports import the same Node-safe `packages/canvas-layout` implementation. Same graph, archetype, pins, and package version produce byte-identical positions.
- Algorithm mapping is frozen: mind map `elk_radial`; flowchart/hierarchy `elk_layered`/`elk_mrtree`; cycle `custom_cycle`; timeline `custom_timeline`; comparison `custom_comparison`.
- Pins are absolute user intent. ELK layouts pass them as fixed constraints; custom layouts apply pins after deterministic natural placement without changing semantic order.
- Layout cache is keyed by archetype because an editor may preview compatible views. On semantic graph edits, invalidate affected caches; on viewport-only edits, no semantic revision is necessary unless current repository policy deliberately versions view state.

## 7. Consumer budgets and provenance

| Consumer | Node budget | Canvas origin | Graph source reference | First revision reason |
|---|---:|---|---|---|
| Lab prompt/topic | 60 | `prompt` | optional `learn_topic` | `generation` |
| Library material | 60 | `library_source` | `library_page` | `generation` |
| Edrion Learn session | 20 | `learn_session` | `learn_session_block` | `spawn` |
| Direct Learn topic | 20 | `learn_topic` | `learn_topic` | `spawn` |
| Tier 3 Debate | 40 | `debate_clash` (forward CHECK addition) | reserved debate source metadata at canvas level | `clash_build` |

The deployed origin values `memory` and `legacy` remain valid for existing/system artifacts. The table’s `source_id`, `topic_id`, and `source_session_id` columns remain the indexed top-level provenance; node-level `source_ref` supplies citations. Debate’s table-level reference is an additive migration owned by Graph Pipeline once the real Tier 3 debate-round key is confirmed; v1 graph JSON is already ready through groups and `clash`.

## 8. Versioning and migration

- Current reader: parse current v1 directly. Future reader: inspect `graph_schema_version`, run every registered `vN_to_vN+1` step, then parse current schema.
- The chain registry is contiguous and refuses duplicate or missing steps in CI and at startup.
- Read migration is pure and does not persist. The BullMQ backfill persists the migrated latest canvas through the central revision gateway with reason `migration`; historical revisions retain their original version and migrate only when read.
- A migration must be deterministic, idempotent at its target version, bounded to <50ms for a 60-node graph in tests, and carry golden before/after fixtures.
- Unknown future versions fail closed with `UNSUPPORTED_GRAPH_VERSION`; malformed old graphs fail with a typed compatibility error and do not get overwritten.

## 9. Parity assertion

`visualArchetypeSchema.options`, the Drizzle-exported `VISUAL_ARCHETYPES`, and the live PostgreSQL `visual_canvases_archetype_check` literal set must be equal after sorting. API startup in production fails if they differ. A migration test also queries `pg_get_constraintdef` so a database change cannot drift from Zod unnoticed.

## 10. Contract acceptance

- Existing graph fixtures parse without rewriting and render with identical semantic structure.
- Fixtures reject dangling references, duplicates, self-edges, invalid group refs, invalid colors, non-finite positions, over-budget generated output, and illegal archetype structures.
- An Edrion Learn visual-spawn fixture and a two-group Debate clash fixture both parse using this one schema.
- Type-level tests prove `z.infer<typeof canvasGraphSchema>` is the exported `CanvasGraph` type.
- Database parity, migration-chain completeness, deterministic layout, generated-coordinate stripping, and serialized byte-cap tests are mandatory gates.
