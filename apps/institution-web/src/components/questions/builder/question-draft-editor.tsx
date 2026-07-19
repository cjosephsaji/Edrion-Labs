'use client';
import { useRef, useState } from 'react';
import { FilePlus, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { Button, Combobox, Input, Label, cn } from '@edrion/ui';
import { DragHandle, moveItem, setRowDragImage } from '@/components/common/drag-handle';
import { CodeEditor } from '@/components/questions/builder/code-editor';
import { usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import {
  CODE_LANGUAGE_OPTIONS,
  OPTION_QTYPES,
  QUESTION_TYPE_OPTIONS,
  defaultConfigForType,
  defaultOptionsForType,
  nextOptionKey,
  type QuestionDraft,
  type QuestionOption,
  type QuestionType,
} from '@/lib/question-types';

function FileUploadButton({
  label,
  objectId,
  uploadPath,
  accept = '*/*',
  onUploaded,
}: {
  label: string;
  objectId?: string | null;
  uploadPath: string;
  accept?: string;
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
        accept={accept}
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <Button type="button" size="sm" variant="secondary" loading={uploading} onClick={() => inputRef.current?.click()}>
        {accept.startsWith('image') ? <ImagePlus className="h-4 w-4" /> : <FilePlus className="h-4 w-4" />}
        {label}
      </Button>
      {objectId && <span className="text-xs text-text-muted">File attached</span>}
    </div>
  );
}

/** Inline authoring form for one question draft (no per-question network save). */
export function QuestionDraftEditor({
  draft,
  onChange,
  uploadPath,
}: {
  draft: QuestionDraft;
  onChange: (d: QuestionDraft) => void;
  uploadPath: string;
}) {
  const showOptions = OPTION_QTYPES.has(draft.qtype);
  const options = draft.options ?? defaultOptionsForType(draft.qtype);
  const multiCorrect = draft.qtype === 'mcq_multi';
  const selectedMulti = new Set((draft.correctKey ?? '').split(',').map((k) => k.trim()).filter(Boolean));
  const needsTextKey =
    draft.qtype === 'fill_blank' ||
    draft.qtype === 'numeric' ||
    draft.qtype === 'short_answer' ||
    draft.qtype === 'long_answer';

  function setType(qtype: QuestionType) {
    const next: QuestionDraft = {
      ...draft,
      qtype,
      correctKey: null,
      options: OPTION_QTYPES.has(qtype) ? defaultOptionsForType(qtype) : undefined,
      config: defaultConfigForType(qtype),
    };
    onChange(next);
  }

  function updateOption(idx: number, patch: Partial<QuestionOption>) {
    onChange({ ...draft, options: options.map((o, i) => (i === idx ? { ...o, ...patch } : o)) });
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

  const matching = draft.config?.matching;
  const codeCfg = draft.config?.code;
  const [optDragIdx, setOptDragIdx] = useState<number | null>(null);
  const [optOverIdx, setOptOverIdx] = useState<number | null>(null);
  const optRowRefs = useRef<(HTMLDivElement | null)[]>([]);

  function clearOptDrag() {
    setOptDragIdx(null);
    setOptOverIdx(null);
  }

  function dropOption(toIdx: number) {
    if (optDragIdx == null) {
      clearOptDrag();
      return;
    }
    if (optDragIdx !== toIdx) {
      onChange({ ...draft, options: moveItem(options, optDragIdx, toIdx) });
    }
    clearOptDrag();
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Type</Label>
          <Combobox
            value={draft.qtype}
            onChange={(v) => setType(v as QuestionType)}
            options={QUESTION_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label, hint: o.group }))}
            placeholder="Question type…"
            searchPlaceholder="Search types…"
          />
        </div>
        <div>
          <Label htmlFor={`marks-${draft.clientKey ?? 'q'}`}>Marks</Label>
          <Input
            id={`marks-${draft.clientKey ?? 'q'}`}
            type="number"
            min={0}
            max={1000}
            value={draft.marks}
            onChange={(e) => onChange({ ...draft, marks: Number(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div>
        <Label htmlFor={`prompt-${draft.clientKey ?? 'q'}`}>Prompt</Label>
        <textarea
          id={`prompt-${draft.clientKey ?? 'q'}`}
          className="min-h-[72px] w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-strong"
          value={draft.prompt}
          onChange={(e) => onChange({ ...draft, prompt: e.target.value })}
          placeholder="Question text (supports $LaTeX$)"
        />
      </div>

      <FileUploadButton
        label="Attach file"
        objectId={draft.promptImageObjectId}
        uploadPath={uploadPath}
        accept="image/*,.pdf,.doc,.docx,.txt,.zip"
        onUploaded={(objectId) => onChange({ ...draft, promptImageObjectId: objectId })}
      />

      {showOptions && (
        <div className="flex flex-col gap-2">
          <Label>Options</Label>
          {options.map((opt, idx) => (
            <div
              key={opt.key}
              ref={(el) => {
                optRowRefs.current[idx] = el;
              }}
              className={cn(
                'flex items-center gap-1 rounded-md border border-transparent px-0.5 transition-[opacity,border-color]',
                optDragIdx === idx && 'opacity-40',
                optOverIdx === idx && optDragIdx !== null && optDragIdx !== idx && 'border-primary',
              )}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (optOverIdx !== idx) setOptOverIdx(idx);
              }}
              onDragLeave={() => {
                if (optOverIdx === idx) setOptOverIdx(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropOption(idx);
              }}
            >
              {draft.qtype !== 'true_false' ? (
                <DragHandle
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(idx));
                    setRowDragImage(e, optRowRefs.current[idx]);
                    setOptDragIdx(idx);
                  }}
                  onDragEnd={clearOptDrag}
                />
              ) : (
                <span className="w-7" />
              )}
              <span className="w-6 text-xs font-medium text-text-muted">{opt.key}</span>
              <Input
                value={opt.label}
                onChange={(e) => updateOption(idx, { label: e.target.value })}
                placeholder="Option text"
                className="flex-1"
              />
              {multiCorrect ? (
                <input
                  type="checkbox"
                  checked={selectedMulti.has(opt.key)}
                  onChange={(e) => {
                    const next = new Set(selectedMulti);
                    if (e.target.checked) next.add(opt.key);
                    else next.delete(opt.key);
                    onChange({ ...draft, correctKey: [...next].join(',') || null });
                  }}
                  aria-label={`Correct ${opt.key}`}
                />
              ) : (
                <input
                  type="radio"
                  name={`correct-${draft.clientKey ?? 'q'}`}
                  checked={draft.correctKey === opt.key}
                  onChange={() => onChange({ ...draft, correctKey: opt.key })}
                  aria-label={`Correct ${opt.key}`}
                />
              )}
              <FileUploadButton
                label=""
                objectId={opt.imageObjectId}
                uploadPath={uploadPath}
                accept="image/*"
                onUploaded={(objectId) => updateOption(idx, { imageObjectId: objectId })}
              />
              <Button type="button" size="sm" variant="ghost" onClick={() => removeOption(idx)} disabled={options.length <= 2}>
                <Trash2 className="h-4 w-4" />
              </Button>
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

      {needsTextKey && (
        <div>
          <Label htmlFor={`key-${draft.clientKey ?? 'q'}`}>
            {draft.qtype === 'numeric' ? 'Correct number' : 'Answer key (optional)'}
          </Label>
          <Input
            id={`key-${draft.clientKey ?? 'q'}`}
            value={draft.correctKey ?? ''}
            onChange={(e) => onChange({ ...draft, correctKey: e.target.value || null })}
            placeholder={draft.qtype === 'numeric' ? 'e.g. 42' : 'Expected answer'}
          />
          {draft.qtype === 'numeric' && (
            <div className="mt-2">
              <Label htmlFor={`tol-${draft.clientKey ?? 'q'}`}>Tolerance</Label>
              <Input
                id={`tol-${draft.clientKey ?? 'q'}`}
                type="number"
                step="0.01"
                min={0}
                value={draft.config?.numeric?.tolerance ?? 0.01}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    config: { ...draft.config, numeric: { tolerance: Number(e.target.value) || 0 } },
                  })
                }
              />
            </div>
          )}
        </div>
      )}

      {draft.qtype === 'matching' && matching && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label>Left column</Label>
            {matching.left.map((item, idx) => (
              <Input
                key={item.key}
                value={item.label}
                onChange={(e) => {
                  const left = matching.left.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x));
                  onChange({ ...draft, config: { ...draft.config, matching: { ...matching, left } } });
                }}
                placeholder={`Left ${idx + 1}`}
              />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Label>Right column</Label>
            {matching.right.map((item, idx) => (
              <Input
                key={item.key}
                value={item.label}
                onChange={(e) => {
                  const right = matching.right.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x));
                  onChange({ ...draft, config: { ...draft.config, matching: { ...matching, right } } });
                }}
                placeholder={`Right ${idx + 1}`}
              />
            ))}
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label>Answer key (left → right)</Label>
            {matching.left.map((left) => (
              <div key={left.key} className="flex items-center gap-2">
                <span className="w-24 truncate text-xs text-text-muted">{left.label || left.key}</span>
                <Combobox
                  value={matching.answerKey?.[left.key] ?? ''}
                  onChange={(v) =>
                    onChange({
                      ...draft,
                      config: {
                        ...draft.config,
                        matching: {
                          ...matching,
                          answerKey: { ...(matching.answerKey ?? {}), [left.key]: v },
                        },
                      },
                      correctKey: JSON.stringify({
                        ...(matching.answerKey ?? {}),
                        [left.key]: v,
                      }),
                    })
                  }
                  options={matching.right.map((r) => ({ value: r.key, label: r.label || r.key }))}
                  placeholder="Match…"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {draft.qtype === 'file_upload' && (
        <p className="text-xs text-text-muted">
          Students upload a file as their answer. Optional constraints can be set later; grading is manual.
        </p>
      )}

      {draft.qtype === 'code' && codeCfg && (
        <div className="flex flex-col gap-2">
          <div>
            <Label>Language</Label>
            <Combobox
              value={codeCfg.languages[0] ?? 'python'}
              onChange={(v) =>
                onChange({
                  ...draft,
                  config: {
                    ...draft.config,
                    code: { ...codeCfg, languages: [v as (typeof CODE_LANGUAGE_OPTIONS)[number]['value']] },
                  },
                })
              }
              options={CODE_LANGUAGE_OPTIONS}
              placeholder="Language…"
            />
          </div>
          <div>
            <Label htmlFor={`starter-${draft.clientKey ?? 'q'}`}>Starter code</Label>
            <CodeEditor
              value={codeCfg.starterCode ?? ''}
              language={codeCfg.languages[0] ?? 'python'}
              minHeight="160px"
              onChange={(starterCode) =>
                onChange({
                  ...draft,
                  config: { ...draft.config, code: { ...codeCfg, starterCode } },
                })
              }
            />
          </div>
          <p className="text-xs text-text-muted">
            Syntax-highlighted editor for students. Auto-run grading ships in a later phase — answers are graded
            manually for now.
          </p>
        </div>
      )}

      <div>
        <Label htmlFor={`note-${draft.clientKey ?? 'q'}`}>Marking note</Label>
        <Input
          id={`note-${draft.clientKey ?? 'q'}`}
          value={draft.markingNote ?? ''}
          onChange={(e) => onChange({ ...draft, markingNote: e.target.value || null })}
          placeholder="Optional guidance for graders"
        />
      </div>
    </div>
  );
}
