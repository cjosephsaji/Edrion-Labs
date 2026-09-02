'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Cloud,
  CloudOff,
  Flag,
  LoaderCircle,
  Maximize2,
  Play,
  Send,
  ShieldCheck,
  UploadCloud,
  WifiOff,
  X,
} from 'lucide-react';
import { ErrorState, LoadingBlock } from '@/components/ui/states';
import { formatApiError, useStudentApi } from '@/lib/api-client';
import { ExamQuestionInput } from './exam-question-input';
import { isAnswered, questionTypeLabel, type ExamAnswer, type ExamPaper } from './exam-types';
import styles from './exams.module.css';

type SaveState = 'saved' | 'saving' | 'error';

function countdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function ExamAttemptScreen({ scheduleId }: { scheduleId: string }) {
  const api = useStudentApi();
  const router = useRouter();
  const query = useQuery({
    queryKey: ['student', 'exam-paper', scheduleId],
    queryFn: () => api.get<ExamPaper>(`/student/exams/${scheduleId}/paper`),
    retry: false,
  });
  const paper = query.data;
  const [agreement, setAgreement] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, ExamAnswer>>({});
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [online, setOnline] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const answersRef = useRef<Record<string, ExamAnswer>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const queuesRef = useRef<Record<string, Promise<unknown>>>({});
  const pendingSaves = useRef(0);
  const initializedAttempt = useRef<string | null>(null);
  const autoSubmitStarted = useRef(false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (!paper?.attempt || initializedAttempt.current === paper.attempt.id) return;
    const restored = Object.fromEntries(
      paper.answers.map((answer) => [answer.questionId, {
        choiceKey: answer.choiceKey,
        answerText: answer.answerText,
        answerObjectId: answer.answerObjectId,
        answerJson: answer.answerJson,
      }]),
    );
    initializedAttempt.current = paper.attempt.id;
    answersRef.current = restored;
    setAnswers(restored);
  }, [paper]);

  const persist = useCallback(async (questionId: string, answer: ExamAnswer) => {
    pendingSaves.current += 1;
    setSaveState('saving');
    const previous = queuesRef.current[questionId] ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => api.put(`/student/exams/${scheduleId}/answers/${questionId}`, {
        choiceKey: answer.choiceKey ?? null,
        answerText: answer.answerText ?? null,
        answerObjectId: answer.answerObjectId ?? null,
        answerJson: answer.answerJson ?? null,
      }));
    queuesRef.current[questionId] = next;
    try {
      await next;
      pendingSaves.current -= 1;
      if (pendingSaves.current === 0) setSaveState('saved');
    } catch (error) {
      pendingSaves.current -= 1;
      setSaveState('error');
      throw error;
    }
  }, [api, scheduleId]);

  const queueSave = useCallback((questionId: string, answer: ExamAnswer) => {
    if (timersRef.current[questionId]) clearTimeout(timersRef.current[questionId]);
    setSaveState('saving');
    timersRef.current[questionId] = setTimeout(() => void persist(questionId, answer).catch(() => undefined), 550);
  }, [persist]);

  const changeAnswer = useCallback((questionId: string, answer: ExamAnswer) => {
    answersRef.current = { ...answersRef.current, [questionId]: answer };
    setAnswers(answersRef.current);
    queueSave(questionId, answer);
  }, [queueSave]);

  const flushAnswers = useCallback(async () => {
    for (const timer of Object.values(timersRef.current)) clearTimeout(timer);
    timersRef.current = {};
    await Promise.all(Object.entries(answersRef.current).map(([questionId, answer]) => persist(questionId, answer)));
    await Promise.all(Object.values(queuesRef.current).map((promise) => promise.catch(() => undefined)));
  }, [persist]);

  const finish = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await flushAnswers();
      await api.post(`/student/exams/${scheduleId}/finish`);
      setShowSubmit(false);
      await query.refetch();
    } catch (error) {
      setActionError(formatApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [api, flushAnswers, query, scheduleId, submitting]);

  useEffect(() => {
    if (!paper?.attempt || paper.status !== 'in_progress') return;
    const tick = () => {
      const next = new Date(paper.attempt!.endsAt).getTime() - Date.now();
      setRemaining(next);
      if (next <= 0 && !autoSubmitStarted.current) {
        autoSubmitStarted.current = true;
        void finish();
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [finish, paper]);

  useEffect(() => {
    if (paper?.status !== 'in_progress') return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [paper?.status]);

  const questions = paper?.questions ?? [];
  const current = questions[currentIndex];
  const answeredCount = useMemo(() => questions.filter((question) => isAnswered(answers[question.id])).length, [answers, questions]);
  const flaggedCount = useMemo(() => questions.filter((question) => answers[question.id]?.answerJson?._flagged === true).length, [answers, questions]);
  const unansweredCount = Math.max(0, questions.length - answeredCount);

  if (query.isLoading) return <LoadingBlock label="Preparing examination…" />;
  if (query.error || !paper) return <ErrorState title="Couldn’t open this examination" description={formatApiError(query.error)} onRetry={() => void query.refetch()} />;

  if (paper.status === 'completed') {
    const results = paper.results;
    return (
      <div className={styles.attemptPage}>
        <section className={styles.complete}>
          <span className={styles.completeIcon}><CheckCircle2 aria-hidden="true" size={30} /></span>
          <h1>Examination submitted</h1>
          <p>Your answers are locked. Objective answers have been scored; descriptive, file, case-based, and code responses remain with your teacher for review.</p>
          <div className={styles.completeStats}>
            <div><span>Answered</span><strong>{results?.answeredQuestions ?? '—'} / {results?.totalQuestions ?? questions.length}</strong></div>
            <div><span>Auto-scored marks</span><strong>{results?.autoScore ?? '—'}</strong></div>
            <div><span>Pending review</span><strong>{results?.pendingReview ?? '—'}</strong></div>
          </div>
          <div className={styles.completeActions}>
            <Link className={styles.secondaryButton} href="/exams"><ArrowLeft aria-hidden="true" size={16} /> Examinations</Link>
            <Link className={styles.nextButton} href="/results">View released results <ArrowRight aria-hidden="true" size={16} /></Link>
          </div>
        </section>
      </div>
    );
  }

  if (paper.status === 'ready') {
    return (
      <div className={styles.attemptPage}>
        <div className={styles.briefing}>
          <section className={styles.briefingMain}>
            <p className={styles.briefingKicker}>Online examination</p>
            <h1 className={styles.briefingTitle}>{paper.title}</h1>
            <p className={styles.briefingCopy}>{paper.description ?? 'Read the instructions before beginning your examination.'}</p>
            <div className={styles.briefingMeta}>
              <div><span>Duration</span><strong>{paper.durationMin} minutes</strong></div>
              <div><span>Questions</span><strong>{paper.questions.length}</strong></div>
              <div><span>Maximum marks</span><strong>{paper.maxMarks}</strong></div>
            </div>
            <label className={styles.agreement}>
              <input type="checkbox" checked={agreement} onChange={(event) => setAgreement(event.target.checked)} />
              <span>I have checked my connection and understand that the timer continues after I start.</span>
            </label>
          </section>
          <aside className={styles.briefingSide}>
            <h2>Before you begin</h2>
            <ol>
              <li>Use a stable internet connection and keep this tab open.</li>
              <li>Answers save automatically while you work.</li>
              <li>Flag questions to revisit them before submission.</li>
              <li>Review unanswered questions before the final submit.</li>
              <li>The paper submits automatically when time expires.</li>
            </ol>
            <div className={styles.sideAction}>
              <button
                className={styles.startButton}
                type="button"
                disabled={!agreement || !paper.canStart || starting}
                aria-busy={starting}
                onClick={async () => {
                  setStarting(true);
                  setActionError(null);
                  try {
                    await api.post(`/student/exams/${scheduleId}/start`);
                    await query.refetch();
                  } catch (error) {
                    setActionError(formatApiError(error));
                  } finally {
                    setStarting(false);
                  }
                }}
              >
                <Play aria-hidden="true" size={17} />{starting ? 'Starting…' : 'Start examination'}
              </button>
              {paper.canStart && !agreement ? (
                <p className={styles.sideHint}>Tick the box on the left to begin.</p>
              ) : null}
              {!paper.canStart ? <p className={styles.errorText}>{paper.blockedReason}</p> : null}
              {actionError ? <p className={styles.errorText}>{actionError}</p> : null}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  if (!paper.attempt || !current) return <ErrorState title="Paper unavailable" description="This examination does not contain any questions." />;
  const currentAnswer = answers[current.id] ?? {};
  const currentFlagged = currentAnswer.answerJson?._flagged === true;

  return (
    <div className={styles.attemptPage}>
      <header className={styles.attemptHeader}>
        <div className={styles.attemptIdentity}>
          <button className={styles.iconButton} type="button" title="Leave examination" onClick={() => {
            if (window.confirm('Leave the examination? Your saved answers and timer will remain active.')) router.push('/exams');
          }}><X aria-hidden="true" size={18} /></button>
          <div className="min-w-0">
            <h1 className={styles.attemptTitle}>{paper.title}</h1>
            <p className={styles.attemptSubject}>
              Question {currentIndex + 1} of {questions.length}
              <span className={styles.saveState} data-state={!online ? 'offline' : saveState}>
                {!online ? <><WifiOff aria-hidden="true" size={13} /> Offline</> : saveState === 'saving' ? <><LoaderCircle aria-hidden="true" className="animate-spin" size={13} /> Saving</> : saveState === 'error' ? <><CloudOff aria-hidden="true" size={13} /> Not saved</> : <><Cloud aria-hidden="true" size={13} /> Saved</>}
              </span>
            </p>
          </div>
        </div>
        <div className={styles.headerTools}>
          <button className={styles.iconButton} type="button" title="Enter full screen" onClick={() => void document.documentElement.requestFullscreen?.()}><Maximize2 aria-hidden="true" size={17} /></button>
          <span className={styles.timer} data-urgent={remaining <= 5 * 60_000 || undefined} role="timer" aria-label={`${countdown(remaining)} remaining`}>
            <Clock3 aria-hidden="true" size={15} />
            <strong>{countdown(remaining)}</strong>
            <small>left</small>
          </span>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.toolPanel}>
          <div className={styles.toolHead}>
            <h2>Questions</h2>
            <p>{answeredCount} of {questions.length} answered{flaggedCount ? ` · ${flaggedCount} flagged` : ''}</p>
          </div>
          <div className={styles.palette}>
            {questions.map((question, index) => (
              <button
                className={styles.paletteButton}
                type="button"
                data-current={index === currentIndex}
                data-answered={isAnswered(answers[question.id])}
                data-flagged={answers[question.id]?.answerJson?._flagged === true}
                aria-label={`Question ${index + 1}${isAnswered(answers[question.id]) ? ', answered' : ', unanswered'}`}
                onClick={() => setCurrentIndex(index)}
                key={question.id}
              >{index + 1}</button>
            ))}
          </div>
          <div className={styles.legend}><span><i className={styles.legendDot} data-tone="answered" /> Answered</span><span><i className={styles.legendDot} data-tone="flagged" /> Flagged</span><span><i className={styles.legendDot} /> Not answered</span></div>
          <div className={styles.sideAction}>
            <button className={styles.submitButton} type="button" onClick={() => setShowSubmit(true)}>
              <UploadCloud aria-hidden="true" size={16} /> Review and submit
            </button>
            {unansweredCount > 0 ? (
              <p className={styles.paletteNote}>{unansweredCount} still unanswered</p>
            ) : (
              <p className={styles.paletteNote}>Every question answered</p>
            )}
            {actionError ? <p className={styles.errorText}>{actionError}</p> : null}
          </div>
        </aside>

        <main className={styles.questionCard}>
          <div className={styles.questionTop}>
            <span className={styles.questionTag}>{questionTypeLabel(current.qtype)} · {current.marks} {current.marks === 1 ? 'mark' : 'marks'}</span>
            <button
              className={styles.flagButton}
              type="button"
              aria-pressed={currentFlagged}
              onClick={() => changeAnswer(current.id, { ...currentAnswer, answerJson: { ...(currentAnswer.answerJson ?? {}), _flagged: !currentFlagged } })}
            ><Flag aria-hidden="true" size={14} />{currentFlagged ? 'Flagged' : 'Flag for review'}</button>
          </div>
          <div className={styles.questionBody}>
            {current.promptImageUrl ? <img className={styles.promptImage} src={current.promptImageUrl} alt="Question reference" /> : null}
            <h2 className={styles.prompt}>{current.sequence}. {current.prompt}</h2>
            <ExamQuestionInput
              question={current}
              answer={currentAnswer}
              onChange={(answer) => changeAnswer(current.id, answer)}
              uploading={uploading}
              onUpload={async (file) => {
                setUploading(true);
                try {
                  return await api.upload('exam_answer', file);
                } finally {
                  setUploading(false);
                }
              }}
            />
          </div>
          <div className={styles.questionNav}>
            <button className={styles.secondaryButton} type="button" disabled={currentIndex === 0} onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}><ArrowLeft aria-hidden="true" size={16} /> Previous</button>
            {currentIndex < questions.length - 1
              ? <button className={styles.nextButton} type="button" onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}>Next <ArrowRight aria-hidden="true" size={16} /></button>
              : <button className={styles.nextButton} type="button" onClick={() => setShowSubmit(true)}>Review submission <Send aria-hidden="true" size={16} /></button>}
          </div>
        </main>

      </div>

      {showSubmit ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setShowSubmit(false); }}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="submit-title">
            <h2 id="submit-title">Submit examination?</h2>
            <p>You cannot change answers after submission. Saved objective answers are scored immediately; other responses are sent for teacher review.</p>
            <div className={styles.modalStats}><div><span className={styles.summaryLabel}>Answered</span><strong className={styles.summaryValue}>{answeredCount}</strong></div><div><span className={styles.summaryLabel}>Unanswered</span><strong className={styles.summaryValue}>{unansweredCount}</strong></div></div>
            {unansweredCount > 0 ? <p className={styles.errorText}>{unansweredCount} {unansweredCount === 1 ? 'question is' : 'questions are'} still unanswered.</p> : null}
            {actionError ? <p className={styles.errorText}>{actionError}</p> : null}
            <div className={styles.modalActions}><button className={styles.secondaryButton} type="button" disabled={submitting} onClick={() => setShowSubmit(false)}>Continue exam</button><button className={styles.nextButton} type="button" disabled={submitting || saveState === 'error'} aria-busy={submitting} onClick={() => void finish()}><ShieldCheck aria-hidden="true" size={16} />{submitting ? 'Submitting…' : 'Submit final'}</button></div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
