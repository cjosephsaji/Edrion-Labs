import type {
  M4Evaluation,
  M4Response,
  SharedCanvasState,
  TeachingManifest,
} from '@edrion/schemas';
import type { M4Publication } from './petros-v2-contracts.server';

/** Constructed inside the session owner's current-authority transaction; never a client DTO.
 * Deliberately excludes private checker values, rubrics, discriminators and raw student identity from model input. */
export type PetrosTeachingContext = {
  institutionId: string;
  studentId: string;
  sessionId: string;
  objectiveId: string;
  publication: M4Publication;
  publicationHash: string;
  epoch: number;
  canvas: SharedCanvasState | null;
  manifest: TeachingManifest;
  authority: { source: boolean; review: boolean; scope: boolean; currentEpoch: boolean };
  evidence: Array<{
    evaluation: M4Evaluation;
    assisted: boolean;
    repeated: boolean;
    equivalenceKey: string;
    committed: boolean;
  }>;
  capabilities: string[];
  accessibility: { textAlternative: boolean; reducedMotion: boolean };
  budget: { remainingDecisions: number; deadline: number; providerAuthorized: boolean };
  independentTaskOpen: boolean;
  selectedTarget: string | null;
  requestedStrategy?: 'bounded_experiment' | 'participation';
  requestedCapability?: string;
  committedResponse?: M4Response;
};
export function validatePrerequisites(manifest: TeachingManifest) {
  const edges = manifest.prerequisites,
    visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error('M5_CYCLIC_PREREQUISITES');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const e of edges.filter((e) => e.from === id)) visit(e.to);
    visiting.delete(id);
    visited.add(id);
  }
  for (const e of edges) {
    if (e.from === e.to) throw new Error('M5_SELF_PREREQUISITE');
    visit(e.from);
  }
}
