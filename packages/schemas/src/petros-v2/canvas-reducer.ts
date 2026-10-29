import {
  canvasOperationSchema,
  sharedCanvasStateSchema,
  studentCanvasCommandSchema,
  type CanvasOperation,
  type SharedCanvasState,
} from './canvas';
import { teachingActionEnvelopeSchema } from './teaching-actions';
import { evaluateResourceCapacity, observeResourceAllocation } from './resource-capacity';
import {
  predictAllocation,
  executeAllocation,
  closeAllocationAttempt,
  explainAllocation,
  validateAllocationAttempts,
  reconcileAllocationRestore,
  type AllocationCommandContext,
} from './resource-experiment';
function allocationProvenance(
  state: SharedCanvasState,
  element: SharedCanvasState['elements'][number],
  index: number,
  context?: AllocationCommandContext,
) {
  return {
    commandId: context?.commandId ?? `fixture-${state.revision + 1}-${element.version}`,
    sessionId: context?.sessionId ?? 'public-fixture',
    at: context?.at ?? new Date(state.revision + 1).toISOString(),
    sourceRevisionId: context?.sourceRevisionId ?? 'public-fixture',
    sourceHash: context?.sourceHash ?? 'public-fixture',
    activityId: state.activityId,
    branchId: state.branchId,
    elementId: element.id,
    sourceId: element.sourceId,
    canvasRevision: state.revision + 1,
    operationIndex: index,
  };
}

