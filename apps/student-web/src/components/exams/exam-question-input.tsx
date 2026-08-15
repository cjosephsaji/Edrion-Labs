'use client';

import { useId } from 'react';
import { ArrowRight, FileCheck2, Upload } from 'lucide-react';
import type { ExamAnswer, ExamOption, ExamQuestion } from './exam-types';
import styles from './exams.module.css';

type SubQuestion = {
  id: string;
  qtype: string;
  prompt: string;
  marks?: number;
  options?: ExamOption[];
};

function selectedKeys(answer: ExamAnswer) {
  return new Set((answer.choiceKey ?? '').split(',').map((key) => key.trim()).filter(Boolean));
}

function ChoiceInput({
  options,
  answer,
  multiple,
  onChange,
}: {
  options: ExamOption[];
  answer: ExamAnswer;
  multiple?: boolean;
  onChange: (answer: ExamAnswer) => void;
}) {
  const selected = selectedKeys(answer);
  return (
    <div className={styles.options}>
      {options.map((option) => {
        const active = selected.has(option.key);
        return (
          <button
            className={styles.option}
            type="button"
            aria-pressed={active}
            key={option.key}
            onClick={() => {
              if (!multiple) {
                onChange({ ...answer, choiceKey: option.key });
                return;
              }
              const next = new Set(selected);
              if (next.has(option.key)) next.delete(option.key);
              else next.add(option.key);
              onChange({ ...answer, choiceKey: [...next].sort().join(',') });
            }}
          >
            <span className={styles.optionKey}>{option.key}</span>
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function BasicInput({
  qtype,
  options,
  answer,
  onChange,
}: {
  qtype: string;
  options?: ExamOption[] | null;
  answer: ExamAnswer;
  onChange: (answer: ExamAnswer) => void;
}) {
  if (qtype === 'mcq_single' || qtype === 'assertion_reason') {
    return <ChoiceInput options={options ?? []} answer={answer} onChange={onChange} />;
  }
  if (qtype === 'mcq_multi') {
    return <ChoiceInput options={options ?? []} answer={answer} multiple onChange={onChange} />;
  }
  if (qtype === 'true_false') {
    return (
      <ChoiceInput
        options={[{ key: 'true', label: 'True' }, { key: 'false', label: 'False' }]}
        answer={answer}
        onChange={onChange}
      />
    );
  }
  if (qtype === 'short_answer') {
    return <textarea className={styles.textarea} rows={5} value={answer.answerText ?? ''} onChange={(event) => onChange({ ...answer, answerText: event.target.value })} placeholder="Type your answer" />;
  }
  if (qtype === 'long_answer') {
    return <textarea className={`${styles.textarea} ${styles.longTextarea}`} rows={10} value={answer.answerText ?? ''} onChange={(event) => onChange({ ...answer, answerText: event.target.value })} placeholder="Write your detailed answer" />;
  }
  return <input className={styles.input} value={answer.answerText ?? ''} onChange={(event) => onChange({ ...answer, answerText: event.target.value })} placeholder="Type your answer" />;
}

export function ExamQuestionInput({
  question,
  answer,
  onChange,
  onUpload,
  uploading,
}: {
  question: ExamQuestion;
  answer: ExamAnswer;
  onChange: (answer: ExamAnswer) => void;
  onUpload: (file: File) => Promise<{ id: string; filename: string | null }>;
  uploading: boolean;
}) {
  const uploadId = useId();
  const qtype = question.qtype;
  const config = question.config ?? {};

  if (qtype === 'mcq_single' || qtype === 'mcq_multi' || qtype === 'true_false') {
    return <div className={styles.answerArea}><BasicInput qtype={qtype} options={question.options} answer={answer} onChange={onChange} /></div>;
  }

  if (qtype === 'assertion_reason') {
    const assertion = config.assertionReason as { assertion?: string; reason?: string } | undefined;
    return (
      <div className={styles.answerArea}>
        <div className={styles.statement}><strong>Assertion:</strong> {assertion?.assertion}</div>
        <div className={styles.statement}><strong>Reason:</strong> {assertion?.reason}</div>
        <div className="mt-4"><BasicInput qtype={qtype} options={question.options} answer={answer} onChange={onChange} /></div>
      </div>
    );
  }

  if (qtype === 'fill_blank') {
    return (
      <div className={styles.answerArea}>
        <label className={styles.fieldLabel} htmlFor={`${uploadId}-blank`}>Your answer</label>
        <input id={`${uploadId}-blank`} className={styles.input} value={answer.answerText ?? ''} onChange={(event) => onChange({ ...answer, answerText: event.target.value })} placeholder="Complete the blank" />
      </div>
    );
  }

  if (qtype === 'numeric' || qtype === 'numerical') {
    const numeric = config.numeric as { unit?: string | null } | undefined;
    const workingText = (answer.answerJson?.workingText as string | undefined) ?? '';
    return (
      <div className={styles.answerArea}>
        <div className={styles.fieldGrid}>
          <label><span className={styles.fieldLabel}>Value</span><input className={styles.input} type="number" inputMode="decimal" value={answer.answerText ?? ''} onChange={(event) => onChange({ ...answer, answerText: event.target.value })} /></label>
          <label><span className={styles.fieldLabel}>Unit</span><input className={styles.input} value={numeric?.unit ?? ''} readOnly aria-readonly="true" /></label>
        </div>
        <label className="mt-4 block"><span className={styles.fieldLabel}>Working</span><textarea className={styles.textarea} rows={4} value={workingText} onChange={(event) => onChange({ ...answer, answerJson: { ...(answer.answerJson ?? {}), workingText: event.target.value } })} placeholder="Show your calculation" /></label>
      </div>
    );
  }

  if (qtype === 'matching' || qtype === 'match_following') {
    const matching = config.matching as { left?: Array<{ key: string; label: string }>; right?: Array<{ key: string; label: string }> } | undefined;
    const matches = (answer.answerJson?.matches as Record<string, string> | undefined) ?? {};
    return (
      <div className={`${styles.answerArea} ${styles.matchList}`}>
        {(matching?.left ?? []).map((left) => (
          <div className={styles.matchRow} key={left.key}>
            <span>{left.label}</span><ArrowRight aria-hidden="true" size={17} />
            <select className={styles.select} value={matches[left.key] ?? ''} onChange={(event) => onChange({ ...answer, answerJson: { ...(answer.answerJson ?? {}), matches: { ...matches, [left.key]: event.target.value } } })}>
              <option value="">Choose a match</option>
              {(matching?.right ?? []).map((right) => <option value={right.key} key={right.key}>{right.label}</option>)}
            </select>
          </div>
        ))}
      </div>
    );
  }

  if (qtype === 'short_answer' || qtype === 'long_answer') {
    return <div className={styles.answerArea}><BasicInput qtype={qtype} answer={answer} onChange={onChange} /></div>;
  }

  if (qtype === 'case_based') {
    const caseBased = config.caseBased as { passage?: string; subQuestions?: SubQuestion[] } | undefined;
    const subAnswers = (answer.answerJson?.subAnswers as Record<string, ExamAnswer> | undefined) ?? {};
    return (
      <div className={styles.answerArea}>
        <div className={styles.casePassage}>{caseBased?.passage}</div>
        {(caseBased?.subQuestions ?? []).map((subQuestion, index) => (
          <div className={styles.subQuestion} key={subQuestion.id}>
            <p className={styles.subPrompt}>{index + 1}. {subQuestion.prompt} {subQuestion.marks ? `(${subQuestion.marks} marks)` : ''}</p>
            <BasicInput
              qtype={subQuestion.qtype}
              options={subQuestion.options}
              answer={subAnswers[subQuestion.id] ?? {}}
              onChange={(subAnswer) => onChange({ ...answer, answerJson: { ...(answer.answerJson ?? {}), subAnswers: { ...subAnswers, [subQuestion.id]: subAnswer } } })}
            />
          </div>
        ))}
      </div>
    );
  }

  if (qtype === 'file_upload') {
    const fileName = answer.answerJson?.fileName as string | undefined;
    const file = config.fileUpload as { acceptMime?: string[] } | undefined;
    return (
      <div className={`${styles.answerArea} ${styles.uploadBox}`}>
        {answer.answerObjectId ? <FileCheck2 aria-hidden="true" size={30} /> : <Upload aria-hidden="true" size={30} />}
        <strong>{answer.answerObjectId ? fileName ?? 'Answer file attached' : 'Attach your answer file'}</strong>
        <p>{answer.answerObjectId ? 'Choose another file to replace it.' : 'Use a clear PDF, PNG, or JPEG file.'}</p>
        <label className={styles.uploadButton} htmlFor={uploadId}><Upload aria-hidden="true" size={15} />{uploading ? 'Uploading…' : answer.answerObjectId ? 'Replace file' : 'Choose file'}</label>
        <input
          className="sr-only"
          id={uploadId}
          type="file"
          disabled={uploading}
          accept={(file?.acceptMime ?? []).join(',')}
          onChange={async (event) => {
            const selected = event.target.files?.[0];
            if (!selected) return;
            const uploaded = await onUpload(selected);
            onChange({ ...answer, answerObjectId: uploaded.id, answerJson: { ...(answer.answerJson ?? {}), fileName: uploaded.filename ?? selected.name } });
            event.target.value = '';
          }}
        />
      </div>
    );
  }

  if (qtype === 'code') {
    const code = config.code as { languages?: string[]; starterCode?: string } | undefined;
    const savedCode = answer.answerJson?.code as { language?: string; source?: string } | undefined;
    const language = savedCode?.language ?? code?.languages?.[0] ?? 'python';
    const source = savedCode?.source ?? code?.starterCode ?? '';
    return (
      <div className={styles.answerArea}>
        <label><span className={styles.fieldLabel}>Language</span><select className={styles.select} value={language} onChange={(event) => onChange({ ...answer, answerText: source, answerJson: { ...(answer.answerJson ?? {}), code: { language: event.target.value, source } } })}>{(code?.languages ?? ['python']).map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        <label className="mt-3 block"><span className={styles.fieldLabel}>Source code</span><textarea className={`${styles.textarea} ${styles.codeTextarea}`} spellCheck={false} value={source} onChange={(event) => onChange({ ...answer, answerText: event.target.value, answerJson: { ...(answer.answerJson ?? {}), code: { language, source: event.target.value } } })} /></label>
      </div>
    );
  }

  return <div className={styles.answerArea}><BasicInput qtype={qtype} answer={answer} onChange={onChange} /></div>;
}
