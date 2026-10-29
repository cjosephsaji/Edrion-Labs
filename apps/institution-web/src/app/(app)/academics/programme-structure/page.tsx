'use client';
import { useMemo, useState } from 'react';
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, Dialog, Input, Label, Select, Skeleton } from '@edrion/ui';
import { subjectKindLabel } from '@edrion/schemas';
import { Topbar } from '@/components/app-shell/topbar';
import {
  useAcademicMutations,
  useAcademicYearOptions,
  useClassOptions,
  useProgrammeStructure,
  useSubjectOptions,
} from '@/lib/academics';
import type { ClassRow, Paged } from '@/lib/academics-types';
import { isEndAfterStart, maxStartDate, minEndDate } from '@/lib/date-range';
import { formatPortalError, usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import type {
  GradeLevelRow,
  ProgrammeStructureDepartment,
  ProgrammeStructureLevel,
  ProgrammeStructureSection,
  ProgrammeStructureSubject,
  ProgrammeStructureTerm,
} from '@/lib/academics-types';
import { usePermissions } from '@/lib/permissions';
import { useAcademicStructureTerms } from '@/lib/academic-structure-terms';

/** Sentinel option in the class picker: reveal a name field and create a fresh class instead. */
const NEW_SECTION = '__new__';

function TreePanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  if (!open) return null;
  return <div>{children}</div>;
}

function TreeChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 text-text-muted transition-transform duration-150 ${open ? '' : '-rotate-90'} ${className ?? ''}`}
      aria-hidden
    >
      <ChevronDown className="h-4 w-4" />
    </span>
  );
}

function ExpandableHeader({
  open,
  onToggle,
  children,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button type="button" className={className} onClick={onToggle} aria-expanded={open}>
      {children}
    </button>
  );
}

function CourseMeta({
  code,
  credits,
  kind,
}: {
  code: string | null;
  credits: number | null;
  kind: string;
}) {
  const parts: string[] = [];
  if (credits != null) parts.push(`${credits} credits`);
  parts.push(kind);

  return (
    <p className="mt-0.5 text-xs text-text-muted">
      {code && <span className="font-mono">{code}</span>}
      {code && parts.length > 0 && <span> · </span>}
      {parts.join(' · ')}
    </p>
  );
}

export default function ProgrammeStructurePage() {
  const { t, tp } = useAcademicStructureTerms();
  const { can } = usePermissions();
  const canManage = can('academics.manage');
  const { data, isLoading, refetch } = useProgrammeStructure();
  const title = t('programmeStructure');

  return (
    <>
      <Topbar title={title} />
      <div className="page-enter mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-5">
        <p className="text-sm leading-relaxed text-text-secondary">
          Build each {t('department').toLowerCase()} from the top down — add{' '}
          {tp('gradeLevel').toLowerCase()}, then {tp('term').toLowerCase()}, then the{' '}
          {tp('subject').toLowerCase()} and {tp('class').toLowerCase()} that sit inside each one.{' '}
          {tp('subject')} added here become the curriculum every intake of this{' '}
          {t('gradeLevel').toLowerCase()} inherits.
        </p>
        {isLoading && <Skeleton className="h-64 w-full rounded-lg" />}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-text-muted">
            No {tp('department').toLowerCase()} yet. Add programmes first, then return here to
            define their structure.
          </p>
        )}
        <div className="space-y-4">
          {(data ?? []).map((dept) => (
            <ProgrammeNode
              key={dept.id}
              dept={dept}
              canManage={canManage}
              onChanged={() => refetch()}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function ProgrammeNode({
  dept,
  canManage,
  onChanged,
}: {
  dept: ProgrammeStructureDepartment;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { t, tp } = useAcademicStructureTerms();
  const [open, setOpen] = useState(true);
  const [addYear, setAddYear] = useState(false);
  const gradeMut = useAcademicMutations('grade-levels');
  const linkMut = useAcademicMutations('department-grade-levels');
  const [yearName, setYearName] = useState('');
  const [durationLabel, setDurationLabel] = useState('');
  const [removeLevel, setRemoveLevel] = useState<ProgrammeStructureLevel | null>(null);

  async function saveYear() {
    if (!yearName.trim()) return;
    const sequence = dept.levels.length + 1;
    const created = (await gradeMut.create.mutateAsync({
      name: yearName.trim(),
      level: sequence,
      departmentId: dept.id,
    })) as GradeLevelRow;
    await linkMut.create.mutateAsync({
      departmentId: dept.id,
      gradeLevelId: created.id,
      sequence,
      durationLabel: durationLabel.trim() || null,
    });
    setYearName('');
    setDurationLabel('');
    setAddYear(false);
    onChanged();
  }

  async function confirmRemoveLevel() {
    if (!removeLevel) return;
    await linkMut.remove.mutateAsync({ id: removeLevel.id, version: removeLevel.version });
    setRemoveLevel(null);
    onChanged();
  }

  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm transition-shadow duration-150 hover:shadow-md">
      <ExpandableHeader
        open={open}
        onToggle={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-background-secondary/40"
      >
        <TreeChevron open={open} />
        <span className="font-semibold text-text-primary">{dept.name}</span>
        {dept.code && (
          <span className="rounded bg-background-secondary px-1.5 py-0.5 text-xs text-text-muted">
            {dept.code}
          </span>
        )}
        <span className="ml-auto rounded-full bg-background-secondary px-2.5 py-0.5 text-xs text-text-muted tabular-nums">
          {dept.levels.length} {tp('gradeLevel').toLowerCase()}
        </span>
      </ExpandableHeader>
      <TreePanel open={open}>
        <div className="border-t border-border px-5 py-4">
          {dept.levels.length === 0 && (
            <p className="mb-3 text-sm text-text-muted">No {tp('gradeLevel').toLowerCase()} yet.</p>
          )}
          <ul className="space-y-3">
            {dept.levels.map((level) => (
              <li key={level.id}>
                <LevelNode
                  level={level}
                  deptId={dept.id}
                  canManage={canManage}
                  onRemove={() => setRemoveLevel(level)}
                  onChanged={onChanged}
                />
              </li>
            ))}
          </ul>
          {canManage && (
            <div className="mt-4">
              <Button size="sm" variant="secondary" onClick={() => setAddYear(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add {t('gradeLevel').toLowerCase()}
              </Button>
            </div>
          )}
        </div>
      </TreePanel>
      <Dialog
        open={addYear}
        onClose={() => setAddYear(false)}
        title={`Add ${t('gradeLevel').toLowerCase()}`}
      >
        <div className="flex flex-col gap-3 p-5">
          <div>
            <Label>Name</Label>
            <Input
              value={yearName}
              onChange={(e) => setYearName(e.target.value)}
              placeholder={`${t('gradeLevel')} ${dept.levels.length + 1}`}
              autoFocus
            />
          </div>
          <div>
            <Label>Duration label (optional)</Label>
            <Input
              value={durationLabel}
              onChange={(e) => setDurationLabel(e.target.value)}
              placeholder="e.g. 2 years"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddYear(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveYear}
              loading={gradeMut.create.isPending || linkMut.create.isPending}
              disabled={!yearName.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      </Dialog>
      <ConfirmDialog
        open={!!removeLevel}
        onClose={() => setRemoveLevel(null)}
        title={`Remove ${t('gradeLevel').toLowerCase()}?`}
        description="Semesters and sections under this link are not deleted, but will no longer appear in the tree."
        confirmLabel="Remove"
        danger
        onConfirm={confirmRemoveLevel}
      />
    </div>
  );
}

function LevelNode({
  level,
  deptId,
  canManage,
  onRemove,
  onChanged,
}: {
  level: ProgrammeStructureLevel;
  deptId: string;
  canManage: boolean;
  onRemove: () => void;
  onChanged: () => void;
}) {
  const { t, tp } = useAcademicStructureTerms();
  const [open, setOpen] = useState(false);
  const [addTerm, setAddTerm] = useState(false);
  const termMut = useAcademicMutations('academic-terms');
  const { data: years } = useAcademicYearOptions();
  const currentYear = years?.items?.find((y) => y.isCurrent) ?? years?.items?.[0];
  const [termName, setTermName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  async function saveTerm() {
    if (!currentYear || !termName || !startDate || !endDate || !isEndAfterStart(startDate, endDate))
      return;
    await termMut.create.mutateAsync({
      academicYearId: currentYear.id,
      programmeLevelId: level.id,
      departmentId: deptId,
      gradeLevelId: level.gradeLevelId,
      name: termName,
      kind: 'semester',
      sequence: level.terms.filter((x) => !x.id.startsWith('orphan-')).length + 1,
      startDate,
      endDate,
    });
    setAddTerm(false);
    setTermName('');
    setStartDate('');
    setEndDate('');
    onChanged();
  }

  const realTerms = level.terms.filter((x) => !x.id.startsWith('orphan-'));
  const yearLabel = useMemo(() => {
    const parts = [level.gradeLevelName];
    if (level.durationLabel) parts.push(level.durationLabel);
    return parts.filter(Boolean).join(' · ');
  }, [level.durationLabel, level.gradeLevelName]);

  return (
    <div className="rounded-lg border border-border/80 bg-background-secondary/30 transition-colors duration-150 hover:border-border">
      <div className="flex items-center gap-2 px-4 py-3">
        <ExpandableHeader
          open={open}
          onToggle={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2.5 text-left"
        >
          <TreeChevron open={open} className="[&_svg]:h-3.5 [&_svg]:w-3.5" />
          <span className="text-sm font-semibold text-text-primary">{yearLabel}</span>
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-text-muted">
            {realTerms.length} {tp('term').toLowerCase()}
          </span>
        </ExpandableHeader>
        {canManage && (
          <button
            type="button"
            aria-label={`Remove ${t('gradeLevel').toLowerCase()}`}
            onClick={onRemove}
            className="rounded p-1 text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <TreePanel open={open}>
        <div className="space-y-3 border-t border-border/60 px-4 py-3 pl-10">
          <div className="space-y-3">
            {realTerms.map((term) => (
              <TermNode
                key={term.id}
                term={term}
                level={level}
                canManage={canManage}
                onChanged={onChanged}
              />
            ))}
          </div>
          {canManage && (
            <div className="pt-1">
              <Button size="sm" variant="secondary" onClick={() => setAddTerm(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add {t('term').toLowerCase()}
              </Button>
            </div>
          )}
        </div>
      </TreePanel>
      <Dialog
        open={addTerm}
        onClose={() => setAddTerm(false)}
        title={`Add ${t('term').toLowerCase()}`}
      >
        <div className="flex flex-col gap-3 p-5">
          <div>
            <Label>Name</Label>
            <Input
              value={termName}
              onChange={(e) => setTermName(e.target.value)}
              placeholder={`${t('term')} 1`}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start</Label>
              <Input
                type="date"
                value={startDate}
                max={maxStartDate(endDate)}
                onChange={(e) => {
                  const v = e.target.value;
                  setStartDate(v);
                  if (endDate && !isEndAfterStart(v, endDate)) setEndDate('');
                }}
              />
            </div>
            <div>
              <Label>End</Label>
              <Input
                type="date"
                value={endDate}
                min={minEndDate(startDate)}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddTerm(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveTerm}
              loading={termMut.create.isPending}
              disabled={!termName || !isEndAfterStart(startDate, endDate)}
            >
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function TermNode({
  term,
  level,
  canManage,
  onChanged,
}: {
  term: ProgrammeStructureTerm;
  level: ProgrammeStructureLevel;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { t, tp } = useAcademicStructureTerms();
  const client = usePortalClient();
  const { scope } = useScope();
  const [addSection, setAddSection] = useState(false);
  const [addSubject, setAddSubject] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const classMut = useAcademicMutations('classes');
  const curriculumMut = useAcademicMutations('programme-subjects');
  const subjectMut = useAcademicMutations('subjects');
  const { data: years } = useAcademicYearOptions();
  const { data: subjects } = useSubjectOptions();
  const { data: classes } = useClassOptions({ programmeLevelId: level.id });
  const currentYear = years?.items?.find((y) => y.isCurrent) ?? years?.items?.[0];
  const [sectionChoice, setSectionChoice] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [editingCourse, setEditingCourse] = useState<ProgrammeStructureSubject | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');

  const isOrphan = term.id.startsWith('orphan-');
  const placedIds = new Set(term.subjects.map((s) => s.subjectId));
  const availableSubjects = (subjects?.items ?? []).filter((s) => !placedIds.has(s.id));

  // Classes that could be moved into this semester — anything not already sitting in it.
  const attachable = (classes?.items ?? []).filter((c) => c.termId !== term.id);
  const sectionOptions = [
    ...attachable.map((c) => ({
      value: c.id,
      label: c.termName ? `${c.name} (in ${c.termName})` : `${c.name} (unplaced)`,
    })),
    { value: NEW_SECTION, label: `＋ Create a new ${t('class').toLowerCase()}…` },
  ];
  const creatingSection = sectionChoice === NEW_SECTION;

  function resetSection() {
    setSectionChoice('');
    setSectionName('');
    setAddSection(false);
  }

  async function saveSection() {
    if (!currentYear || !sectionChoice) return;

    if (creatingSection) {
      if (!sectionName.trim()) return;
      await classMut.create.mutateAsync({
        academicYearId: currentYear.id,
        gradeLevelId: level.gradeLevelId,
        programmeLevelId: level.id,
        termId: term.id,
        name: sectionName.trim(),
      });
    } else {
      // Moving an existing class in: repoint its year too, since the API requires the class's
      // grade level to match the programme level it is being attached to.
      const existing = attachable.find((c) => c.id === sectionChoice);
      if (!existing) return;
      await classMut.update.mutateAsync({
        id: existing.id,
        body: {
          programmeLevelId: level.id,
          termId: term.id,
          gradeLevelId: level.gradeLevelId,
          version: existing.version,
        },
      });
    }

    resetSection();
    onChanged();
  }

  async function saveSubject() {
    if (!subjectId) return;
    await curriculumMut.create.mutateAsync({
      subjectId,
      programmeLevelId: level.id,
      ...(term.slotId ? { slotId: term.slotId } : { semesterSequence: term.sequence }),
    });
    setSubjectId('');
    setAddSubject(false);
    onChanged();
  }

  async function dropSubject(id: string, version: number) {
    await curriculumMut.remove.mutateAsync({ id, version });
    onChanged();
  }

  async function resolveClassVersion(section: ProgrammeStructureSection): Promise<number | null> {
    if (section.version != null) return section.version;
    const cached = classes?.items?.find((c) => c.id === section.id)?.version;
    if (cached != null) return cached;
    const page = await client.get<Paged<ClassRow>>(
      `/portal/academics/classes?programmeLevelId=${level.id}&page=1&pageSize=100&sortBy=name&sortDir=asc`,
      scope,
    );
    return page.items.find((c) => c.id === section.id)?.version ?? null;
  }

  async function dropSection(section: ProgrammeStructureSection) {
    setSectionError(null);
    try {
      const version = await resolveClassVersion(section);
      if (version == null) {
        setSectionError(`Could not update ${t('class').toLowerCase()}. Refresh and try again.`);
        return;
      }
      await classMut.update.mutateAsync({
        id: section.id,
        body: { termId: null, version },
      });
      onChanged();
    } catch (err) {
      setSectionError(formatPortalError(err));
    }
  }

  function openEditCourse(course: ProgrammeStructureSubject) {
    setEditingCourse(course);
    setEditName(course.name);
    setEditCode(course.code ?? '');
  }

  async function saveEditCourse() {
    if (!editingCourse || !editName.trim()) return;
    const subjectVersion =
      editingCourse.subjectVersion ??
      subjects?.items?.find((s) => s.id === editingCourse.subjectId)?.version;
    if (subjectVersion == null) return;
    const code = editCode.trim();
    await subjectMut.update.mutateAsync({
      id: editingCourse.subjectId,
      body: {
        version: subjectVersion,
        name: editName.trim(),
        ...(code ? { code } : {}),
      },
    });
    setEditingCourse(null);
    onChanged();
  }

  return (
    <div className="rounded-lg border border-border bg-surface shadow-xs transition-colors duration-150 hover:border-border-strong">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
        <span className="text-sm font-semibold text-text-primary">{term.name}</span>
        <span className="shrink-0 rounded-full bg-background-secondary px-2.5 py-0.5 text-xs text-text-muted tabular-nums">
          {term.subjects.length} {tp('subject').toLowerCase()} · {term.sections.length}{' '}
          {tp('class').toLowerCase()}
        </span>
      </div>

      <div className="space-y-4 px-4 py-4">
        {!isOrphan && (
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {tp('subject')}
            </h4>
            <ul className="space-y-2">
              {term.subjects.length === 0 && (
                <li className="rounded-md border border-dashed border-border/60 bg-background-secondary/20 px-3 py-3 text-sm text-text-muted">
                  No {tp('subject').toLowerCase()} yet.
                </li>
              )}
              {term.subjects.map((s) => (
                <li
                  key={s.id}
                  className="group flex items-start gap-3 rounded-md border border-border/50 bg-background-secondary/30 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary">{s.name}</p>
                    <CourseMeta
                      code={s.code}
                      credits={s.credits}
                      kind={subjectKindLabel(s.isElective ? 'elective' : s.kind)}
                    />
                  </div>
                  {canManage && (
                    <div className="mt-0.5 flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label={`Edit ${s.name}`}
                        onClick={() => openEditCourse(s)}
                        className="rounded p-1 text-text-muted transition-colors hover:bg-background-secondary hover:text-text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${s.name}`}
                        onClick={() => dropSubject(s.id, s.version)}
                        className="rounded p-1 text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {canManage && (
              <>
                {!addSubject ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => setAddSubject(true)}
                    disabled={availableSubjects.length === 0}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {availableSubjects.length === 0
                      ? `All ${tp('subject').toLowerCase()} placed`
                      : `Add ${t('subject').toLowerCase()}`}
                  </Button>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2 rounded-md border border-border/60 bg-background-secondary/20 p-3">
                    <Select
                      value={subjectId}
                      onChange={(e) => setSubjectId(e.target.value)}
                      placeholder={`Pick a ${t('subject').toLowerCase()}…`}
                      options={availableSubjects.map((s) => ({
                        value: s.id,
                        label: `${s.name} (${s.code})`,
                      }))}
                      className="h-9 min-w-[12rem] flex-1 text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={saveSubject}
                      loading={curriculumMut.create.isPending}
                      disabled={!subjectId}
                    >
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddSubject(false)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <section className={isOrphan ? undefined : 'border-t border-border/60 pt-4'}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {tp('class')}
          </h4>
          {sectionError && (
            <p className="mb-2 text-sm text-danger" role="alert">
              {sectionError}
            </p>
          )}
          <ul className="space-y-2">
            {term.sections.length === 0 && (
              <li className="rounded-md border border-dashed border-border/60 bg-background-secondary/20 px-3 py-3 text-sm text-text-muted">
                No {tp('class').toLowerCase()} yet.
              </li>
            )}
            {term.sections.map((s) => (
              <li
                key={s.id}
                className="group flex items-start gap-3 rounded-md border border-border/50 bg-background-secondary/30 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">{s.name}</p>
                  {(s.section || s.studentCount != null || s.subjectCount != null) && (
                    <p className="mt-0.5 text-xs text-text-muted">
                      {[
                        s.section,
                        s.studentCount != null ? `${s.studentCount} students` : null,
                        s.subjectCount != null
                          ? `${s.subjectCount} ${tp('subject').toLowerCase()}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
                {canManage && (
                  <button
                    type="button"
                    aria-label={`Remove ${s.name}`}
                    onClick={() => dropSection(s)}
                    className="mt-0.5 shrink-0 rounded p-1 text-text-muted opacity-0 transition-colors transition-opacity focus-within:opacity-100 group-hover:opacity-100 hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canManage && (
            <>
              {!addSection ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => setAddSection(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add {t('class').toLowerCase()}
                </Button>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2 rounded-md border border-border/60 bg-background-secondary/20 p-3">
                  <Select
                    value={sectionChoice}
                    onChange={(e) => setSectionChoice(e.target.value)}
                    placeholder={`Pick a ${t('class').toLowerCase()}…`}
                    options={sectionOptions}
                    className="h-9 min-w-[12rem] flex-1 text-sm"
                  />
                  {creatingSection && (
                    <Input
                      value={sectionName}
                      onChange={(e) => setSectionName(e.target.value)}
                      placeholder={`${t('class')} name`}
                      className="h-9 min-w-[10rem] flex-1 text-sm"
                      autoFocus
                    />
                  )}
                  <Button
                    size="sm"
                    onClick={saveSection}
                    loading={classMut.create.isPending || classMut.update.isPending}
                    disabled={!sectionChoice || (creatingSection && !sectionName.trim())}
                  >
                    Add
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetSection}>
                    Cancel
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <Dialog
        open={!!editingCourse}
        onClose={() => setEditingCourse(null)}
        title={`Edit ${t('subject').toLowerCase()}`}
      >
        <div className="flex flex-col gap-4 p-5">
          <p className="text-sm text-text-muted">
            {term.name} · {level.gradeLevelName}
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
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditingCourse(null)}>
              Cancel
            </Button>
            <Button
              onClick={saveEditCourse}
              loading={subjectMut.update.isPending}
              disabled={!editName.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
