'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  FileText,
  UploadCloud,
  Sparkles,
  BookOpen,
  Check,
  Loader2,
} from 'lucide-react';
import { lessons } from '../lessons';
import { resolveLesson } from '../teaching/lesson-registry';
import { preparedTopics } from '../teaching/topic-catalog';
import receipts from '../assets/source-receipts.json';
import type { Lesson, ShowcaseState, Receipt } from '../teaching/types';
import s from './showcase.module.css';
export function Home({
  state,
  onLesson,
  onResume,
  onTopic,
  onReceipts,
  onRemoveReceipt,
}: {
  state: ShowcaseState;
  onLesson: (l: Lesson) => void;
  onResume: () => void;
  onTopic: (t: string) => Promise<void>;
  onReceipts: (r: Receipt) => void;
  onRemoveReceipt: (name: string) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [drop, setDrop] = useState(false);
  const [progress, setProgress] = useState(0);
  const [topicBusy, setTopicBusy] = useState(false),
    [topicError, setTopicError] = useState('');
  const topicMounted = useRef(true);
  useEffect(() => {
    topicMounted.current = true;
    return () => {
      topicMounted.current = false;
    };
  }, []);
  async function explore(text: string) {
    if (topicBusy || text.trim().length < 3) return;
    setTopicError('');
    setTopicBusy(true);
    try {
      await onTopic(text.trim());
    } catch (error) {
      if (topicMounted.current)
        setTopicError(
          error instanceof Error
            ? error.message
            : 'The lesson could not be prepared. Please try again.',
        );
    } finally {
      if (topicMounted.current) setTopicBusy(false);
    }
  }
  const [uploads, setUploads] = useState<{ name: string; status: string }[]>(
    [],
  );
  async function upload(files: File[]) {
    setError(
      files.length > 4
        ? 'Only the first four PDFs in this batch will be processed.'
        : '',
    );
    files = files.slice(0, 4);
    let i = 0;
    for (const file of files) {
      if (
        file.size > 20 * 1024 * 1024 ||
        !file.name.toLowerCase().endsWith('.pdf') ||
        (file.type && file.type !== 'application/pdf')
      ) {
        setError(`${file.name}: choose a PDF no larger than 20 MB.`);
        continue;
      }
      const c = new AbortController();
      abort.current = c;
      setBusy(file.name);
      setProgress(0);
      const entry = {
        name: file.name,
        status: 'Inspecting bytes and extracting pages…',
      };
      setUploads((x) => [...x.filter((r) => r.name !== file.name), entry]);
      try {
        const data = new FormData();
        data.set('file', file);
        const r = await fetch('/prototype/api/upload', {
          method: 'POST',
          body: data,
          signal: c.signal,
        });
        const receipt = await r.json();
        if (!r.ok) throw Error(receipt.error);
        onReceipts(receipt);
        setProgress(100);
        setUploads((x) =>
          x.map((r) =>
            r.name === file.name
              ? {
                  name: file.name,
                  status: `${receipt.pageCount} pages · SHA-256 ${receipt.sha256.slice(0, 12)}… · ${receipt.recognized ? 'recognized by content' : 'new source; extracted text available'}`,
                }
              : r,
          ),
        );
      } catch (e) {
        setError(
          e instanceof Error && e.name === 'AbortError'
            ? 'Upload cancelled. Your current lesson is unchanged.'
            : e instanceof Error
              ? e.message
              : 'Upload failed.',
        );
        setUploads((x) => x.filter((r) => r.name !== file.name));
        if (c.signal.aborted) break;
      } finally {
        setBusy('');
        abort.current = null;
      }
      i++;
      if (i >= 4) break;
    }
  }
  return (
    <>
      <section className={s.hero}>
        <span className={s.eyebrow}>
          <span className={s.liveDot} /> A SPACE FOR YOUR CURIOSITY
        </span>
        <h1>
          What are we
          <br className={s.desktopBreak} /> learning today?
        </h1>
        <p>Bring your notes, or ask about something you’re curious about.</p>
        <div className={s.heroPetros}>
          <div className={s.heroBubble}>
            Big ideas.
            <br />
            Small, clear steps.
          </div>
          <img
            src="/petros/states/petros-idle.png"
            alt="Original Petros"
            width="180"
            height="240"
          />
        </div>
      </section>
      {state.lessonId && (
        <button className={s.resume} onClick={onResume}>
          <BookOpen size={20} />
          <span>
            <strong>Resume lesson</strong> · {resolveLesson(state)?.title}{' '}
            <small>
              {state.phase} ·{' '}
              {
                Object.values(state.completion).filter(
                  (c) => c.outcome !== 'skipped',
                ).length
              }{' '}
              checkpoints explored
            </small>
          </span>
          <ArrowRight size={20} />
        </button>
      )}
      <div className={s.paths}>
        <a href="#files">
          <span className={s.pathIcon}>
            <FileText />
          </span>
          <span>
            <strong>Learn from my files</strong>
            <small>Your notes, brought to life.</small>
          </span>
          <ArrowRight size={22} />
        </a>
        <a href="#topics">
          <span className={s.pathIcon}>
            <Sparkles />
          </span>
          <span>
            <strong>Explore a topic</strong>
            <small>Follow a question somewhere new.</small>
          </span>
          <ArrowRight size={22} />
        </a>
      </div>
      <section id="files" className={s.filesSection}>
        <header className={s.sectionHeading}>
          <div>
            <span className={s.eyebrow}>YOUR LEARNING SHELF</span>
            <h2>Start with a module</h2>
          </div>
          <span className={s.caption}>4 source-verified PDFs</span>
        </header>
        {['Artificial Intelligence', 'Environmental and Health Safety'].map(
          (subject) => (
            <div key={subject} className={s.subjectGroup}>
              <h3>
                {subject === 'Artificial Intelligence'
                  ? subject
                  : 'Environmental & Health Safety'}
              </h3>
              <div className={s.moduleGrid}>
                {receipts
                  .filter((r) => r.subject === subject)
                  .map((r) => {
                    const l = lessons.find((x) => x.filename === r.filename);
                    const titles: Record<string, string> = {
                      'AI_Module_4.pdf': 'How an AI Reasons with Knowledge',
                      'EHS_Module_3.pdf': 'Find the Construction Hazards',
                      'EHS_Module_5.pdf': 'Protecting Water Resources',
                    };
                    return (
                      <article key={r.filename} className={s.moduleCard}>
                        <div className={s.cardTop}>
                          <span className={s.moduleNumber}>M{r.module}</span>
                          <span className={s.verified}>
                            <Check size={13} /> Extracted & verified
                          </span>
                        </div>
                        <span className={s.eyebrow}>MODULE {r.module}</span>
                        <h4>{l?.title ?? titles[r.filename]}</h4>
                        <div className={s.chips}>
                          {(
                            l?.chips ?? ['Source verified', 'Prepared lesson']
                          ).map((c) => (
                            <span key={c}>{c}</span>
                          ))}
                        </div>
                        <footer>
                          <span className={s.caption}>
                            {r.pageCount} pages · {r.extractedPages} with text
                          </span>
                          <button
                            disabled={!l}
                            onClick={() => l && onLesson(l)}
                            aria-label={`Learn ${r.filename}`}
                          >
                            {l ? 'Learn this module' : 'Preparing lesson'}{' '}
                            <ArrowRight size={17} />
                          </button>
                        </footer>
                      </article>
                    );
                  })}
              </div>
            </div>
          ),
        )}
        <div
          className={`${s.dropzone} ${drop ? s.dragActive : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrop(true);
          }}
          onDragLeave={() => setDrop(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrop(false);
            if (!busy) void upload(Array.from(e.dataTransfer.files));
          }}
        >
          <UploadCloud size={28} />
          <div>
            <strong>Bring your own notes</strong>
            <p>
              Drop up to 4 PDFs here, or{' '}
              <button
                disabled={!!busy}
                className={s.textButton}
                onClick={() => picker.current?.click()}
              >
                browse files
              </button>
            </p>
            <small>
              20 MB per file · up to 200 pages · session memory only
            </small>
          </div>
          <input
            ref={picker}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          {busy && (
            <div className={s.uploadProgress}>
              <Loader2 className={s.spin} size={18} />
              <span>Extracting {busy}…</span>
              <progress
                value={progress === 100 ? 100 : undefined}
                max="100"
                aria-label="Extraction progress"
              />
              <button onClick={() => abort.current?.abort()}>Cancel</button>
            </div>
          )}
        </div>
        {error && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}
        {uploads.map((u) => (
          <div className={s.receipt} key={u.name}>
            <FileText size={18} />
            <span>
              <strong>{u.name}</strong>
              <small>{u.status}</small>
            </span>
            <button
              aria-label={`Remove receipt ${u.name}`}
              onClick={() => {
                setUploads((x) => x.filter((r) => r.name !== u.name));
                onRemoveReceipt(u.name);
              }}
            >
              ×
            </button>
          </div>
        ))}
        {state.receipts
          .filter((r) => !r.recognized)
          .map((r) => (
            <details key={r.id} className={s.extracted}>
              <summary>{r.filename} · extracted page inventory</summary>
              <button
                onClick={() => {
                  onRemoveReceipt(r.filename);
                  setUploads((x) => x.filter((u) => u.name !== r.filename));
                }}
              >
                Remove {r.filename}
              </button>
              <p>
                Rich generated lessons are unavailable without a qualified
                model. These are actual extracted pages; no prepared module was
                assigned.
              </p>
              {r.pages.map((p) => (
                <details key={p.page}>
                  <summary>
                    Page {p.page} · {p.text.length} characters
                  </summary>
                  <p>{p.text || 'No extractable text.'}</p>
                </details>
              ))}
            </details>
          ))}
      </section>
      <section id="topics" className={s.topicSection}>
        <span className={s.eyebrow}>A QUESTION IS A GREAT PLACE TO START</span>
        <h2>Where does your curiosity go?</h2>
        <div className={s.topicChips}>
          {preparedTopics.map(({ title: t }) => (
            <button
              key={t}
              disabled={topicBusy}
              onClick={() => void explore(t)}
            >
              <Sparkles size={18} />
              {t}
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
        <form
          className={s.topicForm}
          aria-busy={topicBusy}
          onSubmit={(e) => {
            e.preventDefault();
            void explore(topic);
          }}
        >
          <input
            aria-label="Explore any topic"
            maxLength={240}
            placeholder="Or ask about something else…"
            value={topic}
            aria-describedby={
              topicError ? 'topic-request-error' : 'topic-request-help'
            }
            aria-invalid={!!topicError}
            onChange={(e) => {
              setTopic(e.target.value);
              setTopicError('');
            }}
          />
          <button
            className={s.primary}
            disabled={topicBusy || topic.trim().length < 3}
          >
            {topicBusy ? (
              <>
                <Loader2 className={s.spin} size={17} /> Preparing your lesson…
              </>
            ) : (
              <>
                Let’s explore <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
        {topicError && (
          <p id="topic-request-error" role="alert" className={s.topicStatus}>
            {topicError}
          </p>
        )}
        <p className={s.caption} id="topic-request-help">
          AI, time travel and integrals are ready to explore. Other questions
          use a connected model.
        </p>
      </section>
    </>
  );
}
