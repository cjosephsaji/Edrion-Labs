'use client';
import { useMemo, useState } from 'react';
import { Search, X, Users2, Save } from 'lucide-react';
import { Button } from '@edrion/ui';
import { useStudentOptions, useParentOptions, useTeachingStaffOptions, useStaffOptions } from '@/lib/people';
import { useClassOptions, useGradeLevelOptions, useDepartmentOptions, useSubjectOptions } from '@/lib/academics';
import { useScope } from '@/lib/scope';
import {
  useRecipientPreview,
  useRecipientGroups,
  useRecipientGroupMutations,
  type Target,
} from '@/lib/recipients';
import { formatPersonName } from '@/lib/person-name';
import { useTerm } from '@/lib/term';

type TabKey =
  | 'broadcast'
  | 'students'
  | 'parents'
  | 'teachers'
  | 'staff'
  | 'classes'
  | 'grades'
  | 'departments'
  | 'subjects'
  | 'campuses'
  | 'groups';

const PREFIX: Record<string, string> = {
  parents_of_class: 'Parents of',
  parents_of_grade: 'Parents of',
  parents_of_department: 'Parents of',
  teachers_of_class: 'Teachers of',
  teachers_of_grade: 'Teachers of',
  teachers_of_department: 'Teachers of',
  students_of_class: 'Students of',
  students_of_grade: 'Students of',
  students_of_department: 'Students of',
  students_of_subject: 'Students of',
};

const key = (t: Target) => `${t.kind}:${t.refId ?? ''}`;
const name = (p: { firstName: string; middleName?: string | null; lastName: string }) => formatPersonName(p);

/**
 * The recipient targeting control (admin-redesign Phase 3). Compose a target list from individuals,
 * classes/grades/departments/subjects/campuses (with derived students/parents/teachers actions),
 * broadcasts and saved groups; shows a live recipient count + sample before sending, and can save the
 * current selection as a reusable group. Emits `Target[]` for the API.
 */
