'use client';
import { useRef } from 'react';
import { Camera, FilePlus } from 'lucide-react';
import type { AttemptAnswerUpdateInput } from '@edrion/schemas';
import type { QuizPaperQuestion } from '@/lib/hooks/quiz-attempts';
import { webEnv } from '@/lib/env';
import { StudentCodeEditor } from '@/components/institutional/code-editor';

export type LocalAnswer = {
  choiceKey?: string;
  answerText?: string;
  answerObjectId?: string;
  answerJson?: Record<string, unknown>;
  photoName?: string;
};

function mediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const resolved = path.replace('/storage/', '/files/');
  return `${webEnv.apiBaseUrl}${resolved}`;
}

function MatchingPlayer({
  q,
  answer,
  onChange,
}: {
  q: QuizPaperQuestion;
  answer: LocalAnswer | undefined;
  onChange: (matches: Record<string, string>) => void;
}) {
  const matching = q.config?.matching as
    | { left?: Array<{ key: string; label: string }>; right?: Array<{ key: string; label: string }> }
    | undefined;
  const left = matching?.left ?? [];
  const right = matching?.right ?? [];
  const matches = (answer?.answerJson?.matches as Record<string, string> | undefined) ?? {};

  if (left.length === 0) {
    return (
      <p className="mt-4 text-sm text-st-muted">Matching pairs are not configured for this question.</p>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {left.map((item) => (
        <div key={item.key} className="flex items-center gap-3">
          <span className="w-1/2 text-sm text-st-ink">{item.label || item.key}</span>
          <select
            className="w-1/2 rounded-xl border border-st-bd2 bg-st-card px-3 py-2 text-sm"
            value={matches[item.key] ?? ''}
            onChange={(e) => onChange({ ...matches, [item.key]: e.target.value })}
          >
            <option value="">Match…</option>
            {right.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label || r.key}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function FileUploadPlayer({
  answer,
  onUpload,
  uploading,
}: {
  answer: LocalAnswer | undefined;
  onUpload: (file: File) => void;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-4 rounded-xl border border-dashed border-st-bd2 bg-st-surface2 p-4">
      <p className="text-xs font-semibold text-st-faint">FILE ANSWER</p>
      {answer?.answerObjectId ? (
        <p className="mt-2 text-sm text-st-success">
          File attached{answer.photoName ? `: ${answer.photoName}` : ''}
        </p>
      ) : (
        <p className="mt-1 text-xs text-st-muted">Upload your answer file.</p>
      )}
      <button
        type="button"
        className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-st-accent"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        <FilePlus size={16} />
        {uploading ? 'Uploading…' : answer?.answerObjectId ? 'Replace file' : 'Upload file'}
      </button>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function CodePlayer({
  q,
  answer,
  onChange,
}: {
  q: QuizPaperQuestion;
  answer: LocalAnswer | undefined;
  onChange: (source: string, language: string) => void;
}) {
  const codeCfg = q.config?.code as
    | { languages?: string[]; starterCode?: string }
    | undefined;
  const language = (answer?.answerJson?.code as { language?: string } | undefined)?.language
    ?? codeCfg?.languages?.[0]
    ?? 'python';
  const source =
    (answer?.answerJson?.code as { source?: string } | undefined)?.source
    ?? codeCfg?.starterCode
    ?? '';

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-st-faint">{language}</p>
      <StudentCodeEditor
        value={source}
        language={language}
        onChange={(next) => onChange(next, language)}
      />
    </div>
  );
}

/** Per-type answer UI for institutional quiz attempts. */
export function QuestionPlayer({
  q,
  answer,
  onMcqSelect,
  onTextChange,
  onPhotoUpload,
  onMatchingChange,
  onCodeChange,
  onFileUpload,
  photoUploading,
}: {
  q: QuizPaperQuestion;
  answer: LocalAnswer | undefined;
  onMcqSelect: (choiceKey: string) => void;
  onTextChange: (text: string) => void;
  onPhotoUpload: (file: File) => void;
  onMatchingChange: (matches: Record<string, string>) => void;
  onCodeChange: (source: string, language: string) => void;
  onFileUpload: (file: File) => void;
  photoUploading: boolean;
}) {
  const promptImage = mediaUrl(q.promptImageUrl);
  const selectedKeys = new Set((answer?.choiceKey ?? '').split(',').map((k) => k.trim()).filter(Boolean));
  const isMcq = q.qtype === 'mcq_single' || q.qtype === 'mcq_multi' || q.qtype === 'true_false';
  const isText =
    q.qtype === 'short_answer' ||
    q.qtype === 'long_answer' ||
    q.qtype === 'fill_blank' ||
    q.qtype === 'numeric';

  return (
    <div className="p-5">
      {promptImage && (
        <img src={promptImage} alt="" className="mb-4 max-h-48 w-full rounded-xl object-contain" />
      )}
      <p className="font-display text-lg text-st-ink">{q.prompt}</p>

      {isMcq && q.options && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {q.options.map((opt) => {
            const selected = selectedKeys.has(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onMcqSelect(opt.key)}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                  selected
                    ? 'border-st-accent bg-st-accentSoft text-st-accentDeep'
                    : 'border-st-bd2 bg-st-card hover:border-st-accent'
                }`}
              >
                <span className="font-mono-ui font-semibold text-st-accent">{opt.key}.</span> {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {q.qtype === 'true_false' && !q.options && (
        <div className="mt-4 flex gap-2">
          {['true', 'false'].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onMcqSelect(key)}
              className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold capitalize transition ${
                answer?.choiceKey === key
                  ? 'border-st-accent bg-st-accentSoft text-st-accentDeep'
                  : 'border-st-bd2 bg-st-card hover:border-st-accent'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      )}

      {isText && (
        <div className="mt-4 space-y-3">
          {q.qtype === 'long_answer' ? (
            <textarea
              value={answer?.answerText ?? ''}
              onChange={(e) => onTextChange(e.target.value)}
              rows={5}
              placeholder="Type your answer…"
              className="w-full rounded-xl border border-st-bd2 bg-st-card px-4 py-3 text-sm text-st-ink outline-none focus:border-st-accent"
            />
          ) : (
            <input
              type={q.qtype === 'numeric' ? 'number' : 'text'}
              value={answer?.answerText ?? ''}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="Type your answer…"
              className="w-full rounded-xl border border-st-bd2 bg-st-card px-4 py-3 text-sm text-st-ink outline-none focus:border-st-accent"
            />
          )}
          <div className="rounded-xl border border-dashed border-st-bd2 bg-st-surface2 p-4">
            <p className="text-xs font-semibold text-st-faint">PHOTO ANSWER (OPTIONAL)</p>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-st-accent">
              <Camera size={16} />
              {photoUploading ? 'Uploading…' : 'Upload photo'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={photoUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onPhotoUpload(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      )}

      {q.qtype === 'matching' && (
        <MatchingPlayer q={q} answer={answer} onChange={onMatchingChange} />
      )}

      {q.qtype === 'file_upload' && (
        <FileUploadPlayer answer={answer} onUpload={onFileUpload} uploading={photoUploading} />
      )}

      {q.qtype === 'code' && <CodePlayer q={q} answer={answer} onChange={onCodeChange} />}
    </div>
  );
}

export function toAnswerPayload(answer: LocalAnswer): AttemptAnswerUpdateInput {
  return {
    choiceKey: answer.choiceKey ?? null,
    answerText: answer.answerText ?? null,
    answerObjectId: answer.answerObjectId ?? null,
    answerJson: answer.answerJson ?? null,
  };
}
