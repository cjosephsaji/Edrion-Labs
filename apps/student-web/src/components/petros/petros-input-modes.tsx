'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  PetrosHandwritingEvaluation,
  PetrosHandwritingRecognition,
  PetrosLearningSessionDocument,
  PetrosMediaObject,
  PetrosQuestionExtraction,
  PetrosSpeechTranscription,
} from '@edrion/schemas';
import { newIdempotencyKey, useStudentApi, formatApiError } from '@/lib/api-client';
import styles from './petros-input-modes.module.css';
import { PetrosTeachBack } from './petros-teach-back';

type Mode = 'snap' | 'handwriting' | 'voice' | 'five-minute' | 'teach-back';
type ProcessView = {
  media: PetrosMediaObject;
  imageUnderstanding: unknown | null;
  questionExtraction: PetrosQuestionExtraction | null;
  handwritingRecognition: PetrosHandwritingRecognition | null;
  handwritingEvaluation: PetrosHandwritingEvaluation | null;
  transcription: PetrosSpeechTranscription | null;
};

const MODES: Array<{ id: Mode; title: string; promise: string }> = [
  {
    id: 'snap',
    title: 'Snap a question',
    promise: 'Confirm it, name the stuck point, then learn.',
  },
  {
    id: 'handwriting',
    title: 'Show your work',
    promise: 'Correct recognition before line-linked critique.',
  },
  {
    id: 'voice',
    title: 'Voice session',
    promise: 'Turn-based recording, captions, interruption, text fallback.',
  },
  {
    id: 'five-minute',
    title: 'Five-minute mode',
    promise: 'One guess, one teaching move, one check, one card.',
  },
  {
    id: 'teach-back',
    title: 'Teach it back',
    promise: 'You explain; a confused junior asks one grounded question.',
  },
];