export function initialSharedCanvas(
  activityId: string,
  branchId = 'fixture-practice',
): SharedCanvasState {
  return sharedCanvasStateSchema.parse({
    schemaVersion: 'petros.v2.canvas.v1',
    mode: 'public_fixture',
    activityId,
    branchId,
    revision: 0,
    draftRevision: 0,
    lastActionSequence: 0,
    elements: [],
    completedActionIds: [],
    highlightedIds: [],
    focusedId: null,
    invitation: null,
  });
}
export function validateSharedCanvas(raw: unknown): SharedCanvasState {
  const state = sharedCanvasStateSchema.parse(raw);
  const ids = new Set(state.elements.map((e) => e.id));
  if (
    ids.size !== state.elements.length ||
    new Set(state.completedActionIds).size !== state.completedActionIds.length
  )
    throw new Error('Duplicate stable ID');
  for (const e of state.elements)
    if (e.kind === 'edge') {
      if (
        e.from === e.to ||
        !state.elements.some((n) => n.id === e.from && n.kind === 'node') ||
        !state.elements.some((n) => n.id === e.to && n.kind === 'node')
      )
        throw new Error('Dangling diagram relationship');
    }
  if (
    state.highlightedIds.some((id) => !ids.has(id)) ||
    (state.focusedId && !ids.has(state.focusedId))
  )
    throw new Error('Unavailable presentation target');
  if (
    state.invitation?.editableIds.some(
      (id) => !state.elements.some((e) => e.id === id && e.editable),
    )
  )
    throw new Error('Invalid editable region');
  for (const e of state.elements) {
    if (e.kind === 'allocation') {
      validateAllocationAttempts(e.resource);
      if (
        e.resource.attempts?.some(
          (a) =>
            a.activityId !== state.activityId ||
            a.branchId !== state.branchId ||
            a.elementId !== e.id ||
            a.sourceId !== e.sourceId,
        )
      )
        throw new Error('M5_ATTEMPT_PIN_MISMATCH');
      const result = evaluateResourceCapacity(e.resource.model);
      if (e.resource.allocatedCount > result.capacity) throw new Error('M5_INVALID_ALLOCATION');
      for (const o of e.resource.observations) {
        const checked = observeResourceAllocation(
          e.resource.model,
          o.beforeCount,
          o.requestedCount,
        );
        if (Object.entries(checked).some(([key, value]) => o[key as keyof typeof o] !== value))
          throw new Error('M5_UNCHECKED_OBSERVATION');
      }
      const last = e.resource.observations.at(-1);
      if (last && last.allocatedCount !== e.resource.allocatedCount)
        throw new Error('M5_ALLOCATION_RECEIPT_MISMATCH');
    }
    if (e.parentId) {
      const seen = new Set([e.id]);
      let parent: string | null | undefined = e.parentId;
      while (parent) {
        if (seen.has(parent) || !ids.has(parent)) throw new Error('Invalid canvas group');
        seen.add(parent);
        parent = state.elements.find((p) => p.id === parent)?.parentId;
      }
    }
    if (
      e.kind === 'table' &&
      (e.rows.some((r) => r.length !== e.columns.length) ||
        e.editableCells.some((c) => !e.rows[c.row] || c.column >= e.columns.length))
    )
      throw new Error('Invalid table structure');
    if (
      e.kind === 'trace' &&
      (e.currentLine >= e.lines.length || new Set(e.lines.map((l) => l.id)).size !== e.lines.length)
    )
      throw new Error('Invalid finite trace');
    if (e.kind === 'graph' && e.points.some((p, i) => i > 0 && p.x <= e.points[i - 1]!.x))
      throw new Error('Graph x coordinates must increase');
  }
  return state;
}
function mutate(
  state: SharedCanvasState,
  operations: CanvasOperation[],
  student = false,
  context?: AllocationCommandContext,
) {
  const next = structuredClone(state);
  for (const [operationIndex, raw] of operations.entries()) {
    const op = canvasOperationSchema.parse(raw);
    if (op.type === 'add' || op.type === 'connect_elements') {
      if (next.elements.some((e) => e.id === op.element.id) || op.element.version !== 1)
        throw new Error('Duplicate or invalid element');
      if (op.type === 'connect_elements' && op.element.kind !== 'edge')
        throw new Error('Relationship required');
      const added = op.element;
      if (
        added.kind === 'edge' &&
        next.elements.some(
          (e) =>
            e.kind === 'edge' &&
            e.from === added.from &&
            e.to === added.to &&
            e.relation === added.relation,
        )
      )
        throw new Error(
          'That relationship already exists in this direction. Select it to edit, or choose a different relationship.',
        );
      next.elements.push(op.element);
    } else if (op.type === 'highlight') next.highlightedIds = op.ids;
    else if (op.type === 'focus_view') next.focusedId = op.id;
    else {
      const element = next.elements.find((e) => e.id === op.id);
      if (!element || element.version !== op.expectedVersion)
        throw new Error('Stale element revision');
      if (op.type === 'erase' || op.type === 'disconnect') {
        if (op.type === 'disconnect' && element.kind !== 'edge')
          throw new Error('Relationship required');
        next.elements = next.elements.filter((e) => e.id !== op.id);
        next.highlightedIds = next.highlightedIds.filter((id) => id !== op.id);
        if (next.focusedId === op.id) next.focusedId = null;
        if (next.invitation)
          next.invitation.editableIds = next.invitation.editableIds.filter((id) => id !== op.id);
      } else if (op.type === 'predict_allocation') {
        if (
          element.kind !== 'allocation' ||
          op.prediction.requestedCount <= element.resource.allocatedCount
        )
          throw new Error('M5_INVALID_PREDICTION');
        predictAllocation(
          element.resource,
          op.prediction,
          allocationProvenance(state, element, operationIndex, context),
        );
        element.version++;
      } else if (op.type === 'close_allocation_attempt') {
        if (element.kind !== 'allocation') throw new Error('M5_ALLOCATION_REQUIRED');
        closeAllocationAttempt(element.resource, op.attemptId, op.disposition, state.revision + 1);
        element.version++;
      } else if (op.type === 'change_allocation') {
        if (element.kind !== 'allocation') throw new Error('M5_ALLOCATION_REQUIRED');
        executeAllocation(
          element.resource,
          op.requestedCount,
          student,
          allocationProvenance(state, element, operationIndex, context),
          op.attemptId,
        );
        element.version++;
      } else if (op.type === 'replace_cell') {
        if (
          element.kind !== 'table' ||
          !element.editableCells.some((c) => c.row === op.row && c.column === op.column)
        )
          throw new Error('Protected table cell');
        element.rows[op.row]![op.column] = op.value;
        element.version++;
      } else if (op.type === 'trace_step') {
        if (
          element.kind !== 'trace' ||
          op.line !== element.currentLine + 1 ||
          op.line >= element.lines.length
        )
          throw new Error('Invalid trace transition');
        element.currentLine = op.line;
        element.version++;
      } else if (op.type === 'annotate') {
        if (element.kind === 'allocation')
          explainAllocation(
            element.resource,
            op.text,
            allocationProvenance(state, element, operationIndex, context),
          );
        element.annotation = op.text;
        element.version++;
      } else if (op.type === 'complete_step') {
        element.completed = op.completed;
        element.version++;
      } else if (op.type === 'classify') {
        if (!element.classifications?.includes(op.value) || element.kind !== 'node')
          throw new Error('Unsupported classification');
        element.text = op.value;
        element.version++;
      } else if (op.type === 'set_parameter') {
        if (
          !element.parameter ||
          op.value < element.parameter.min ||
          op.value > element.parameter.max
        )
          throw new Error('Parameter outside registered domain');
        element.parameter.value = op.value;
        element.version++;
      } else if (op.type === 'move_element') {
        if (element.kind !== 'node') throw new Error('Only diagram nodes can move');
        element.x = op.x;
        element.y = op.y;
        element.version++;
      } else {
        if (element.kind === 'equation') element.value = op.text;
        else if (element.kind === 'node' || element.kind === 'text') element.text = op.text;
        else if (element.kind === 'edge') {
          if (!['supports', 'connects', 'provides'].includes(op.text))
            throw new Error('Choose a supported relationship');
          if (
            next.elements.some(
              (e) =>
                e.kind === 'edge' &&
                e.id !== element.id &&
                e.from === element.from &&
                e.to === element.to &&
                e.relation === op.text,
            )
          )
            throw new Error(
              'That relationship already exists in this direction. Choose a different relationship.',
            );
          element.text = op.text;
          element.relation = op.text as typeof element.relation;
        } else throw new Error('Unsupported editable content');
        element.version++;
      }
    }
  }
  return validateSharedCanvas(next);
}
/** Server-only compilation/session adapter uses this after review, source and capability validation.
 * Browser rendering this reducer grants no authority; durable writes remain session commands. */
