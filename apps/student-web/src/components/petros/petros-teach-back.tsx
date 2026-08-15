'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PetrosMediaObject,
  PetrosSpeechTranscription,
  PetrosTeachBackSessionDocument,
} from '@edrion/schemas';
import { formatApiError, newIdempotencyKey, useStudentApi } from '@/lib/api-client';
import { PetrosArtifactCuration } from './petros-artifact-curation';
import styles from './petros-teach-back.module.css';

type VoiceProcessing = {
  media: PetrosMediaObject;
  transcription: PetrosSpeechTranscription | null;
};

export function PetrosTeachBack() {
  const api = useStudentApi();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);
  const [topic, setTopic] = useState('');
  const [scope, setScope] = useState('');
  const [audienceLevel, setAudienceLevel] = useState<
    'younger_student' | 'classmate' | 'beginner_adult'
  >('younger_student');
  const [audienceLabel, setAudienceLabel] = useState('a curious junior student');
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [session, setSession] = useState<PetrosTeachBackSessionDocument | null>(null);
  const [repeatedFromSessionId, setRepeatedFromSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [source, setSource] = useState<'text' | 'voice'>('text');
  const [voiceMedia, setVoiceMedia] = useState<PetrosMediaObject | null>(null);
  const [voiceConfidence, setVoiceConfidence] = useState<number | null>(null);
  const [voiceUncertain, setVoiceUncertain] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [replayUrl, setReplayUrl] = useState('');
  const [editingSegment, setEditingSegment] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const stopRecording = useCallback((background = false) => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
    if (background)
      setMessage(
        'Recording stopped because the page moved to the background. Nothing continues recording.',
      );
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - recordingStartedRef.current) / 1_000);
      setRecordingSeconds(seconds);
      if (seconds >= 120) stopRecording(false);
    }, 500);
    return () => window.clearInterval(timer);
  }, [recording, stopRecording]);

  useEffect(() => {
    const visibility = () => {
      if (document.hidden) stopRecording(true);
    };
    const pageHide = () => stopRecording(true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pageHide);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pageHide);
      stopRecording(false);
    };
  }, [stopRecording]);

  useEffect(
    () => () => {
      if (replayUrl) URL.revokeObjectURL(replayUrl);
    },
    [replayUrl],
  );

  const start = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.post<PetrosTeachBackSessionDocument>(
        '/student/petros/teach-it-back/sessions',
        {
          topic,
          scope: scope.trim() || null,
          audienceLevel,
          audienceLabel,
          mode,
          language: 'en',
          timeBudgetSeconds: 720,
          maxMoves: 8,
          repeatedFromSessionId,
          idempotencyKey: newIdempotencyKey(),
        },
      );
      setSession(result);
      setRepeatedFromSessionId(null);
      setSource(mode);
    } catch (cause) {
      setError(formatApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (!session) return;
    setSession(
      await api.get<PetrosTeachBackSessionDocument>(
        `/student/petros/teach-it-back/sessions/${session.id}`,
      ),
    );
  };

  const submit = async () => {
    if (!session || !draft.trim()) return;
    const openFollowUp = session.followUps.find((item) => item.status === 'open');
    setBusy(true);
    setError('');
    setMessage('Petros is listening for one high-value gap…');
    try {
      const next = await api.post<PetrosTeachBackSessionDocument>(
        `/student/petros/teach-it-back/sessions/${session.id}/segments`,
        {
          text: draft,
          source,
          mediaId: source === 'voice' ? (voiceMedia?.id ?? null) : null,
          responseToFollowUpId: openFollowUp?.id ?? null,
          transcriptionConfidence: source === 'voice' ? voiceConfidence : null,
          uncertainTranscript: source === 'voice' ? voiceUncertain : false,
          expectedVersion: session.version,
          idempotencyKey: newIdempotencyKey(),
        },
      );
      setSession(next);
      setDraft('');
      setVoiceMedia(null);
      setVoiceConfidence(null);
      setVoiceUncertain(false);
      setSource(next.mode);
      setMessage(
        next.status === 'closed'
          ? 'The finite explanation budget closed with a verdict.'
          : 'Explanation segment kept.',
      );
    } catch (cause) {
      setError(formatApiError(cause));
      setMessage('');
    } finally {
      setBusy(false);
    }
  };

  const requestHelp = async (action: 'hint' | 'help' | 'i_dont_know' | 'skip') => {
    if (!session) return;
    const open = session.followUps.find((item) => item.status === 'open');
    setBusy(true);
    setError('');
    try {
      setSession(
        await api.post<PetrosTeachBackSessionDocument>(
          `/student/petros/teach-it-back/sessions/${session.id}/help`,
          {
            action,
            followUpId: open?.id ?? null,
            expectedVersion: session.version,
            idempotencyKey: newIdempotencyKey(),
          },
        ),
      );
      setMessage(
        action === 'skip'
          ? 'Skipped safely. Continue with the part you can explain.'
          : 'Petros supplied the bridge instead of withholding it. Continue in your own words.',
      );
    } catch (cause) {
      setError(formatApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  const lifecycle = async (action: 'pause' | 'resume' | 'close') => {
    if (!session) return;
    stopRecording(false);
    setBusy(true);
    setError('');
    try {
      const next = await api.post<PetrosTeachBackSessionDocument>(
        `/student/petros/teach-it-back/sessions/${session.id}/${action}`,
        {
          expectedVersion: session.version,
          idempotencyKey: newIdempotencyKey(),
        },
      );
      setSession(next);
    } catch (cause) {
      setError(formatApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  const correct = async (segmentId: string) => {
    if (!session || !editDraft.trim()) return;
    setBusy(true);
    setError('');
    try {
      const next = await api.put<PetrosTeachBackSessionDocument>(
        `/student/petros/teach-it-back/sessions/${session.id}/segments/${segmentId}`,
        {
          text: editDraft,
          expectedVersion: session.version,
          idempotencyKey: newIdempotencyKey(),
        },
      );
      setSession(next);
      setEditingSegment(null);
      setEditDraft('');
      setMessage('Correction is now the source of truth; the old follow-up was retired.');
    } catch (cause) {
      setError(formatApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  const beginVoice = async () => {
    if (!session || recording) return;
    setError('');
    setMessage('');
    setDraft('');
    setVoiceMedia(null);
    setVoiceConfidence(null);
    setVoiceUncertain(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error(
          'This browser cannot record audio. Switch to text; no learning information is audio-only.',
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
      recorder.onstop = () => void processVoice(recorder.mimeType || mime || 'audio/webm');
      recordingStartedRef.current = Date.now();
      setRecordingSeconds(0);
      recorder.start(250);
      setRecording(true);
    } catch (cause) {
      setSource('text');
      setError(
        cause instanceof Error
          ? cause.message
          : 'Microphone permission was denied. Text remains available.',
      );
    }
  };

  const processVoice = async (mime: string) => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
    const durationSeconds = Math.max(0.25, (Date.now() - recordingStartedRef.current) / 1_000);
    const blob = new Blob(chunksRef.current, { type: mime.split(';')[0] });
    if (!blob.size) {
      setError('No audio was captured. Switch to text or retry.');
      return;
    }
    if (replayUrl) URL.revokeObjectURL(replayUrl);
    setReplayUrl(URL.createObjectURL(blob));
    setBusy(true);
    setMessage('Transcribing this bounded turn. You must confirm the text before analysis.');
    try {
      const intent = await api.post<{
        media: PetrosMediaObject;
        upload: { url: string };
      }>('/student/petros/media/intents', {
        kind: 'voice_turn',
        filename: `teach-back.${audioExtension(blob.type)}`,
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
      const processed = await api.post<VoiceProcessing>(
        `/student/petros/media/${uploaded.id}/process`,
        { idempotencyKey: newIdempotencyKey() },
      );
      if (!processed.transcription)
        throw new Error('No transcript was returned. Replay or switch to text.');
      setVoiceMedia(processed.media);
      setVoiceConfidence(processed.transcription.confidence);
      setVoiceUncertain(
        processed.transcription.uncertainSegments.length > 0 ||
          processed.transcription.confidence < 0.65,
      );
      setDraft(processed.transcription.text);
      setSource('voice');
      setMessage(
        'Correct the transcript below. Your confirmed text—not uncertain audio recognition—becomes the explanation.',
      );
    } catch (cause) {
      setSource('text');
      setError(formatApiError(cause));
      setMessage('');
    } finally {
      setBusy(false);
    }
  };

  if (!session)
    return (
      <section
        id="mode-teach-back"
        role="tabpanel"
        aria-labelledby="mode-tab-teach-back"
        className={styles.panel}
      >
        <p className={styles.eyebrow}>REVERSED SESSION</p>
        <h2>Explain this to Petros as if teaching a junior.</h2>
        <p>
          You generate the explanation. Petros listens, asks one genuinely confused question at a
          time, and ends with a concise verdict—not a score.
        </p>
        <div className={styles.formGrid}>
          <label>
            Topic
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="e.g. why the chain rule works"
            />
          </label>
          <label>
            Optional scope
            <input
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              placeholder="Limit this to one syllabus outcome"
            />
          </label>
          <label>
            Junior audience
            <select
              value={audienceLevel}
              onChange={(event) => setAudienceLevel(event.target.value as typeof audienceLevel)}
            >
              <option value="younger_student">Younger student</option>
              <option value="classmate">Classmate new to the topic</option>
              <option value="beginner_adult">Beginner adult</option>
            </select>
          </label>
          <label>
            Audience description
            <input
              value={audienceLabel}
              onChange={(event) => setAudienceLabel(event.target.value)}
            />
          </label>
          <fieldset>
            <legend>Explanation input</legend>
            <label>
              <input type="radio" checked={mode === 'text'} onChange={() => setMode('text')} /> Text
            </label>
            <label>
              <input type="radio" checked={mode === 'voice'} onChange={() => setMode('voice')} />{' '}
              Optional voice
            </label>
          </fieldset>
        </div>
        {mode === 'voice' && (
          <p className={styles.gate}>
            Pre-release voice gate: physical microphone, headset, interruption, background-stop,
            pronunciation, and mixed-language device QA from Stage 9 is still pending. Text remains
            fully equivalent.
          </p>
        )}
        <button
          className={styles.primary}
          disabled={busy || topic.trim().length < 2 || audienceLabel.trim().length < 2}
          onClick={() => void start()}
        >
          {busy ? 'Opening…' : 'Start Teach-it-back'}
        </button>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </section>
    );

  const openFollowUp = session.followUps.find((item) => item.status === 'open');
  const lastHelp = [...session.followUps].reverse().find((item) => item.status === 'helped');
  const progress = Math.min(
    100,
    Math.round((session.progress.movesUsed / session.progress.maxMoves) * 100),
  );

  return (
    <section
      id="mode-teach-back"
      role="tabpanel"
      aria-labelledby="mode-tab-teach-back"
      className={styles.session}
    >
      <header className={styles.sessionHead}>
        <div>
          <p className={styles.eyebrow}>TEACH-IT-BACK · {session.mode.toUpperCase()}</p>
          <h2>{session.topic}</h2>
          <p>
            Teaching {session.audience.label}
            {session.scope ? ` · ${session.scope}` : ''}
          </p>
        </div>
        <div className={styles.lifecycle}>
          {session.status === 'active' ? (
            <button disabled={busy} onClick={() => void lifecycle('pause')}>
              Pause
            </button>
          ) : session.status === 'paused' ? (
            <button disabled={busy} onClick={() => void lifecycle('resume')}>
              Resume
            </button>
          ) : null}
          <button
            disabled={busy || session.status === 'closed' || session.segments.length === 0}
            onClick={() => void lifecycle('close')}
          >
            Finish for verdict
          </button>
        </div>
      </header>
      <div
        className={styles.progress}
        aria-label={`${session.progress.movesUsed} of ${session.progress.maxMoves} explanation moves used`}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <p className={styles.finite}>
        Move {session.progress.movesUsed} of {session.progress.maxMoves} ·{' '}
        {Math.max(0, session.progress.timeBudgetSeconds - session.progress.elapsedSeconds)} seconds
        remain · maximum two probes per gap
      </p>
      {!session.voice.productionDeviceQaPassed && (
        <p className={styles.gate}>{session.voice.disclosure}</p>
      )}

      <aside className={styles.coverage} aria-label="Explanation coverage">
        <h3>Junior-ready coverage</h3>
        <ul>
          {session.coverageChecklist.map((item) => (
            <li key={item.key} data-status={item.status}>
              <span />
              {item.label}
              <small>{item.status}</small>
            </li>
          ))}
        </ul>
      </aside>

      <div className={styles.document}>
        <article className={styles.opening}>
          <p className={styles.eyebrow}>PETROS IS LISTENING</p>
          <h3>{session.opening}</h3>
          <p>
            Start anywhere sensible. Petros will not show you a rubric or seize the explanation.
          </p>
        </article>
        {session.segments.map((segment) => {
          const follow = session.followUps.find((item) => item.segmentId === segment.id);
          return (
            <div key={segment.id} className={styles.pair}>
              <article className={styles.segment}>
                <div>
                  <span>YOUR EXPLANATION · PART {segment.ordinal}</span>
                  <small>
                    {segment.source}
                    {segment.corrected ? ' · corrected source of truth' : ''}
                  </small>
                </div>
                {editingSegment === segment.id ? (
                  <>
                    <textarea
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                    />
                    <div className={styles.actions}>
                      <button disabled={busy} onClick={() => void correct(segment.id)}>
                        Use this correction
                      </button>
                      <button onClick={() => setEditingSegment(null)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>{segment.text}</p>
                    <button
                      className={styles.textButton}
                      onClick={() => {
                        setEditingSegment(segment.id);
                        setEditDraft(segment.text);
                      }}
                    >
                      Revise this segment
                    </button>
                  </>
                )}
              </article>
              {follow && (
                <article className={styles.follow} data-status={follow.status}>
                  <p className={styles.eyebrow}>JUNIOR IS CONFUSED ABOUT…</p>
                  <small>{follow.followUp.juniorTransition}</small>
                  <h3>{follow.followUp.question}</h3>
                  <p>Grounded in: “{follow.followUp.groundedIn.excerpt}”</p>
                  <div className={styles.probe}>
                    Probe {follow.followUp.probeNumber} of 2 · {follow.status}
                  </div>
                  {follow.status === 'helped' && follow.followUp.helpAfterCap && (
                    <div className={styles.help}>
                      <b>Petros explains after the probe:</b> {follow.followUp.helpAfterCap}
                    </div>
                  )}
                </article>
              )}
            </div>
          );
        })}
        {lastHelp && lastHelp.status === 'helped' && !openFollowUp && (
          <article className={styles.help}>
            <b>Use this bridge, then keep teaching:</b> {lastHelp.followUp.helpAfterCap}
          </article>
        )}
      </div>

      {session.status === 'active' && (
        <section className={styles.composer}>
          <label htmlFor="teach-back-draft">
            {openFollowUp
              ? 'Answer the junior, or revise the explanation'
              : session.segments.length
                ? 'Continue your explanation'
                : 'Your explanation'}
          </label>
          {session.mode === 'voice' && (
            <div className={styles.voiceControls}>
              <button
                className={recording ? styles.recording : styles.secondary}
                disabled={busy}
                aria-pressed={recording}
                onClick={() => (recording ? stopRecording(false) : void beginVoice())}
              >
                {recording
                  ? `Stop recording · ${recordingSeconds}s`
                  : 'Record an optional voice segment'}
              </button>
              <button
                className={styles.secondary}
                onClick={() => {
                  stopRecording(false);
                  setSource('text');
                  setVoiceMedia(null);
                  setVoiceConfidence(null);
                  setVoiceUncertain(false);
                }}
              >
                Switch this turn to text
              </button>
            </div>
          )}
          {replayUrl && (
            <audio controls src={replayUrl} aria-label="Replay your explanation segment" />
          )}
          <textarea
            id="teach-back-draft"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (source === 'voice') setVoiceUncertain(false);
            }}
            placeholder={
              openFollowUp
                ? 'Explain that missing connection in your own words…'
                : 'Teach the idea as if the listener is smart but completely new to it…'
            }
          />
          {source === 'voice' && (
            <p className={voiceUncertain ? styles.warning : styles.confirmed}>
              {voiceUncertain
                ? 'Recognition is uncertain. Correct the transcript before submitting; it will not be treated as a misconception.'
                : 'This confirmed transcript becomes the source of truth.'}
            </p>
          )}
          <div className={styles.actions}>
            <button
              className={styles.primary}
              disabled={
                busy || !draft.trim() || (source === 'voice' && (!voiceMedia || voiceUncertain))
              }
              onClick={() => void submit()}
            >
              {busy
                ? 'Listening…'
                : openFollowUp
                  ? 'Answer and continue'
                  : 'Submit explanation segment'}
            </button>
            {openFollowUp && (
              <>
                <button disabled={busy} onClick={() => void requestHelp('i_dont_know')}>
                  I don’t know—help
                </button>
                <button disabled={busy} onClick={() => void requestHelp('hint')}>
                  Give a hint
                </button>
                <button disabled={busy} onClick={() => void requestHelp('skip')}>
                  Skip safely
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {session.verdict && (
        <section className={styles.verdict}>
          <p className={styles.eyebrow}>EXPLANATION VERDICT · NOT A SCORE</p>
          <h2>{session.verdict.oneLine}</h2>
          <div className={styles.verdictGrid}>
            <div>
              <h3>What was clear</h3>
              {session.verdict.clear.map((item, index) => (
                <p key={index}>
                  {item.detail}
                  <small>“{item.evidence.excerpt}”</small>
                </p>
              ))}
            </div>
            <div>
              <h3>Most important gap</h3>
              <p>
                {session.verdict.mostImportantGap?.detail ?? 'No material gap was identified.'}
                {session.verdict.mostImportantGap && (
                  <small>“{session.verdict.mostImportantGap.evidence.excerpt}”</small>
                )}
              </p>
            </div>
            <div>
              <h3>One improvement</h3>
              <p>{session.verdict.suggestedImprovement}</p>
            </div>
            <div>
              <h3>Would it help {session.audience.label}?</h3>
              <p>{session.verdict.audienceReason}</p>
            </div>
          </div>
          {session.verdict.uncertaintyDisclosure && (
            <p className={styles.gate}>{session.verdict.uncertaintyDisclosure}</p>
          )}
          <p className={styles.official}>
            Official marks changed: <b>{String(session.verdict.officialAssessmentChanged)}</b>
          </p>
        </section>
      )}
      {session.status === 'closed' && session.artifactBundleId && (
        <PetrosArtifactCuration sessionId={session.learningSessionId} onCounts={() => undefined} />
      )}
      {session.status === 'closed' && (
        <div className={styles.actions}>
          <button
            className={styles.primary}
            onClick={() => {
              setRepeatedFromSessionId(session.id);
              setSession(null);
              setTopic(session.topic);
              setScope(session.scope ?? '');
              setMode('text');
            }}
          >
            Teach this topic again
          </button>
          <button
            className={styles.secondary}
            onClick={() => {
              setRepeatedFromSessionId(null);
              setSession(null);
              setTopic('');
              setScope('');
              setMode('text');
            }}
          >
            Teach another topic
          </button>
        </div>
      )}
      {message && (
        <p className={styles.message} role="status">
          {message}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}{' '}
          <button className={styles.textButton} onClick={() => void refresh()}>
            Reload state
          </button>
        </p>
      )}
    </section>
  );
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