export function PetrosInputModes() {
  const search = useSearchParams();
  const initial = search.get('mode');
  const [mode, setMode] = useState<Mode>(
    MODES.some((item) => item.id === initial) ? (initial as Mode) : 'snap',
  );

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--s-accent)]">
            Petros input modes
          </p>
          <h1>Bring the real work.</h1>
        </div>
        <p>
          Bring a question photo, paper working, a short voice turn, a finite five-minute session,
          or teach a topic back to a confused junior. Every route enters the same learning system;
          none is a generic answer chat.
        </p>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Choose a Petros input mode">
        {MODES.map((item) => (
          <button
            key={item.id}
            id={`mode-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            aria-controls={`mode-${item.id}`}
            className={styles.tab}
            onClick={() => setMode(item.id)}
          >
            <strong>{item.title}</strong>
            <span>{item.promise}</span>
          </button>
        ))}
      </div>

      {mode === 'snap' && <ImageMode key="snap" mode="snap" />}
      {mode === 'handwriting' && <ImageMode key="handwriting" mode="handwriting" />}
      {mode === 'voice' && <VoiceMode />}
      {mode === 'five-minute' && <FiveMinuteMode />}
      {mode === 'teach-back' && <PetrosTeachBack />}
    </main>
  );
}

function ImageMode({ mode }: { mode: 'snap' | 'handwriting' }) {
  const api = useStudentApi();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const lineRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [crop, setCrop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState<ProcessView | null>(null);
  const [questionId, setQuestionId] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [stuckPoint, setStuckPoint] = useState<
    'understanding' | 'setting_up' | 'choosing_method' | 'solving'
  >('understanding');
  const [lines, setLines] = useState<Array<{ id: string; order: number; text: string }>>([]);
  const [evaluation, setEvaluation] = useState<PetrosHandwritingEvaluation | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const file = files[activeIndex];
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const chooseFiles = (selected: FileList | null) => {
    if (!selected?.length) return;
    const next = Array.from(selected).slice(0, mode === 'handwriting' ? 10 : 1);
    setFiles(next);
    setActiveIndex(0);
    setView(null);
    setEvaluation(null);
    setSessionId(null);
    setError('');
  };

  const movePage = (from: number, delta: number) => {
    const to = from + delta;
    if (to < 0 || to >= files.length) return;
    setFiles((current) => {
      const next = [...current];
      [next[from], next[to]] = [next[to]!, next[from]!];
      return next;
    });
    setActiveIndex(to);
  };

  const applyProcessed = (processed: ProcessView) => {
    setView(processed);
    if (processed.questionExtraction) {
      const first = processed.questionExtraction.questions[0];
      setQuestionId(first?.id ?? '');
      setQuestionText(first?.text ?? '');
    }
    if (processed.handwritingRecognition) {
      setLines(
        processed.handwritingRecognition.lines.map((line) => ({
          id: line.id,
          order: line.order,
          text: line.text,
        })),
      );
    }
  };

  const uploadAndRead = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    setStatus('Preparing the selected region and removing local metadata…');
    try {
      const prepared = await prepareImage(file, rotation, crop);
      const intent = await api.post<{
        media: PetrosMediaObject;
        upload: { url: string };
      }>('/student/petros/media/intents', {
        kind: mode === 'snap' ? 'question_photo' : 'handwriting_page',
        filename: file.name || `${mode}.jpg`,
        declaredMimeType: prepared.blob.type,
        sizeBytes: prepared.blob.size,
        durationSeconds: null,
        width: prepared.width,
        height: prepared.height,
        pageIndex: activeIndex,
        idempotencyKey: newIdempotencyKey(),
      });
      setStatus('Uploading to owner-private storage and running the safety scan…');
      const uploaded = (await api.uploadPetrosMedia(intent.upload.url, prepared.blob, {
        idempotencyKey: newIdempotencyKey(),
        rotationDegrees: rotation,
        crop: crop ? { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } : null,
      })) as PetrosMediaObject;
      if (uploaded.state === 'quarantined' || uploaded.state === 'retryable_failure') {
        setView({
          media: uploaded,
          imageUnderstanding: null,
          questionExtraction: null,
          handwritingRecognition: null,
          handwritingEvaluation: null,
          transcription: null,
        });
        setStatus('');
        return;
      }
      setStatus(
        mode === 'snap'
          ? 'Reading the visible questions without solving them…'
          : 'Recognizing each line before any critique…',
      );
      const processed = await api.post<ProcessView>(
        `/student/petros/media/${uploaded.id}/process`,
        { idempotencyKey: newIdempotencyKey() },
      );
      applyProcessed(processed);
      setStatus('');
    } catch (cause) {
      setError(formatApiError(cause));
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  const retryProcessing = async () => {
    if (!view?.media.canRetry) return;
    setBusy(true);
    setError('');
    setStatus('Retrying the registered media functions…');
    try {
      applyProcessed(
        await api.post<ProcessView>(`/student/petros/media/${view.media.id}/process`, {
          idempotencyKey: newIdempotencyKey(),
        }),
      );
      setStatus('');
    } catch (cause) {
      setError(formatApiError(cause));
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  const selectQuestion = (id: string) => {
    setQuestionId(id);
    setQuestionText(
      view?.questionExtraction?.questions.find((question) => question.id === id)?.text ?? '',
    );
  };

  const startQuestion = async () => {
    if (!view || !questionId || !questionText.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.post<{
        session: PetrosLearningSessionDocument;
        opening: {
          prompt: string;
          fastestUsefulNextStep: string;
          completeSolutionIncluded: boolean;
        };
      }>(`/student/petros/media/${view.media.id}/confirm-question`, {
        selectedQuestionId: questionId,
        correctedQuestion: questionText,
        stuckPoint,
        idempotencyKey: newIdempotencyKey(),
      });
      sessionStorage.setItem(
        `petros:snap-opening:${result.session.id}`,
        JSON.stringify(result.opening),
      );
      router.push(`/petros/session?session=${result.session.id}&mode=snap`);
    } catch (cause) {
      setError(formatApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  const critique = async () => {
    if (!view || !lines.length) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.post<{
        evaluation: PetrosHandwritingEvaluation | null;
        session: PetrosLearningSessionDocument | null;
      }>(`/student/petros/media/${view.media.id}/confirm-handwriting`, {
        correctedLines: lines,
        idempotencyKey: newIdempotencyKey(),
      });
      setEvaluation(result.evaluation);
      setSessionId(result.session?.id ?? null);
      if (!result.evaluation)
        setError(
          'The critique route is temporarily unavailable. Your corrected lines remain ready to retry.',
        );
    } catch (cause) {
      setError(formatApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!view) return;
    await api
      .post(`/student/petros/media/${view.media.id}/cancel`, {
        idempotencyKey: newIdempotencyKey(),
      })
      .catch(() => undefined);
    setView(null);
    setStatus('Cancelled. No processing will continue.');
  };

  const retake = () => {
    setFiles([]);
    setView(null);
    setEvaluation(null);
    setSessionId(null);
    setQuestionText('');
    setLines([]);
    setRotation(0);
    setCrop(false);
    setError('');
    setStatus('');
    inputRef.current?.click();
  };

  const recognition = view?.handwritingRecognition;
  return (
    <section
      id={`mode-${mode}`}
      role="tabpanel"
      className={styles.panel}
      aria-labelledby={`mode-tab-${mode}`}
    >
      <h2>{mode === 'snap' ? 'Snap a textbook or worksheet question' : 'Show handwritten work'}</h2>
      <p>
        {mode === 'snap'
          ? 'Crop to the useful region, verify the extracted question, and choose where you are stuck. Petros will not lead with the complete solution.'
          : 'Add up to ten pages, put them in order, then process each relevant page. Recognition is editable before any grader-style feedback.'}
      </p>

      {!file ? (
        <label className={styles.drop}>
          <span>
            <strong>Use camera or choose {mode === 'snap' ? 'a photo' : 'page photos'}</strong>
            <br />
            <small>JPEG, PNG, or WebP · metadata stripped server-side</small>
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple={mode === 'handwriting'}
            onChange={(event) => chooseFiles(event.target.files)}
          />
        </label>
      ) : (
        <div className={`${styles.grid} ${styles.two}`}>
          <div>
            {mode === 'handwriting' && files.length > 1 && (
              <ol className={styles.queue} aria-label="Handwriting page order">
                {files.map((item, index) => (
                  <li key={`${item.name}-${index}`} data-active={index === activeIndex}>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => setActiveIndex(index)}
                    >
                      Page {index + 1}: {item.name}
                    </button>{' '}
                    <button
                      type="button"
                      aria-label={`Move page ${index + 1} earlier`}
                      onClick={() => movePage(index, -1)}
                    >
                      ↑
                    </button>{' '}
                    <button
                      type="button"
                      aria-label={`Move page ${index + 1} later`}
                      onClick={() => movePage(index, 1)}
                    >
                      ↓
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <div className={`${styles.previewWrap} ${crop ? styles.cropped : ''}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt={`Preview of ${file.name}`}
                style={{
                  transform: `rotate(${rotation}deg)${crop ? ' scale(1.2)' : ''}`,
                }}
              />
              {recognition && (
                <div className={styles.overlay} aria-hidden="true">
                  {recognition.lines.map((line) => (
                    <button
                      key={line.id}
                      type="button"
                      className={styles.lineBox}
                      style={{
                        left: `${line.region.x * 100}%`,
                        top: `${line.region.y * 100}%`,
                        width: `${line.region.width * 100}%`,
                        height: `${line.region.height * 100}%`,
                      }}
                      onClick={() => lineRefs.current[line.id]?.focus()}
                      tabIndex={-1}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className={styles.toolbar}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setRotation(((rotation + 90) % 360) as typeof rotation)}
              >
                Rotate 90°
              </button>
              <button
                type="button"
                className={styles.secondary}
                aria-pressed={crop}
                onClick={() => setCrop((value) => !value)}
              >
                {crop ? 'Use full image' : 'Crop center 80%'}
              </button>
              <button type="button" className={styles.secondary} onClick={retake}>
                Retake
              </button>
            </div>
          </div>

          <div aria-live="polite">
            {!view && (
              <button
                type="button"
                className={styles.button}
                disabled={busy}
                onClick={uploadAndRead}
              >
                {busy ? 'Working…' : mode === 'snap' ? 'Read this question' : 'Recognize this page'}
              </button>
            )}
            {view?.media.state === 'retryable_failure' && (
              <div className={styles.notice}>
                Petros could not read this confidently.{' '}
                {view.media.failureCode === 'PETROS_MEDIA_UNREADABLE'
                  ? 'Retake in better light, reduce glare, or crop closer.'
                  : 'Retry processing or use text input.'}
              </div>
            )}
            {view?.media.state === 'retryable_failure' && view.media.canRetry && (
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={retryProcessing}
              >
                {busy ? 'Retrying…' : 'Retry processing'}
              </button>
            )}
            {mode === 'snap' && view?.media.state === 'retryable_failure' && (
              <div>
                <h3>Use text instead</h3>
                <div className={styles.field}>
                  <label htmlFor="manual-question">Type the question</label>
                  <textarea
                    id="manual-question"
                    value={questionText}
                    onChange={(event) => {
                      setQuestionId('manual');
                      setQuestionText(event.target.value);
                    }}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="manual-stuck-point">Where are you stuck?</label>
                  <select
                    id="manual-stuck-point"
                    value={stuckPoint}
                    onChange={(event) => setStuckPoint(event.target.value as typeof stuckPoint)}
                  >
                    <option value="understanding">Understanding the question</option>
                    <option value="setting_up">Setting it up</option>
                    <option value="choosing_method">Choosing a method</option>
                    <option value="solving">Solving after setup</option>
                  </select>
                </div>
                <button
                  type="button"
                  className={styles.button}
                  disabled={busy || questionText.trim().length < 2}
                  onClick={startQuestion}
                >
                  Use typed question and teach this point
                </button>
              </div>
            )}
            {view?.media.state === 'quarantined' && (
              <div className={styles.error}>
                The safety scan quarantined this file. It was not sent to an AI provider.
              </div>
            )}

            {mode === 'snap' && view?.questionExtraction && (
              <div>
                <h3>Confirm the question</h3>
                {view.questionExtraction.questions.length > 1 && (
                  <div className={styles.field}>
                    <span>Which question?</span>
                    <select
                      value={questionId}
                      onChange={(event) => selectQuestion(event.target.value)}
                    >
                      {view.questionExtraction.questions.map((question, index) => (
                        <option key={question.id} value={question.id}>
                          Question {index + 1} · {Math.round(question.confidence * 100)}% confidence
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className={styles.field}>
                  <label htmlFor="corrected-question">
                    Extracted text — correct anything wrong
                  </label>
                  <textarea
                    id="corrected-question"
                    value={questionText}
                    onChange={(event) => setQuestionText(event.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="stuck-point">Where are you stuck?</label>
                  <select
                    id="stuck-point"
                    value={stuckPoint}
                    onChange={(event) => setStuckPoint(event.target.value as typeof stuckPoint)}
                  >
                    <option value="understanding">Understanding the question</option>
                    <option value="setting_up">Setting it up</option>
                    <option value="choosing_method">Choosing a method</option>
                    <option value="solving">Solving after setup</option>
                  </select>
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={busy}
                    onClick={startQuestion}
                  >
                    Confirm and teach this point
                  </button>
                  <button type="button" className={styles.secondary} onClick={retake}>
                    Retake
                  </button>
                </div>
              </div>
            )}

            {mode === 'handwriting' && recognition && !evaluation && (
              <div>
                <h3>Correct recognized lines before critique</h3>
                {recognition.overallConfidence < 0.7 && (
                  <div className={styles.notice}>
                    Recognition confidence is low. Petros will not pretend these lines are
                    certain—correct each one before continuing.
                  </div>
                )}
                <ol className={styles.recognized} aria-label="Recognized work in reading order">
                  {lines
                    .sort((a, b) => a.order - b.order)
                    .map((line) => {
                      const source = recognition.lines.find(
                        (candidate) => candidate.id === line.id,
                      )!;
                      return (
                        <li key={line.id}>
                          <div className={styles.confidence}>
                            Line {line.order} · {Math.round(source.confidence * 100)}% confidence{' '}
                            {source.uncertainTokens.length
                              ? `· uncertain: ${source.uncertainTokens.join(', ')}`
                              : ''}
                          </div>
                          <textarea
                            ref={(node) => {
                              lineRefs.current[line.id] = node;
                            }}
                            aria-label={`Correct recognized line ${line.order}`}
                            value={line.text}
                            onChange={(event) =>
                              setLines((current) =>
                                current.map((candidate) =>
                                  candidate.id === line.id
                                    ? { ...candidate, text: event.target.value }
                                    : candidate,
                                ),
                              )
                            }
                          />
                        </li>
                      );
                    })}
                </ol>
                <button type="button" className={styles.button} disabled={busy} onClick={critique}>
                  Confirm lines and critique
                </button>
              </div>
            )}

            {evaluation && (
              <div>
                <h3>Line-linked critique</h3>
                <p className={styles.transcript}>{evaluation.accessibleSummary}</p>
                <ol className={styles.feedback}>
                  {evaluation.lines.map((line) => (
                    <li
                      key={line.lineId}
                      className={
                        line.status === 'first_break'
                          ? styles.firstBreak
                          : line.status === 'consequence_error'
                            ? styles.consequence
                            : ''
                      }
                    >
                      <strong>
                        {line.status === 'first_break'
                          ? 'First logical break'
                          : line.status === 'consequence_error'
                            ? 'Later consequence'
                            : line.status.replace(/_/g, ' ')}
                      </strong>{' '}
                      · {line.category}
                      <p>{line.feedback}</p>
                      {line.graderCircle && (
                        <p>
                          <b>A grader would circle:</b> {line.graderCircle}
                        </p>
                      )}
                      {line.markImpact && (
                        <p>
                          <b>Mark impact:</b> {line.markImpact}
                        </p>
                      )}
                      <small>{Math.round(line.confidence * 100)}% analysis confidence</small>
                    </li>
                  ))}
                </ol>
                <div className={styles.notice}>
                  <b>Missing step:</b> {evaluation.teachingStep}
                  <br />
                  <b>Reattempt:</b> {evaluation.reattemptPrompt}
                </div>
                {evaluation.uncertaintyDisclosure && <p>{evaluation.uncertaintyDisclosure}</p>}
                {sessionId && (
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() =>
                      router.push(`/petros/session?session=${sessionId}&mode=handwriting`)
                    }
                  >
                    Teach the missing step and reattempt
                  </button>
                )}
              </div>
            )}

            {view && !['session_created', 'quarantined', 'deleted'].includes(view.media.state) && (
              <div className={styles.actions}>
                <button type="button" className={styles.danger} onClick={cancel}>
                  Cancel processing
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {status && (
        <div className={styles.status} role="status">
          {status}
        </div>
      )}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

function VoiceMode() {
  const api = useStudentApi();
  const router = useRouter();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [concept, setConcept] = useState('');
  const [language, setLanguage] = useState('en');
  const [mixedLanguage, setMixedLanguage] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [session, setSession] = useState<PetrosLearningSessionDocument | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [media, setMedia] = useState<PetrosMediaObject | null>(null);
  const [transcription, setTranscription] = useState<PetrosSpeechTranscription | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState('');
  const [rawReplayUrl, setRawReplayUrl] = useState('');
  const [spokenText, setSpokenText] = useState('');
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [degradation, setDegradation] = useState('');

  const metric = useCallback(
    (type: string, patch: Record<string, unknown> = {}) => {
      void api
        .post('/student/petros/modality-events', {
          mode: 'voice',
          type,
          sessionId: session?.id,
          mediaId: media?.id,
          idempotencyKey: newIdempotencyKey(),
          ...patch,
        })
        .catch(() => undefined);
    },
    [api, media?.id, session?.id],
  );

  const stopTracks = useCallback(
    (background = false) => {
      const recorder = recorderRef.current;
      if (recorder?.state === 'recording') recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setRecording(false);
      if (background) metric('background_stop');
    },
    [metric],
  );

  useEffect(() => {
    const visibility = () => {
      if (document.hidden) stopTracks(true);
    };
    const pagehide = () => stopTracks(true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pagehide);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pagehide);
      stopTracks(false);
      if (rawReplayUrl) URL.revokeObjectURL(rawReplayUrl);
    };
  }, [rawReplayUrl, stopTracks]);

  const startSession = async () => {
    if (!concept.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.post<{ session: PetrosLearningSessionDocument }>(
        '/student/petros/voice/sessions',
        {
          concept,
          language,
          mixedLanguage,
          handsFree,
          idempotencyKey: newIdempotencyKey(),
        },
      );
      setSession(result.session);
    } catch (cause) {
      setError(formatApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  const beginRecording = async () => {
    if (!session || recording) return;
    setError('');
    setTranscription(null);
    setTranscriptDraft('');
    setSpokenText('');
    setDegradation('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error(
          'This browser does not support microphone recording. Use text mode instead.',
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const mime = preferredAudioMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => void finishRecording(recorder.mimeType || mime || 'audio/webm');
      startedAtRef.current = Date.now();
      recorder.start(250);
      setRecording(true);
      setElapsed(0);
      metric('recording_started');
      timerRef.current = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAtRef.current) / 1_000);
        setElapsed(seconds);
        if (seconds >= (handsFree ? 30 : 120)) stopTracks(false);
      }, 500);
    } catch (cause) {
      metric('permission_denied');
      setError(cause instanceof Error ? cause.message : 'Microphone permission was denied.');
    }
  };

  const finishRecording = async (mime: string) => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
    const durationSeconds = Math.max(0.25, (Date.now() - startedAtRef.current) / 1_000);
    metric('recording_stopped', {
      durationMs: Math.round(durationSeconds * 1_000),
    });
    const blob = new Blob(chunksRef.current, { type: mime.split(';')[0] });
    if (!blob.size) {
      setError('No audio was captured. Check the microphone and retry.');
      return;
    }
    if (rawReplayUrl) URL.revokeObjectURL(rawReplayUrl);
    setRawReplayUrl(URL.createObjectURL(blob));
    setBusy(true);
    try {
      const intent = await api.post<{
        media: PetrosMediaObject;
        upload: { url: string };
      }>('/student/petros/media/intents', {
        kind: 'voice_turn',
        filename: `voice-turn.${audioExtension(blob.type)}`,
        declaredMimeType: blob.type,
        sizeBytes: blob.size,
        durationSeconds,
        width: null,
        height: null,
        pageIndex: 0,
        idempotencyKey: newIdempotencyKey(),
      });
      const uploaded = (await api.uploadPetrosMedia(intent.upload.url, blob, {
        idempotencyKey: newIdempotencyKey(),
      })) as PetrosMediaObject;
      setMedia(uploaded);
      const processed = await api.post<ProcessView>(
        `/student/petros/media/${uploaded.id}/process`,
        { idempotencyKey: newIdempotencyKey() },
      );
      setMedia(processed.media);
      const finalTranscript = processed.transcription;
      if (!finalTranscript)
        throw new Error('Petros did not return a transcript. Replay the turn or switch to text.');
      setTranscription(finalTranscript);
      setTranscriptDraft(finalTranscript.text);
    } catch (cause) {
      setError(formatApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  const submitTranscript = async () => {
    if (!session || !media || !transcription || !transcriptDraft.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.post<{
        session: PetrosLearningSessionDocument;
        transcript: PetrosSpeechTranscription & { corrected: boolean };
        spoken: {
          transcript: string;
          audio: { dataBase64: string; mimeType: string } | null;
          degradation: string | null;
        };
      }>('/student/petros/voice/turns', {
        mediaId: media.id,
        sessionId: session.id,
        transcriptCorrection: transcriptDraft,
        confidence: 'think_so',
        language,
        mixedLanguage,
        interruptPrevious: false,
        idempotencyKey: newIdempotencyKey(),
      });
      setSession(result.session);
      setSpokenText(result.spoken.transcript);
      setDegradation(result.spoken.degradation ?? '');
      if (result.transcript.corrected) metric('transcript_corrected');
      if (result.spoken.audio && !muted) {
        const src = `data:${result.spoken.audio.mimeType};base64,${result.spoken.audio.dataBase64}`;
        audioRef.current = new Audio(src);
        await audioRef.current.play().catch(() => {
          metric('tts_failed');
          setDegradation('Audio playback was blocked. The complete transcript is shown below.');
        });
      }
      setMedia(null);
      setTranscription(null);
      setTranscriptDraft('');
    } catch (cause) {
      setError(formatApiError(cause));
      metric('network_disconnect');
    } finally {
      setBusy(false);
    }
  };

  const interrupt = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    metric('interruption');
    void beginRecording();
  };

  return (
    <section
      id="mode-voice"
      role="tabpanel"
      className={styles.panel}
      aria-labelledby="mode-tab-voice"
    >
      <h2>Voice session</h2>
      <p>
        Voice is optional and turn-based. Petros never records after pause, tab backgrounding, or
        close. Every spoken move has a complete text equivalent.
      </p>
      {!session ? (
        <div className={styles.grid}>
          <div className={styles.field}>
            <label htmlFor="voice-concept">Concept or goal</label>
            <input
              id="voice-concept"
              value={concept}
              onChange={(event) => setConcept(event.target.value)}
              placeholder="e.g. why integration by parts works"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="voice-language">Language</label>
            <input
              id="voice-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            />
          </div>
          <label>
            <input
              type="checkbox"
              checked={mixedLanguage}
              onChange={(event) => setMixedLanguage(event.target.checked)}
            />{' '}
            Allow natural mixed-language explanation
          </label>
          <label>
            <input
              type="checkbox"
              checked={handsFree}
              onChange={(event) => setHandsFree(event.target.checked)}
            />{' '}
            Walking mode: auto-stop each turn at 30 seconds
          </label>
          <button
            type="button"
            className={styles.button}
            disabled={busy || !concept.trim()}
            onClick={startSession}
          >
            Start voice session
          </button>
        </div>
      ) : (
        <div>
          <div className={styles.finite}>
            <b>{session.topic}</b> · Move{' '}
            {session.blocks.find((block) => block.status === 'current')?.sequence ??
              session.blocks.length}{' '}
            of {session.maxMoves}
            <br />
            Recording remains off until you start a turn.
          </div>
          <div className={styles.voiceControls}>
            <button
              type="button"
              className={styles.recording}
              data-active={recording}
              aria-pressed={recording}
              onClick={() => (recording ? stopTracks(false) : void beginRecording())}
            >
              {recording ? `Stop ${elapsed}s` : 'Talk'}
            </button>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                aria-pressed={muted}
                onClick={() => {
                  setMuted((value) => !value);
                  audioRef.current?.pause();
                }}
              >
                {muted ? 'Unmute replies' : 'Mute replies'}
              </button>
              <button type="button" className={styles.secondary} onClick={interrupt}>
                Interrupt / new turn
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  stopTracks(false);
                  metric('switched_to_text');
                  router.push(`/petros/session?session=${session.id}`);
                }}
              >
                Switch to text
              </button>
            </div>
          </div>
          {rawReplayUrl && (
            <audio controls src={rawReplayUrl} aria-label="Replay your recorded voice turn" />
          )}
          {busy && (
            <div className={styles.status} role="status">
              Processing this bounded turn…
            </div>
          )}
          {transcription && (
            <div>
              <div className={styles.field}>
                <label htmlFor="voice-transcript">
                  Transcript — correct before Petros observes it
                </label>
                <textarea
                  id="voice-transcript"
                  value={transcriptDraft}
                  onChange={(event) => setTranscriptDraft(event.target.value)}
                />
              </div>
              {transcription.uncertainSegments.length > 0 && (
                <div className={styles.notice}>
                  Petros is uncertain about {transcription.uncertainSegments.length} segment(s).
                  Replay and correct the text above; the correction becomes source of truth.
                </div>
              )}
              <button
                type="button"
                className={styles.button}
                disabled={busy}
                onClick={submitTranscript}
              >
                Use confirmed transcript
              </button>
            </div>
          )}
          {spokenText && (
            <div className={styles.transcript} aria-live="polite">
              <b>Petros transcript</b>
              <p>{spokenText}</p>
            </div>
          )}
          {degradation && <div className={styles.notice}>{degradation}</div>}
        </div>
      )}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

function FiveMinuteMode() {
  const api = useStudentApi();
  const router = useRouter();
  const [concept, setConcept] = useState('');
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api.post<{ session: PetrosLearningSessionDocument }>(
        '/student/petros/five-minute/sessions',
        {
          concept,
          goal: goal.trim() || undefined,
          language: 'en',
          idempotencyKey: newIdempotencyKey(),
        },
      );
      router.push(`/petros/session?session=${result.session.id}&mode=five-minute`);
    } catch (cause) {
      setError(formatApiError(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      id="mode-five-minute"
      role="tabpanel"
      className={styles.panel}
      aria-labelledby="mode-tab-five-minute"
    >
      <h2>Five-minute mode</h2>
      <p>
        This is a finite promise, not an engagement loop. It uses one guess, one targeted teaching
        move, one check, and one student-curated card. Continuing requires a separate explicit
        choice.
      </p>
      <div className={styles.finite}>
        <b>4 moves · about 5 minutes</b>
        <br />
        Learning evidence and any card you choose to save persist exactly like a longer session.
      </div>
      <div className={styles.field}>
        <label htmlFor="five-concept">One concept</label>
        <input
          id="five-concept"
          value={concept}
          onChange={(event) => setConcept(event.target.value)}
          placeholder="e.g. the chain rule"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="five-goal">Optional goal</label>
        <input
          id="five-goal"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="What should feel clearer at the end?"
        />
      </div>
      <button
        type="button"
        className={styles.button}
        disabled={busy || concept.trim().length < 2}
        onClick={start}
      >
        {busy ? 'Starting…' : 'Start the five-minute session'}
      </button>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

async function prepareImage(file: File, rotation: 0 | 90 | 180 | 270, cropCenter: boolean) {
  const bitmap = await createImageBitmap(file);
  const sourceX = cropCenter ? Math.round(bitmap.width * 0.1) : 0;
  const sourceY = cropCenter ? Math.round(bitmap.height * 0.1) : 0;
  const sourceWidth = cropCenter ? Math.round(bitmap.width * 0.8) : bitmap.width;
  const sourceHeight = cropCenter ? Math.round(bitmap.height * 0.8) : bitmap.height;
  const swap = rotation === 90 || rotation === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? sourceHeight : sourceWidth;
  canvas.height = swap ? sourceWidth : sourceHeight;
  const context = canvas.getContext('2d');
  if (!context)
    throw new Error(
      'This browser cannot prepare the image. Upload the original or use text input.',
    );
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -sourceWidth / 2,
    -sourceHeight / 2,
    sourceWidth,
    sourceHeight,
  );
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Image conversion failed.'))),
      'image/jpeg',
      0.9,
    ),
  );
  return { blob, width: canvas.width, height: canvas.height };
}

function preferredAudioMime() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

function audioExtension(mime: string) {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg')) return 'mp3';
  return 'webm';
}
