'use client';
import { useEffect, useRef, useState } from 'react';
import type { Lesson, Question } from '../teaching/types';
import s from './showcase.module.css';
export function Reader({
  lesson,
  question,
  kind,
  onClose,
}: {
  lesson: Lesson;
  question: Question;
  kind: 'source' | 'explanation';
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(question.pages[0] ?? 1);
  const [text, setText] = useState('Loading verified page…');
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  useEffect(() => {
    if (!lesson.filename) return;
    const c = new AbortController();
    setText('Loading verified page…');
    fetch(`/prototype/api/page/${lesson.filename}/${page}`, {
      signal: c.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((p) =>
        setText(
          p.text ||
            'No text layer on this page. Open the original PDF to view the page.',
        ),
      )
      .catch((e) => {
        if (e.name !== 'AbortError')
          setText('Source page could not load. Try the original PDF.');
      });
    return () => c.abort();
  }, [lesson.filename, page]);
  return (
    <dialog
      ref={ref}
      className={s.reader}
      onCancel={onClose}
      aria-label={
        kind === 'source' ? 'Verified source reader' : 'Full explanation'
      }
    >
      <header>
        <div>
          <span className={s.eyebrow}>
            {kind === 'source'
              ? 'VERIFIED COURSE SOURCE'
              : 'TEACHING EXPLANATION'}
          </span>
          <h2>{kind === 'source' ? lesson.filename : question.concept}</h2>
        </div>
        <button autoFocus aria-label="Close reader" onClick={onClose}>
          ✕
        </button>
      </header>
      {kind === 'source' ? (
        <>
          <nav aria-label="Source page">
            {question.pages.map((p) => (
              <button
                aria-pressed={page === p}
                key={p}
                onClick={() => setPage(p)}
              >
                Page {p}
              </button>
            ))}
          </nav>
          <p className={s.caption}>
            Original PDF page {page}. Extracted text may omit diagrams; use the
            original for visual context.
          </p>
          <div className={s.sourceText}>{text}</div>
          <a
            href={`/prototype/api/source/${lesson.filename}#page=${page}`}
            target="_blank"
            rel="noreferrer"
          >
            Open original PDF · page {page} ↗
          </a>
        </>
      ) : (
        <>
          <p>{lesson.introduction}</p>
          <h3>{question.task}</h3>
          <p>{question.explanation}</p>
          {question.hints[1] !== question.explanation && (
            <p>{question.hints[1]}</p>
          )}
          <p className={s.caption}>
            {lesson.general
              ? 'Prepared general knowledge teaching example.'
              : `Based on ${lesson.filename}, pages ${question.pages.join(', ')}. The interactive scene is an illustrative teaching example.`}
          </p>
        </>
      )}
    </dialog>
  );
}