export function RecipientPicker({
  value,
  onChange,
  studentsOnly = false,
}: {
  value: Target[];
  onChange: (targets: Target[]) => void;
  studentsOnly?: boolean;
}) {
  const { tp } = useTerm();
  const broadcastLabel: Record<string, string> = useMemo(
    () => ({
      all: 'Everyone',
      all_students: `All ${tp('student').toLowerCase()}`,
      all_parents: 'All parents',
      all_teachers: `All ${tp('teacher').toLowerCase()}`,
      all_staff: `All ${tp('staff').toLowerCase()}`,
    }),
    [tp],
  );
  const tabs: { key: TabKey; label: string }[] = useMemo(
    () => {
      const all: { key: TabKey; label: string }[] = [
        { key: 'broadcast', label: 'Broadcast' },
        { key: 'students', label: tp('student') },
        { key: 'parents', label: 'Parents' },
        { key: 'teachers', label: tp('teacher') },
        { key: 'staff', label: tp('staff') },
        { key: 'classes', label: tp('class') },
        { key: 'grades', label: tp('gradeLevel') },
        { key: 'departments', label: tp('department') },
        { key: 'subjects', label: tp('subject') },
        { key: 'campuses', label: 'Campuses' },
        { key: 'groups', label: 'Saved groups' },
      ];
      if (!studentsOnly) return all;
      const keep = new Set<TabKey>(['broadcast', 'students', 'classes', 'grades', 'departments', 'campuses', 'groups']);
      return all.filter((t) => keep.has(t.key));
    },
    [tp, studentsOnly],
  );
  const [tab, setTab] = useState<TabKey>('broadcast');
  const [q, setQ] = useState('');
  const [groupName, setGroupName] = useState('');
  const [saving, setSaving] = useState(false);

  const students = useStudentOptions();
  const parents = useParentOptions();
  const teachers = useTeachingStaffOptions();
  const staff = useStaffOptions();
  const classes = useClassOptions();
  const grades = useGradeLevelOptions();
  const departments = useDepartmentOptions();
  const subjects = useSubjectOptions();
  const { campuses } = useScope();
  const groups = useRecipientGroups();
  const groupMut = useRecipientGroupMutations();

  const preview = useRecipientPreview(value);

  const broadcastEntries = useMemo(
    () =>
      studentsOnly
        ? Object.entries(broadcastLabel).filter(([kind]) => kind === 'all_students')
        : Object.entries(broadcastLabel),
    [broadcastLabel, studentsOnly],
  );

  const selected = useMemo(() => new Set(value.map(key)), [value]);
  const add = (t: Target) => {
    if (selected.has(key(t))) return;
    onChange([...value, t]);
  };
  const remove = (t: Target) => onChange(value.filter((x) => key(x) !== key(t)));

  // Label maps for rendering chips.
  const labelMaps = useMemo(() => {
    const m: Record<string, Map<string, string>> = {
      student: new Map((students.data?.items ?? []).map((s) => [s.id, name(s)])),
      parent: new Map((parents.data?.items ?? []).map((p) => [p.id, name(p)])),
      teacher: new Map((teachers.data ?? []).map((t) => [t.id, name(t)])),
      staff: new Map((staff.data?.items ?? []).map((s) => [s.id, name(s)])),
      class: new Map((classes.data?.items ?? []).map((c) => [c.id, c.name])),
      grade: new Map((grades.data?.items ?? []).map((g) => [g.id, g.name])),
      department: new Map((departments.data?.items ?? []).map((d) => [d.id, d.name])),
      subject: new Map((subjects.data?.items ?? []).map((s) => [s.id, s.name])),
      campus: new Map(campuses.map((c) => [c.id, c.name])),
      group: new Map((groups.data?.items ?? []).map((g) => [g.id, g.name])),
    };
    return m;
  }, [students.data, parents.data, teachers.data, staff.data, classes.data, grades.data, departments.data, subjects.data, campuses, groups.data]);

  const chipLabel = (target: Target): string => {
    const broadcast = broadcastLabel[target.kind];
    if (broadcast) return broadcast;
    const anchor = target.kind.includes('class')
      ? 'class'
      : target.kind.includes('grade')
        ? 'grade'
        : target.kind.includes('department')
          ? 'department'
          : target.kind.includes('subject')
            ? 'subject'
            : target.kind === 'campus'
              ? 'campus'
              : target.kind;
    const resolved = target.refId ? labelMaps[anchor]?.get(target.refId) : undefined;
    const entityName = resolved ?? target.refId ?? target.kind;
    const prefix = PREFIX[target.kind];
    return prefix ? `${prefix} ${entityName}` : entityName;
  };

  const filtered = <T extends { id: string }>(items: T[] | undefined, toText: (x: T) => string) =>
    (items ?? []).filter((x) => !q || toText(x).toLowerCase().includes(q.toLowerCase()));

  async function saveGroup() {
    if (!groupName.trim() || value.length === 0) return;
    setSaving(true);
    try {
      await groupMut.create.mutateAsync({ name: groupName.trim(), members: value });
      setGroupName('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Selected chips + live count */}
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-text-muted">Recipients</span>
          <span className="text-sm font-medium text-text-primary">
            {value.length === 0 ? 'None selected' : preview.isLoading ? 'Counting…' : `${preview.data?.count ?? 0} recipients`}
          </span>
        </div>
        {value.length === 0 ? (
          <p className="text-sm text-text-muted">Add students, classes, groups or a broadcast below.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {value.map((t) => (
              <span key={key(t)} className="inline-flex items-center gap-1 rounded-full bg-background-secondary px-2 py-0.5 text-xs text-text-secondary">
                {chipLabel(t)}
                <button type="button" aria-label="Remove" onClick={() => remove(t)} className="text-text-muted hover:text-danger">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {value.length > 0 && preview.data && preview.data.sample.length > 0 && (
          <p className="mt-2 truncate text-xs text-text-muted">e.g. {preview.data.sample.slice(0, 5).join(', ')}{preview.data.count > 5 ? '…' : ''}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            type="button"
            onClick={() => { setTab(tabItem.key); setQ(''); }}
            className={
              'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
              (tab === tabItem.key ? 'bg-primary text-primary-foreground' : 'bg-background-secondary text-text-secondary hover:text-text-primary')
            }
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* Search (not for broadcast) */}
      {tab !== 'broadcast' && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${tab}…`}
            className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-border-strong"
          />
        </div>
      )}

      {/* Option list */}
      <div className="max-h-60 overflow-y-auto rounded-md border border-border">
        {tab === 'broadcast' && (
          <div className="flex flex-col">
            {broadcastEntries.map(([kind, lbl]) => (
              <Row key={kind} label={lbl} onAdd={() => add({ kind })} added={selected.has(key({ kind }))} />
            ))}
          </div>
        )}
        {tab === 'students' && filtered(students.data?.items, name).map((s) => (
          <Row key={s.id} label={name(s)} sub={s.admissionNo} onAdd={() => add({ kind: 'student', refId: s.id })} added={selected.has(`student:${s.id}`)} />
        ))}
        {tab === 'parents' && filtered(parents.data?.items, name).map((p) => (
          <Row key={p.id} label={name(p)} sub={p.phone ?? undefined} onAdd={() => add({ kind: 'parent', refId: p.id })} added={selected.has(`parent:${p.id}`)} />
        ))}
        {tab === 'teachers' && filtered(teachers.data, name).map((t) => (
          <Row key={t.id} label={name(t)} sub={t.designation ?? undefined} onAdd={() => add({ kind: 'teacher', refId: t.id })} added={selected.has(`teacher:${t.id}`)} />
        ))}
        {tab === 'staff' && filtered(staff.data?.items, name).map((s) => (
          <Row key={s.id} label={name(s)} sub={s.designation ?? undefined} onAdd={() => add({ kind: 'staff', refId: s.id })} added={selected.has(`staff:${s.id}`)} />
        ))}
        {tab === 'classes' && filtered(classes.data?.items, (c) => c.name).map((c) => (
          <DerivedRow
            key={c.id}
            label={c.name}
            actions={
              studentsOnly
                ? [{ label: tp('student'), target: { kind: 'students_of_class', refId: c.id } }]
                : [
                    { label: tp('student'), target: { kind: 'students_of_class', refId: c.id } },
                    { label: 'Parents', target: { kind: 'parents_of_class', refId: c.id } },
                    { label: tp('teacher'), target: { kind: 'teachers_of_class', refId: c.id } },
                  ]
            }
            selected={selected}
            onAdd={add}
          />
        ))}
        {tab === 'grades' && filtered(grades.data?.items, (g) => g.name).map((g) => (
          <DerivedRow
            key={g.id}
            label={g.name}
            actions={
              studentsOnly
                ? [{ label: tp('student'), target: { kind: 'students_of_grade', refId: g.id } }]
                : [
                    { label: tp('student'), target: { kind: 'students_of_grade', refId: g.id } },
                    { label: 'Parents', target: { kind: 'parents_of_grade', refId: g.id } },
                    { label: tp('teacher'), target: { kind: 'teachers_of_grade', refId: g.id } },
                  ]
            }
            selected={selected}
            onAdd={add}
          />
        ))}
        {tab === 'departments' && filtered(departments.data?.items, (d) => d.name).map((d) => (
          <DerivedRow
            key={d.id}
            label={d.name}
            actions={
              studentsOnly
                ? [{ label: tp('student'), target: { kind: 'students_of_department', refId: d.id } }]
                : [
                    { label: tp('student'), target: { kind: 'students_of_department', refId: d.id } },
                    { label: tp('teacher'), target: { kind: 'teachers_of_department', refId: d.id } },
                  ]
            }
            selected={selected}
            onAdd={add}
          />
        ))}
        {tab === 'subjects' && filtered(subjects.data?.items, (s) => s.name).map((s) => (
          <DerivedRow key={s.id} label={s.name} actions={[
            { label: tp('student'), target: { kind: 'students_of_subject', refId: s.id } },
          ]} selected={selected} onAdd={add} />
        ))}
        {tab === 'campuses' && campuses.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())).map((c) => (
          <Row key={c.id} label={c.name} sub="Everyone at campus" onAdd={() => add({ kind: 'campus', refId: c.id })} added={selected.has(`campus:${c.id}`)} />
        ))}
        {tab === 'groups' && filtered(groups.data?.items, (g) => g.name).map((g) => (
          <Row key={g.id} label={g.name} sub={`${g.members.length} target(s)`} onAdd={() => add({ kind: 'group', refId: g.id })} added={selected.has(`group:${g.id}`)} />
        ))}
      </div>

      {/* Save as group */}
      {value.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Users2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Save this selection as a group…"
              className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-border-strong"
            />
          </div>
          <Button size="sm" variant="secondary" onClick={saveGroup} disabled={!groupName.trim() || saving} loading={saving}>
            <Save className="h-4 w-4" />
            Save group
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({ label, sub, onAdd, added }: { label: string; sub?: string; onAdd: () => void; added: boolean }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={added}
      className="flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-background-secondary disabled:opacity-50"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-text-primary">{label}</span>
        {sub && <span className="truncate text-xs text-text-muted">{sub}</span>}
      </span>
      <span className="text-xs text-text-muted">{added ? 'Added' : 'Add'}</span>
    </button>
  );
}

function DerivedRow({
  label,
  actions,
  selected,
  onAdd,
}: {
  label: string;
  actions: { label: string; target: Target }[];
  selected: Set<string>;
  onAdd: (t: Target) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm last:border-b-0">
      <span className="truncate font-medium text-text-primary">{label}</span>
      <span className="flex shrink-0 gap-1">
        {actions.map((a) => {
          const added = selected.has(`${a.target.kind}:${a.target.refId ?? ''}`);
          return (
            <button
              key={a.label}
              type="button"
              onClick={() => onAdd(a.target)}
              disabled={added}
              className={
                'rounded-full px-2 py-0.5 text-xs transition-colors ' +
                (added ? 'bg-primary/10 text-primary' : 'bg-background-secondary text-text-secondary hover:text-text-primary')
              }
            >
              {a.label}
            </button>
          );
        })}
      </span>
    </div>
  );
}
