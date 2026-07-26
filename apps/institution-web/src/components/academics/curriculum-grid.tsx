'use client';

import { useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  Button,
  Checkbox,
  Combobox,
  ConfirmDialog,
  Dialog,
  Input,
  Label,
  Select,
} from '@edrion/ui';
import {
  useAcademicMutations,
  useDepartmentOptions,
  useProgrammeStructureDetail,
  useSubjectOptions,
} from '@/lib/academics';
import { subjectKindLabel } from '@edrion/schemas';
import { PortalClientError } from '@/lib/portal-client';
import { useTerm } from '@/lib/term';

const NEW_COURSE = '__new__';

interface SlotSubject {
  id: string;
  subjectId: string;
  subjectName: string | null;
  subjectCode: string | null;
  subjectKind: string | null;
  credits: number | null;
  isElective: boolean;
  sequence: number;
  version: number;
}

interface SlotRow {
  id: string;
  programmeLevelId: string;
  sequenceInYear: number;
  name: string;
  levelName: string;
  subjects: SlotSubject[];
}

interface CurriculumGridProps {
  canManage?: boolean;
  onChanged?: () => void;
}

export function CurriculumGrid({ canManage = true, onChanged }: CurriculumGridProps) {
  const { t, tp } = useTerm();
  const { data: departments } = useDepartmentOptions();
  const [departmentId, setDepartmentId] = useState('');
  const { data: structure, refetch: refetchStructure } = useProgrammeStructureDetail(
    departmentId || undefined,
  );

  const slots = useMemo<SlotRow[]>(
    () =>
      structure?.levels.flatMap((l) =>
        l.slots.map((s) => ({
          id: s.id,
          programmeLevelId: s.programmeLevelId,
          sequenceInYear: s.sequenceInYear,
          name: s.name,
          levelName: l.name,
          subjects: s.subjects ?? [],
        })),
      ) ?? [],
    [structure],
  );

  async function refresh() {
    await refetchStructure();
    onChanged?.();
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>{t('department')}</Label>
        <Select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          placeholder={`Pick a ${t('department').toLowerCase()}…`}
          options={(departments?.items ?? []).map((d) => ({ value: d.id, label: d.name }))}
        />
      </div>

      {!departmentId && (
        <p className="text-sm text-text-muted">
          Choose a programme to see its {tp('term').toLowerCase()} slots and placed{' '}
          {tp('subject').toLowerCase()}.
        </p>
      )}

      {departmentId && slots.length === 0 && (
        <p className="text-sm text-text-muted">
          This programme has no structure yet. Build it in the previous step first.
        </p>
      )}

      {slots.length > 0 && (
        <div className="space-y-3">
          {slots.map((slot) => (
            <SlotCurriculumCard
              key={slot.id}
              slot={slot}
              departmentId={departmentId}
              placements={slot.subjects}
              canManage={canManage}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SlotCurriculumCardProps {
  slot: SlotRow;
  departmentId: string;
  placements: SlotSubject[];
  canManage: boolean;
  onChanged: () => void | Promise<void>;
}

function SlotCurriculumCard({
  slot,
  departmentId,
  placements,
  canManage,
  onChanged,
}: SlotCurriculumCardProps) {
  const { t, tp } = useTerm();
  const { data: subjects } = useSubjectOptions();
  const subjectMut = useAcademicMutations('subjects');
  const curriculumMut = useAcademicMutations('programme-subjects');

  const [courseChoice, setCourseChoice] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [editing, setEditing] = useState<SlotSubject | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editCredits, setEditCredits] = useState('');
  const [editElective, setEditElective] = useState(false);
  const [removing, setRemoving] = useState<SlotSubject | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [pendingSubjectIds, setPendingSubjectIds] = useState<string[]>([]);

  const placedSubjectIds = useMemo(() => {
    const ids = new Set(placements.map((p) => p.subjectId));
    for (const id of pendingSubjectIds) ids.add(id);
    return ids;
  }, [placements, pendingSubjectIds]);

  const availableSubjects = useMemo(
    () => (subjects?.items ?? []).filter((s) => !placedSubjectIds.has(s.id)),
    [subjects, placedSubjectIds],
  );

  const courseOptions = useMemo(
    () => [
      { value: NEW_COURSE, label: `＋ Create a new ${t('subject').toLowerCase()}…` },
      ...availableSubjects.map((s) => ({
        value: s.id,
        label: s.name,
        hint: s.code || undefined,
      })),
    ],
    [availableSubjects, t],
  );

  const creatingNew = courseChoice === NEW_COURSE;
  const busy =
    placing ||
    subjectMut.create.isPending ||
    subjectMut.update.isPending ||
    curriculumMut.create.isPending ||
    curriculumMut.update.isPending;

  async function placeSubject(subjectId: string) {
    if (placedSubjectIds.has(subjectId) || placing) {
      setCourseChoice('');
      return;
    }

    setPlaceError(null);
    setPlacing(true);
    setPendingSubjectIds((prev) => (prev.includes(subjectId) ? prev : [...prev, subjectId]));

    try {
      await curriculumMut.create.mutateAsync({
        subjectId,
        programmeLevelId: slot.programmeLevelId,
        slotId: slot.id,
      });
      setCourseChoice('');
      setNewSubjectName('');
      setNewSubjectCode('');
      await onChanged();
    } catch (err) {
      if (err instanceof PortalClientError && err.code === 'DUPLICATE_CURRICULUM_ENTRY') {
        setPlaceError('This course is already placed in this semester.');
        setCourseChoice('');
        await onChanged();
      } else {
        throw err;
      }
    } finally {
      setPendingSubjectIds((prev) => prev.filter((id) => id !== subjectId));
      setPlacing(false);
    }
  }

  async function onCourseChoice(value: string) {
    setPlaceError(null);
    setCourseChoice(value);
    if (!value || value === NEW_COURSE) return;
    if (placedSubjectIds.has(value)) {
      setCourseChoice('');
      return;
    }
    await placeSubject(value);
  }

  async function createAndPlace() {
    if (!newSubjectName.trim()) return;
    const subject = (await subjectMut.create.mutateAsync({
      name: newSubjectName.trim(),
      code: newSubjectCode.trim() || undefined,
      kind: 'core',
      departmentId,
    })) as { id: string };
    await placeSubject(subject.id);
  }

  function openEdit(row: SlotSubject) {
    setEditing(row);
    setEditName(row.subjectName ?? '');
    setEditCode(row.subjectCode ?? '');
    setEditCredits(row.credits != null ? String(row.credits) : '');
    setEditElective(row.isElective);
  }

  async function saveEdit() {
    if (!editing || !editName.trim()) return;
    const subject = subjects?.items?.find((s) => s.id === editing.subjectId);
    const code = editCode.trim();
    if (subject) {
      await subjectMut.update.mutateAsync({
        id: editing.subjectId,
        body: {
          version: subject.version,
          name: editName.trim(),
          ...(code ? { code } : {}),
        },
      });
    }
    const credits = editCredits.trim() === '' ? null : Number(editCredits);
    await curriculumMut.update.mutateAsync({
      id: editing.id,
      body: {
        version: editing.version,
        credits: Number.isFinite(credits) ? credits : null,
        isElective: editElective,
      },
    });
    setEditing(null);
    await onChanged();
  }

  async function confirmRemove() {
    if (!removing) return;
    await curriculumMut.remove.mutateAsync({ id: removing.id, version: removing.version });
    setRemoving(null);
    await onChanged();
  }

  const displayPlacements = [
    ...placements,
    ...pendingSubjectIds
      .filter((id) => !placements.some((p) => p.subjectId === id))
      .map((id) => {
        const subject = subjects?.items?.find((s) => s.id === id);
        return {
          id: `pending-${id}`,
          subjectId: id,
          subjectName: subject?.name ?? 'Placing…',
          subjectCode: subject?.code ?? null,
          subjectKind: subject?.kind ?? 'core',
          credits: null,
          isElective: false,
          sequence: 0,
          version: 0,
          pending: true as const,
        };
      }),
  ];

  return (
    <>
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="font-medium">{slot.name}</p>
            <p className="text-xs text-text-muted">{slot.levelName}</p>
          </div>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted tabular-nums">
            {placements.length} placed
          </span>
        </div>

        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Placed {tp('subject').toLowerCase()}
          </p>
          {displayPlacements.length === 0 ? (
            <p className="mt-1 text-sm text-text-muted">
              No {tp('subject').toLowerCase()} in this {tp('term').toLowerCase()} yet.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {displayPlacements.map((row) => (
                <PlacementRow
                  key={row.id}
                  row={row}
                  canManage={canManage && !('pending' in row)}
                  onEdit={() => openEdit(row)}
                  onRemove={() => setRemoving(row)}
                />
              ))}
            </ul>
          )}
        </div>

        {canManage && (
          <div className="mt-4 space-y-2 border-t border-border/60 pt-3">
            <Label className="text-xs">Add {t('subject').toLowerCase()}</Label>
            {placeError && <p className="text-xs text-danger">{placeError}</p>}
            <Combobox
              value={courseChoice || null}
              onChange={onCourseChoice}
              options={courseOptions}
              placeholder={
                availableSubjects.length === 0
                  ? `All ${tp('subject').toLowerCase()} already placed — create a new one`
                  : `Pick or create a ${t('subject').toLowerCase()}…`
              }
              searchPlaceholder={`Search ${tp('subject').toLowerCase()}…`}
              emptyText={`No matching ${tp('subject').toLowerCase()}`}
              disabled={busy}
            />
            {creatingNew && (
              <div className="grid gap-2 rounded-md border border-border/60 bg-background p-3 sm:grid-cols-2">
                <Input
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder="Name"
                  autoFocus
                />
                <Input
                  value={newSubjectCode}
                  onChange={(e) => setNewSubjectCode(e.target.value)}
                  placeholder="Code (optional)"
                />
                <div className="flex gap-2 sm:col-span-2">
                  <Button
                    size="sm"
                    onClick={createAndPlace}
                    disabled={!newSubjectName.trim()}
                    loading={busy}
                  >
                    Create &amp; place
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCourseChoice('');
                      setNewSubjectName('');
                      setNewSubjectCode('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.subjectName ?? t('subject').toLowerCase()}`}
      >
        <div className="p-5 space-y-4">
          <p className="text-sm text-text-muted">
            {slot.name} · {slot.levelName}
          </p>
          <div>
            <Label>
              Name <span className="text-danger">*</span>
            </Label>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Course name"
              autoFocus
            />
          </div>
          <div>
            <Label>Code</Label>
            <Input
              value={editCode}
              onChange={(e) => setEditCode(e.target.value)}
              placeholder="e.g. CST401"
              className="font-mono"
            />
          </div>
          <div>
            <Label>Credits</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={editCredits}
              onChange={(e) => setEditCredits(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={editElective}
              onChange={(e) => setEditElective(e.target.checked)}
            />
            Elective {t('subject').toLowerCase()}
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              loading={subjectMut.update.isPending || curriculumMut.update.isPending}
              disabled={!editName.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        title={`Remove ${removing?.subjectName ?? t('subject').toLowerCase()}?`}
        description={`This removes the placement from ${slot.name}. The ${t('subject').toLowerCase()} itself is not deleted.`}
        confirmLabel="Remove"
        danger
        loading={curriculumMut.remove.isPending}
      />
    </>
  );
}

function PlacementRow({
  row,
  canManage,
  onEdit,
  onRemove,
}: {
  row: SlotSubject & { pending?: boolean };
  canManage: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <li
      className={
        row.pending
          ? 'flex items-start gap-2 rounded-md border border-dashed border-border/60 bg-background px-2.5 py-2 text-sm opacity-70'
          : 'group flex items-start gap-2 rounded-md border border-border/50 bg-background px-2.5 py-2 text-sm'
      }
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-text-primary">
          {row.subjectName ?? 'Unknown'}
          {row.subjectCode && (
            <span className="ml-1.5 font-mono text-xs font-normal text-text-muted">
              {row.subjectCode}
            </span>
          )}
        </p>
        <p className="text-xs text-text-muted">
          {row.pending
            ? 'Saving placement…'
            : `${row.credits != null ? `${row.credits} credits` : 'No credits set'} · ${subjectKindLabel(
                row.isElective ? 'elective' : row.subjectKind,
              )}`}
        </p>
      </div>
      {canManage && (
        <div className="flex shrink-0 gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            aria-label={`Edit ${row.subjectName ?? 'placement'}`}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-danger hover:text-danger"
            aria-label={`Remove ${row.subjectName ?? 'placement'}`}
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </li>
  );
}
