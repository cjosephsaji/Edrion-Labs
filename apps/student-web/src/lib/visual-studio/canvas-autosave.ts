import type { VisualCanvasPatchInput } from '@edrion/schemas';
import type { CanvasSaveStatus } from './canvas-store';
import { clearDraft, clearQueuedSave, queueSave, writeDraft, type DraftRecord } from './canvas-offline-queue';

const DEBOUNCE_MS = 2_000;
const MAX_WAIT_MS = 10_000;
const LOCAL_DRAFT_MS = 300;

export type AutosavePayload = {
  canvasId: string;
  title: string;
  archetype: VisualCanvasPatchInput['archetype'];
  graph: VisualCanvasPatchInput['graph'];
  baseVersion: number;
  clientMutationId: string;
};

export type AutosaveCallbacks = {
  patch: (payload: VisualCanvasPatchInput) => Promise<{ conflict_resolved: 'last_write_wins' | null }>;
  onStatus?: (status: CanvasSaveStatus) => void;
  onSaved?: (version: number) => void;
  onConflict?: () => void;
};

export class CanvasAutosave {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private localDraftTimer: ReturnType<typeof setTimeout> | null = null;
  private firstEditAt: number | null = null;
  private pending: AutosavePayload | null = null;
  private disposed = false;

  constructor(private readonly callbacks: AutosaveCallbacks) {}

  schedule(payload: AutosavePayload) {
    if (this.disposed) return;
    this.pending = payload;
    this.scheduleLocalDraft(payload);
    if (!this.firstEditAt) this.firstEditAt = Date.now();

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.flush(), DEBOUNCE_MS);

    if (!this.maxWaitTimer) {
      this.maxWaitTimer = setTimeout(() => void this.flush(), MAX_WAIT_MS);
    }
  }

  async flush() {
    if (this.disposed || !this.pending) return;
    if (!navigator.onLine) {
      await queueSave(this.pending.canvasId, {
        kind: 'patch',
        canvasId: this.pending.canvasId,
        payload: {
          base_version: this.pending.baseVersion,
          title: this.pending.title,
          archetype: this.pending.archetype,
          graph: this.pending.graph,
          client_mutation_id: this.pending.clientMutationId,
        },
      });
      this.callbacks.onStatus?.('offline');
      return;
    }

    this.callbacks.onStatus?.('saving');
    try {
      const result = await this.callbacks.patch({
        base_version: this.pending.baseVersion,
        title: this.pending.title,
        archetype: this.pending.archetype,
        graph: this.pending.graph,
        client_mutation_id: this.pending.clientMutationId,
      });
      await clearDraft(this.pending.canvasId);
      await clearQueuedSave(this.pending.canvasId);
      this.callbacks.onSaved?.(this.pending.baseVersion + 1);
      this.callbacks.onStatus?.('saved');
      if (result.conflict_resolved === 'last_write_wins') this.callbacks.onConflict?.();
      this.resetTimers();
      this.pending = null;
      this.firstEditAt = null;
    } catch {
      this.callbacks.onStatus?.('error');
    }
  }

  dispose() {
    this.disposed = true;
    this.resetTimers();
    if (this.localDraftTimer) clearTimeout(this.localDraftTimer);
  }

  private scheduleLocalDraft(payload: AutosavePayload) {
    if (this.localDraftTimer) clearTimeout(this.localDraftTimer);
    this.localDraftTimer = setTimeout(() => {
      const record: DraftRecord = {
        canvasId: payload.canvasId,
        title: payload.title,
        archetype: payload.archetype,
        graph: payload.graph,
        serverVersion: payload.baseVersion,
        updatedAt: new Date().toISOString(),
      };
      void writeDraft(record);
    }, LOCAL_DRAFT_MS);
  }

  private resetTimers() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
    this.debounceTimer = null;
    this.maxWaitTimer = null;
  }
}