export function applyTrustedCanvasOperations(
  raw: SharedCanvasState,
  operations: CanvasOperation[],
  expectedRevision: number,
  context?: AllocationCommandContext,
) {
  const state = validateSharedCanvas(raw);
  if (state.revision !== expectedRevision || (state.invitation && !state.invitation.submitted))
    throw new Error('M5_CANVAS_OWNERSHIP_CONFLICT');
  if (operations.length > 32) throw new Error('M5_OPERATION_LIMIT');
  const next = mutate(state, operations, false, context);
  next.revision++;
  return validateSharedCanvas(next);
}
/** Fixture authority only. Production must add the session-owner adapter before admission. */
export function applyTeachingAction(raw: SharedCanvasState, input: unknown): SharedCanvasState {
  const state = validateSharedCanvas(raw),
    action = teachingActionEnvelopeSchema.parse(input);
  if (action.activityId !== state.activityId || action.branchId !== state.branchId)
    throw new Error('Stale activity or branch');
  if (state.completedActionIds.includes(action.actionId)) return state;
  if (
    action.expectedCanvasRevision !== state.revision ||
    action.sequence !== state.lastActionSequence + 1
  )
    throw new Error('Stale canvas or sequence');
  if (state.invitation && !state.invitation.submitted)
    throw new Error('Student owns the pending edit');
  if (
    action.operations.some(
      (op) =>
        (op.type === 'add' || op.type === 'connect_elements') &&
        op.element.sourceId !== action.sourceId,
    )
  )
    throw new Error('Source pin mismatch');
  const next = mutate(state, action.operations);
  if (action.cue.targetId && !next.elements.some((e) => e.id === action.cue.targetId))
    throw new Error('Unavailable cue target');
  if (action.checkpoint) next.invitation = action.checkpoint;
  next.revision++;
  next.lastActionSequence = action.sequence;
  next.completedActionIds.push(action.actionId);
  return validateSharedCanvas(next);
}
export function applyStudentCanvasCommand(
  raw: SharedCanvasState,
  input: unknown,
  context?: AllocationCommandContext,
): SharedCanvasState {
  const state = validateSharedCanvas(raw),
    command = studentCanvasCommandSchema.parse(input),
    invitation = state.invitation;
  if (!invitation || invitation.submitted || invitation.id !== command.checkpointId)
    throw new Error('No open edit checkpoint');
  if (
    command.mode !== state.mode ||
    command.activityId !== state.activityId ||
    command.branchId !== state.branchId ||
    command.expectedRevision !== state.revision ||
    command.expectedDraftRevision !== state.draftRevision
  )
    throw new Error('Stale student draft; retain and reconcile');
  for (const op of command.operations) {
    if (!invitation.allowedOperations.some((type) => type === op.type))
      throw new Error('Operation outside invitation');
    if (op.type === 'add') {
      if (
        !op.element.editable ||
        op.element.kind !== 'text' ||
        !state.elements.some(
          (e) => invitation.editableIds.includes(e.id) && e.sourceId === op.element.sourceId,
        )
      )
        throw new Error('Only scoped student annotations may be added');
    } else if (op.type === 'highlight') {
      if (op.ids.some((id) => !invitation.editableIds.includes(id)))
        throw new Error('Highlight outside edit region');
    } else if (op.type === 'connect_elements') {
      if (
        op.element.kind !== 'edge' ||
        !invitation.editableIds.includes(op.element.from) ||
        !invitation.editableIds.includes(op.element.to) ||
        !op.element.editable
      )
        throw new Error('Relationship outside edit region');
      const { from, to, sourceId } = op.element;
      const endpoints = [from, to].map((id) =>
        state.elements.find((e) => e.kind === 'node' && e.id === id),
      );
      if (
        !endpoints.every(
          (e) => e && (e.sourceId === sourceId || state.authorizedSourceIds?.includes(e.sourceId)),
        ) ||
        endpoints[0]?.sourceId !== sourceId
      )
        throw new Error('Source pin mismatch');
    } else if (
      !('id' in op) ||
      typeof op.id !== 'string' ||
      !invitation.editableIds.includes(op.id) ||
      !state.elements.find((e) => e.id === op.id)?.editable
    )
      throw new Error('Element outside edit region');
  }
  const next = mutate(state, command.operations, true, context);
  for (const op of command.operations)
    if (op.type === 'connect_elements' || op.type === 'add')
      next.invitation!.editableIds.push(op.element.id);
  next.revision++;
  next.draftRevision++;
  return validateSharedCanvas(next);
}
/** A validated, previously acknowledged practice state. Never crosses a submission or teaching boundary. */
export function restoreStudentPracticeState(
  raw: SharedCanvasState,
  targetRaw: SharedCanvasState,
  context?: AllocationCommandContext,
): SharedCanvasState {
  const state = validateSharedCanvas(raw),
    target = validateSharedCanvas(targetRaw);
  const current = state.invitation,
    prior = target.invitation;
  if (
    !current ||
    current.submitted ||
    !prior ||
    prior.submitted ||
    current.id !== prior.id ||
    state.activityId !== target.activityId ||
    state.branchId !== target.branchId ||
    state.lastActionSequence !== target.lastActionSequence ||
    current.prompt !== prior.prompt ||
    JSON.stringify(current.allowedOperations) !== JSON.stringify(prior.allowedOperations) ||
    JSON.stringify(state.completedActionIds) !== JSON.stringify(target.completedActionIds)
  )
    throw new Error('Outside practice undo range');
  const permitted = new Set([...current.editableIds, ...prior.editableIds]);
  for (const id of new Set([...state.elements, ...target.elements].map((e) => e.id))) {
    const now = state.elements.find((e) => e.id === id),
      before = target.elements.find((e) => e.id === id);
    if (JSON.stringify(now) === JSON.stringify(before)) continue;
    if (
      !permitted.has(id) ||
      (now && !now.editable) ||
      (before && !before.editable) ||
      (now && before && (now.kind !== before.kind || now.sourceId !== before.sourceId))
    )
      throw new Error('Protected teaching content');
    if (now && before) {
      // Only the fields editable by the existing operations may be restored.
      const immutable = (input: typeof now) => {
        const { annotation: _annotation, completed: _completed, parameter, ...base } = input;
        const e = {
          ...base,
          ...(parameter
            ? { parameter: { min: parameter.min, max: parameter.max, unit: parameter.unit } }
            : {}),
        };
        if (e.kind === 'node') {
          const { text: _text, x: _x, y: _y, version: _version, ...rest } = e;
          return rest;
        }
        if (e.kind === 'edge') {
          const { text: _text, relation: _relation, version: _version, ...rest } = e;
          return rest;
        }
        if (e.kind === 'equation') {
          const { value: _value, version: _version, ...rest } = e;
          return rest;
        }
        if (e.kind === 'allocation') {
          const { resource, version: _version, ...rest } = e;
          return { ...rest, resource: { model: resource.model } };
        }
        if (e.kind === 'table') {
          const { version: _version, ...rest } = e;
          return {
            ...rest,
            rows: e.rows.map((row, r) =>
              row.map((value, c) =>
                e.editableCells.some((cell) => cell.row === r && cell.column === c) ? null : value,
              ),
            ),
          };
        }
        if (e.kind === 'trace') {
          const { currentLine: _line, version: _version, ...rest } = e;
          return rest;
        }
        if (e.kind === 'graph') {
          const { version: _version, ...rest } = e;
          return rest;
        }
        const { text: _text, version: _version, ...rest } = e;
        return rest;
      };
      if (JSON.stringify(immutable(now)) !== JSON.stringify(immutable(before)))
        throw new Error('Protected teaching fields');
    }
  }
  const next = structuredClone(target);
  next.elements = next.elements.map((e) =>
    permitted.has(e.id)
      ? {
          ...e,
          version: Math.max(e.version, state.elements.find((n) => n.id === e.id)?.version ?? 0) + 1,
        }
      : e,
  );
  next.revision = state.revision + 1;
  next.draftRevision = state.draftRevision + 1;
  for (const e of next.elements) {
    const previous = state.elements.find((p) => p.id === e.id);
    if (e.kind === 'allocation' && previous?.kind === 'allocation')
      reconcileAllocationRestore(
        e.resource,
        previous.resource,
        allocationProvenance(state, e, 0, context),
      );
  }
  return validateSharedCanvas(next);
}
export function commitFixtureSubmission(
  raw: SharedCanvasState,
  checkpointId: string,
  expectedRevision: number,
): SharedCanvasState {
  const state = validateSharedCanvas(raw);
  if (state.invitation?.id !== checkpointId || state.revision !== expectedRevision)
    throw new Error('Stale submission');
  if (state.invitation.submitted) return state;
  const next = structuredClone(state);
  next.invitation!.submitted = true;
  next.revision++;
  return next;
}
