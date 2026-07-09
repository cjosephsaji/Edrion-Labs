'use client';
import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Label, Select, Skeleton } from '@edrion/ui';
import { usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import { PortalClientError } from '@/lib/portal-client';
import {
  OPTION_QTYPES,
  QUESTION_TYPE_OPTIONS,
  defaultOptionsForType,
  nextOptionKey,
  type QuestionDraft,
  type QuestionOption,
  type QuestionRow,
  type QuestionType,
} from '@/lib/question-types';

function needsTextAnswerKey(qtype: QuestionType): boolean {
  return qtype === 'fill_blank' || qtype === 'numeric' || qtype === 'short_answer' || qtype === 'long_answer';
}

function rowToDraft(row: QuestionRow): QuestionDraft {
  return {
    qtype: row.qtype,
    prompt: row.prompt,
    promptImageObjectId: row.promptImageObjectId,
    options: row.options ?? undefined,
    correctKey: row.correctKey,
    markingNote: row.markingNote,
    marks: row.marks,
    sequence: row.sequence,
  };
}

function emptyDraft(sequence: number): QuestionDraft {
  return {
    qtype: 'mcq_single',
    prompt: '',
    options: defaultOptionsForType('mcq_single'),
    marks: 1,
    sequence,
  };
}

function ImageUploadButton({
  label,
  objectId,
  uploadPath,
  onUploaded,
}: {
  label: string;
  objectId?: string | null;
  uploadPath: string;
  onUploaded: (objectId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const client = usePortalClient();
  const { scope } = useScope();
  const [uploading, setUploading] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const res = await client.upload<{ objectId: string }>(
        `${uploadPath}?filename=${encodeURIComponent(file.name)}`,
        scope,
        file,
      );
      onUploaded(res.objectId);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <Button type="button" size="sm" variant="secondary" loading={uploading} onClick={() => inputRef.current?.click()}>
        <ImagePlus className="h-4 w-4" />
        {label}
      </Button>
      {objectId && <span className="text-xs text-text-muted">Image attached</span>}
    </div>
  );
}

function QuestionForm({
  draft,
  onChange,
  uploadPath,
  saving,
  onSave,
  onCancel,
  saveLabel,
}: {
  draft: QuestionDraft;
  onChange: (d: QuestionDraft) => void;
  uploadPath: string;
  saving: boolean;
  onSave: () => void;
  onCancel?: () => void;
  saveLabel: string;
}) {
  const showOptions = OPTION_QTYPES.has(draft.qtype);
  const options = draft.options ?? defaultOptionsForType(draft.qtype);
  const multiCorrect = draft.qtype === 'mcq_multi';
  const selectedMulti = new Set((draft.correctKey ?? '').split(',').map((k) => k.trim()).filter(Boolean));

  function setType(qtype: QuestionType) {
    const next: QuestionDraft = { ...draft, qtype, correctKey: null };
    if (OPTION_QTYPES.has(qtype)) next.options = defaultOptionsForType(qtype);
    else delete next.options;
    onChange(next);
  }

  function updateOption(idx: number, patch: Partial<QuestionOption>) {
    const next = options.map((o, i) => (i === idx ? { ...o, ...patch } : o));
    onChange({ ...draft, options: next });
  }

  function addOption() {
    onChange({ ...draft, options: [...options, { key: nextOptionKey(options), label: '' }] });
  }

  function removeOption(idx: number) {
    if (options.length <= 2) return;
    const removed = options[idx]!.key;
    const next = options.filter((_, i) => i !== idx);
    let correctKey = draft.correctKey;
    if (multiCorrect) {
      const keys = selectedMulti;
      keys.delete(removed);
      correctKey = [...keys].join(',') || null;
    } else if (correctKey === removed) {
      correctKey = null;
    }
    onChange({ ...draft, options: next, correctKey });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Type</Label>
          <Select
            value={draft.qtype}
            onChange={(e) => setType(e.target.value as QuestionType)}
            options={QUESTION_TYPE_OPTIONS}
          />
        </div>
        <div>
          <Label>Sequence</Label>
          <Input
            type="number"
            min={1}
            value={draft.sequence}
            onChange={(e) => onChange({ ...draft, sequence: Number(e.target.value) || 1 })}
          />
        </div>
        <div>
          <Label>Marks</Label>
          <Input
            type="number"
            min={0}
            value={draft.marks}
            onChange={(e) => onChange({ ...draft, marks: Number(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div>
        <Label>Prompt</Label>
        <Input
          value={draft.prompt}
          onChange={(e) => onChange({ ...draft, prompt: e.target.value })}
          placeholder="Question text (LaTeX supported)"
        />
        <div className="mt-2">
          <ImageUploadButton
            label="Prompt image"
            objectId={draft.promptImageObjectId}
            uploadPath={uploadPath}
            onUploaded={(objectId) => onChange({ ...draft, promptImageObjectId: objectId })}
          />
        </div>
      </div>

      {showOptions && (
        <div className="flex flex-col gap-2">
          <Label>Options</Label>
          {options.map((opt, idx) => (
            <div key={opt.key} className="rounded-md border border-border p-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-text-secondary">Option {opt.key}</span>
                {options.length > 2 && draft.qtype !== 'true_false' && (
                  <button type="button" onClick={() => removeOption(idx)} className="text-text-muted hover:text-danger">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Input
                value={opt.label}
                onChange={(e) => updateOption(idx, { label: e.target.value })}
                placeholder="Option text"
                disabled={draft.qtype === 'true_false'}
              />
              {draft.qtype !== 'true_false' && (
                <div className="mt-2">
                  <ImageUploadButton
                    label="Option image"
                    objectId={opt.imageObjectId}
                    uploadPath={uploadPath}
                    onUploaded={(objectId) => updateOption(idx, { imageObjectId: objectId })}
                  />
                </div>
              )}
            </div>
          ))}
          {draft.qtype !== 'true_false' && (
            <Button type="button" size="sm" variant="secondary" onClick={addOption}>
              <Plus className="h-4 w-4" />
              Add option
            </Button>
          )}
        </div>
      )}

      <div>
        <Label>Answer key</Label>
        {showOptions && !multiCorrect && (
          <Select
            value={draft.correctKey ?? ''}
            onChange={(e) => onChange({ ...draft, correctKey: e.target.value || null })}
            placeholder="Correct option…"
            options={options.map((o) => ({ value: o.key, label: `${o.key}: ${o.label || '(empty)'}` }))}
          />
        )}
        {showOptions && multiCorrect && (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => {
              const checked = selectedMulti.has(o.key);
              return (
                <label key={o.key} className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const keys = new Set(selectedMulti);
                      if (checked) keys.delete(o.key);
                      else keys.add(o.key);
                      onChange({ ...draft, correctKey: [...keys].join(',') || null });
                    }}
                  />
                  {o.key}
                </label>
              );
            })}
          </div>
        )}
        {needsTextAnswerKey(draft.qtype) && (
          <Input
            value={draft.correctKey ?? ''}
            onChange={(e) => onChange({ ...draft, correctKey: e.target.value || null })}
            placeholder={draft.qtype === 'numeric' ? 'Expected number' : 'Expected answer'}
          />
        )}
        {draft.qtype === 'long_answer' && (
          <p className="mt-1 text-xs text-text-muted">Long answers are manually graded; the key is optional guidance.</p>
        )}
      </div>

      <div>
        <Label>Marking note</Label>
        <Input
          value={draft.markingNote ?? ''}
          onChange={(e) => onChange({ ...draft, markingNote: e.target.value || null })}
          placeholder="Optional guidance for graders"
        />
      </div>

      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={onSave} loading={saving} disabled={!draft.prompt.trim()}>
          {saveLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

export interface QuestionEditorMutations {
  create: { mutateAsync: (body: QuestionDraft) => Promise<unknown>; isPending: boolean };
  update: { mutateAsync: (args: { id: string; body: QuestionDraft & { version: number } }) => Promise<unknown>; isPending: boolean };
  remove: { mutateAsync: (args: { id: string; version: number }) => Promise<unknown>; isPending: boolean };
}

export function QuestionEditorBody({
  questions,
  isLoading,
  uploadPath,
  mutations,
}: {
  questions: QuestionRow[] | undefined;
  isLoading: boolean;
  uploadPath: string;
  mutations: QuestionEditorMutations;
}) {
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<QuestionDraft>(() => emptyDraft(1));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<QuestionDraft | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const list = questions ?? [];
  const nextSequence = list.length > 0 ? Math.max(...list.map((q) => q.sequence)) + 1 : 1;

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveNew() {
    setError(null);
    try {
      await mutations.create.mutateAsync(newDraft);
      setAdding(false);
      setNewDraft(emptyDraft(nextSequence + 1));
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not add the question.');
    }
  }

  async function saveEdit(id: string, version: number) {
    if (!editDraft) return;
    setError(null);
    try {
      await mutations.update.mutateAsync({ id, body: { ...editDraft, version } });
      setEditingId(null);
      setEditDraft(null);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not update the question.');
    }
  }

  async function drop(id: string, version: number) {
    setError(null);
    try {
      await mutations.remove.mutateAsync({ id, version });
      if (editingId === id) {
        setEditingId(null);
        setEditDraft(null);
      }
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not remove the question.');
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 py-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {list.length === 0 && !adding ? (
        <p className="text-sm text-text-muted">No questions yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((q) => {
            const open = expanded.has(q.id);
            const editing = editingId === q.id;
            return (
              <li key={q.id} className="rounded-md border border-border bg-background-secondary/30">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(q.id)}
                    className="text-text-muted hover:text-text-primary"
                    aria-label={open ? 'Collapse' : 'Expand'}
                  >
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => toggleExpanded(q.id)}>
                    <p className="truncate text-sm font-medium text-text-primary">
                      Q{q.sequence} · {QUESTION_TYPE_OPTIONS.find((o) => o.value === q.qtype)?.label ?? q.qtype}
                    </p>
                    <p className="truncate text-xs text-text-muted">{q.prompt}</p>
                  </button>
                  <span className="shrink-0 text-xs tabular-nums text-text-muted">{q.marks}m</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (editing) {
                        setEditingId(null);
                        setEditDraft(null);
                      } else {
                        setEditingId(q.id);
                        setEditDraft(rowToDraft(q));
                        setExpanded((prev) => new Set(prev).add(q.id));
                      }
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    {editing ? 'Close' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    aria-label="Remove question"
                    onClick={() => void drop(q.id, q.version)}
                    className="rounded-md p-1 text-text-muted hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {open && (
                  <div className="border-t border-border px-3 py-3">
                    {editing && editDraft ? (
                      <QuestionForm
                        draft={editDraft}
                        onChange={setEditDraft}
                        uploadPath={uploadPath}
                        saving={mutations.update.isPending}
                        onSave={() => void saveEdit(q.id, q.version)}
                        onCancel={() => {
                          setEditingId(null);
                          setEditDraft(null);
                        }}
                        saveLabel="Save changes"
                      />
                    ) : (
                      <p className="text-sm text-text-secondary">{q.prompt}</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <div className="rounded-md border border-border p-3">
          <QuestionForm
            draft={newDraft}
            onChange={setNewDraft}
            uploadPath={uploadPath}
            saving={mutations.create.isPending}
            onSave={() => void saveNew()}
            onCancel={() => setAdding(false)}
            saveLabel="Add question"
          />
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setAdding(true);
            setNewDraft(emptyDraft(nextSequence));
          }}
        >
          <Plus className="h-4 w-4" />
          Add question
        </Button>
      )}
    </div>
  );
}
