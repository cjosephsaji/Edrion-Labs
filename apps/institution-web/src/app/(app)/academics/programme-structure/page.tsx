'use client';
import { useMemo, useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import {
  Button,
  ConfirmDialog,
  Dialog,
  Input,
  Label,
  Select,
  Skeleton,
} from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import {
  useAcademicMutations,
  useAcademicYearOptions,
  useClassOptions,
  useProgrammeStructure,
  useSubjectOptions,
} from '@/lib/academics';
import { isEndAfterStart, maxStartDate, minEndDate } from '@/lib/date-range';
import type {
  GradeLevelRow,
  ProgrammeStructureDepartment,
  ProgrammeStructureLevel,
  ProgrammeStructureTerm,
} from '@/lib/academics-types';
import { usePermissions } from '@/lib/permissions';
import { useTerm } from '@/lib/term';

const EASE = [0.4, 0, 0.2, 1] as const;

/** Sentinel option in the class picker: reveal a name field and create a fresh class instead. */
const NEW_SECTION = '__new__';

const listStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } },
};

const listItem = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: EASE } },
  exit: { opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.16, ease: EASE } },
};

function TreePanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return open ? <div>{children}</div> : null;

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.24, ease: EASE }}
          className="overflow-hidden"
        >
          <motion.div
            initial={{ y: -6 }}
            animate={{ y: 0 }}
            exit={{ y: -4 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TreeChevron({ open, className }: { open: boolean; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      className={`inline-flex shrink-0 text-text-muted ${className ?? ''}`}
      animate={{ rotate: open ? 0 : -90 }}
      transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE }}
      aria-hidden
    >
      <ChevronDown className="h-4 w-4" />
    </motion.span>
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
  const reduceMotion = useReducedMotion();
  return (
    <motion.button
      type="button"
      className={className}
      onClick={onToggle}
      aria-expanded={open}
      whileTap={reduceMotion ? undefined : { scale: 0.995 }}
      transition={{ duration: 0.1 }}
    >
      {children}
    </motion.button>
  );
}

export default function ProgrammeStructurePage() {
  const { t, tp } = useTerm();
  const { can } = usePermissions();
  const canManage = can('academics.manage');
  const { data, isLoading, refetch } = useProgrammeStructure();
  const reduceMotion = useReducedMotion();
  const title = t('programmeStructure');

  return (
    <>
      <Topbar title={title} />
      <div className="page-enter flex flex-1 flex-col gap-4 p-5">
        <p className="text-sm text-text-secondary">
          Build each {t('department').toLowerCase()} from the top down — add {tp('gradeLevel').toLowerCase()}, then{' '}
          {tp('term').toLowerCase()}, then the {tp('subject').toLowerCase()} and {tp('class').toLowerCase()} that sit
          inside each one. {tp('subject')} added here become the curriculum every intake of this{' '}
          {t('gradeLevel').toLowerCase()} inherits.
        </p>
        {isLoading && <Skeleton className="h-64 w-full rounded-lg" />}
        <AnimatePresence mode="wait">
          {!isLoading && (data?.length ?? 0) === 0 && (
            <motion.p
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-text-muted"
            >
              No {tp('department').toLowerCase()} yet. Add programmes first, then return here to define their structure.
            </motion.p>
          )}
        </AnimatePresence>
        <LayoutGroup>
          <motion.div
            className="space-y-3"
            initial={reduceMotion ? false : 'hidden'}
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.08 } },
            }}
          >
            {(data ?? []).map((dept) => (
              <motion.div
                key={dept.id}
                layout={!reduceMotion}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
                }}
              >
                <ProgrammeNode dept={dept} canManage={canManage} onChanged={() => refetch()} />
              </motion.div>
            ))}
          </motion.div>
        </LayoutGroup>
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
  const { t, tp } = useTerm();
  const [open, setOpen] = useState(true);
  const [addYear, setAddYear] = useState(false);
  const gradeMut = useAcademicMutations('grade-levels');
  const linkMut = useAcademicMutations('department-grade-levels');
  const [yearName, setYearName] = useState('');
  const [durationLabel, setDurationLabel] = useState('');
  const [removeLevel, setRemoveLevel] = useState<ProgrammeStructureLevel | null>(null);
  const reduceMotion = useReducedMotion();

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
    <motion.div
      layout={!reduceMotion}
      className="rounded-xl border border-border bg-surface shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
      <ExpandableHeader
        open={open}
        onToggle={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-background-secondary/40"
      >
        <TreeChevron open={open} />
        <span className="font-semibold text-text-primary">{dept.name}</span>
        <span className="text-xs text-text-muted">{dept.code}</span>
        <motion.span
          key={dept.levels.length}
          initial={{ scale: 0.9, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          className="ml-auto text-xs text-text-muted"
        >
          {dept.levels.length} {tp('gradeLevel').toLowerCase()}
        </motion.span>
      </ExpandableHeader>
      <TreePanel open={open}>
        <div className="border-t border-border px-4 py-3">
          <AnimatePresence mode="popLayout">
            {dept.levels.length === 0 && (
              <motion.p
                key="no-years"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mb-3 text-sm text-text-muted"
              >
                No {tp('gradeLevel').toLowerCase()} yet.
              </motion.p>
            )}
          </AnimatePresence>
          <motion.ul
            className="space-y-2"
            variants={reduceMotion ? undefined : listStagger}
            initial={reduceMotion ? false : 'hidden'}
            animate="visible"
          >
            <AnimatePresence mode="popLayout">
              {dept.levels.map((level) => (
                <motion.li
                  key={level.id}
                  layout={!reduceMotion}
                  variants={reduceMotion ? undefined : listItem}
                  exit={reduceMotion ? undefined : listItem.exit}
                >
                  <LevelNode
                    level={level}
                    deptId={dept.id}
                    canManage={canManage}
                    onRemove={() => setRemoveLevel(level)}
                    onChanged={onChanged}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
          {canManage && (
            <motion.div className="mt-3" layout={!reduceMotion}>
              <Button size="sm" variant="secondary" onClick={() => setAddYear(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add {t('gradeLevel').toLowerCase()}
              </Button>
            </motion.div>
          )}
        </div>
      </TreePanel>
      <Dialog open={addYear} onClose={() => setAddYear(false)} title={`Add ${t('gradeLevel').toLowerCase()}`}>
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
            <Button onClick={saveYear} loading={gradeMut.create.isPending || linkMut.create.isPending} disabled={!yearName.trim()}>
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
    </motion.div>
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
  const { t, tp } = useTerm();
  const [open, setOpen] = useState(false);
  const [addTerm, setAddTerm] = useState(false);
  const termMut = useAcademicMutations('academic-terms');
  const { data: years } = useAcademicYearOptions();
  const currentYear = years?.items?.find((y) => y.isCurrent) ?? years?.items?.[0];
  const [termName, setTermName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const reduceMotion = useReducedMotion();

  async function saveTerm() {
    if (!currentYear || !termName || !startDate || !endDate || !isEndAfterStart(startDate, endDate)) return;
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
    <div className="rounded-lg border border-border/80 bg-background-secondary/40 transition-colors duration-150 hover:border-border">
      <div className="flex items-center gap-2 px-3 py-2">
        <ExpandableHeader
          open={open}
          onToggle={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <TreeChevron open={open} className="[&_svg]:h-3.5 [&_svg]:w-3.5" />
          <span className="text-sm font-medium">{yearLabel}</span>
          <motion.span
            key={realTerms.length}
            initial={{ scale: 0.9, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-xs text-text-muted"
          >
            {realTerms.length} {tp('term').toLowerCase()}
          </motion.span>
        </ExpandableHeader>
        {canManage && (
          <motion.button
            type="button"
            aria-label={`Remove ${t('gradeLevel').toLowerCase()}`}
            onClick={onRemove}
            whileTap={reduceMotion ? undefined : { scale: 0.92 }}
            className="rounded p-1 text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </motion.button>
        )}
      </div>
      <TreePanel open={open}>
        <div className="border-t border-border/60 px-3 py-2 pl-8">
          <motion.div
            className="space-y-2"
            variants={reduceMotion ? undefined : listStagger}
            initial={reduceMotion ? false : 'hidden'}
            animate="visible"
          >
            <AnimatePresence mode="popLayout">
              {realTerms.map((term) => (
                <motion.div
                  key={term.id}
                  layout={!reduceMotion}
                  variants={reduceMotion ? undefined : listItem}
                  exit={reduceMotion ? undefined : listItem.exit}
                >
                  <TermNode term={term} level={level} canManage={canManage} onChanged={onChanged} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
          {canManage && (
            <motion.div layout={!reduceMotion} className="mt-2">
              <Button size="sm" variant="secondary" onClick={() => setAddTerm(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add {t('term').toLowerCase()}
              </Button>
            </motion.div>
          )}
        </div>
      </TreePanel>
      <Dialog open={addTerm} onClose={() => setAddTerm(false)} title={`Add ${t('term').toLowerCase()}`}>
        <div className="flex flex-col gap-3 p-5">
          <div>
            <Label>Name</Label>
            <Input value={termName} onChange={(e) => setTermName(e.target.value)} placeholder={`${t('term')} 1`} autoFocus />
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
            <Button onClick={saveTerm} loading={termMut.create.isPending} disabled={!termName || !isEndAfterStart(startDate, endDate)}>
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
  const { t, tp } = useTerm();
  const [addSection, setAddSection] = useState(false);
  const [addSubject, setAddSubject] = useState(false);
  const classMut = useAcademicMutations('classes');
  const curriculumMut = useAcademicMutations('programme-subjects');
  const { data: years } = useAcademicYearOptions();
  const { data: subjects } = useSubjectOptions();
  const { data: classes } = useClassOptions();
  const currentYear = years?.items?.find((y) => y.isCurrent) ?? years?.items?.[0];
  const [sectionChoice, setSectionChoice] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const reduceMotion = useReducedMotion();

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
      semesterSequence: term.sequence,
    });
    setSubjectId('');
    setAddSubject(false);
    onChanged();
  }

  async function dropSubject(id: string, version: number) {
    await curriculumMut.remove.mutateAsync({ id, version });
    onChanged();
  }

  return (
    <motion.div
      layout={!reduceMotion}
      className="rounded-md border border-border/50 bg-surface px-3 py-2 transition-colors duration-150 hover:border-border"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{term.name}</span>
        <motion.span
          key={`${term.subjects.length}-${term.sections.length}`}
          initial={{ scale: 0.9, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-xs text-text-muted"
        >
          {term.subjects.length} {tp('subject').toLowerCase()} · {term.sections.length}{' '}
          {tp('class').toLowerCase()}
        </motion.span>
      </div>

      {/* Curriculum — the subjects taught in this semester. Orphan (term-less) nodes can't hold
          curriculum, because a curriculum slot is keyed on the semester's sequence number. */}
      {!isOrphan && (
        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {tp('subject')}
          </p>
          <motion.ul className="mt-1 space-y-1 pl-2" variants={reduceMotion ? undefined : listStagger} initial="hidden" animate="visible">
            <AnimatePresence mode="popLayout">
              {term.subjects.length === 0 && (
                <motion.li
                  key="no-subjects"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-text-muted"
                >
                  No {tp('subject').toLowerCase()} yet.
                </motion.li>
              )}
              {term.subjects.map((s) => (
                <motion.li
                  key={s.id}
                  layout={!reduceMotion}
                  variants={reduceMotion ? undefined : listItem}
                  exit={reduceMotion ? undefined : listItem.exit}
                  className="group flex items-center gap-1.5 text-xs text-text-secondary"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {s.name}
                    <span className="ml-1 font-mono text-text-muted">{s.code}</span>
                    {s.credits != null && <span className="text-text-muted"> · {s.credits} cr</span>}
                    {s.isElective && <span className="text-text-muted"> · elective</span>}
                  </span>
                  {canManage && (
                    <motion.button
                      type="button"
                      aria-label={`Remove ${s.name}`}
                      onClick={() => dropSubject(s.id, s.version)}
                      whileTap={reduceMotion ? undefined : { scale: 0.92 }}
                      className="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </motion.button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
          {canManage && (
            <AnimatePresence mode="wait" initial={false}>
              {!addSubject ? (
                <motion.div key="add-subject-btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 h-7 px-2 text-xs"
                    onClick={() => setAddSubject(true)}
                    disabled={availableSubjects.length === 0}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {availableSubjects.length === 0
                      ? `All ${tp('subject').toLowerCase()} placed`
                      : `Add ${t('subject').toLowerCase()}`}
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="add-subject-form"
                  className="mt-2 flex gap-2 overflow-hidden"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: EASE }}
                >
                  <Select
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    placeholder={`Pick a ${t('subject').toLowerCase()}…`}
                    options={availableSubjects.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
                    className="h-8 text-sm"
                  />
                  <Button size="sm" onClick={saveSubject} loading={curriculumMut.create.isPending} disabled={!subjectId}>
                    Add
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAddSubject(false)}>
                    Cancel
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      )}

      <div className="mt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          {tp('class')}
        </p>
        <motion.ul className="mt-1 space-y-1 pl-2" variants={reduceMotion ? undefined : listStagger} initial="hidden" animate="visible">
          <AnimatePresence mode="popLayout">
            {term.sections.length === 0 && (
              <motion.li
                key="no-sections"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-text-muted"
              >
                No {tp('class').toLowerCase()} yet.
              </motion.li>
            )}
            {term.sections.map((s) => (
              <motion.li
                key={s.id}
                layout={!reduceMotion}
                variants={reduceMotion ? undefined : listItem}
                exit={reduceMotion ? undefined : listItem.exit}
                className="text-xs text-text-secondary"
              >
                {s.name}
                {s.section ? ` · ${s.section}` : ''}
                {s.studentCount != null && (
                  <span className="text-text-muted"> · {s.studentCount} students</span>
                )}
                {s.subjectCount != null && (
                  <span className="text-text-muted">
                    {' '}
                    · {s.subjectCount} {tp('subject').toLowerCase()}
                  </span>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
        {canManage && (
          <AnimatePresence mode="wait" initial={false}>
            {!addSection ? (
              <motion.div
                key="add-btn"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={() => setAddSection(true)}>
                  <Plus className="mr-1 h-3 w-3" /> Add {t('class').toLowerCase()}
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="add-form"
                className="mt-2 flex gap-2 overflow-hidden"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
              >
                <Select
                  value={sectionChoice}
                  onChange={(e) => setSectionChoice(e.target.value)}
                  placeholder={`Pick a ${t('class').toLowerCase()}…`}
                  options={sectionOptions}
                  className="h-8 text-sm"
                />
                {creatingSection && (
                  <Input
                    value={sectionName}
                    onChange={(e) => setSectionName(e.target.value)}
                    placeholder={`${t('class')} name`}
                    className="h-8 text-sm"
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
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
