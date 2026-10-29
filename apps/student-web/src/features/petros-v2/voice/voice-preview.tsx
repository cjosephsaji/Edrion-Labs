'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { ActionButton } from '@/components/design-system/action-button';
import type { PresentationController } from '../presentation-controller';
import { useVoicePreview } from './use-voice-preview';
import type { VoicePreviewReceipt } from './voice-preview-types';
import styles from './voice-preview.module.css';

const PUBLIC_TEXT =
  'The vertical change is six. The horizontal change is three. Their ratio is two.';
function money(micros: number | null | undefined) {
  return typeof micros === 'number' && Number.isFinite(micros)
    ? `$${(micros / 1_000_000).toFixed(6)}`
    : 'Unavailable';
}
function Receipt({ receipt }: { receipt: VoicePreviewReceipt }) {
  return (
    <p className={styles.receipt}>
      Requested: {receipt.requestedVoice ?? 'transcription'}.{' '}
      Effective: {receipt.effective.providerKey} / {receipt.effective.modelKey}
      {receipt.effective.voice ? ` / ${receipt.effective.voice}` : ''}.
      Route: {receipt.effective.routeId}{receipt.fallback?.route ? ' (alternate route used)' : ''}.{' '}
      Estimate: {money(receipt.estimatedCostMicros)}. Actual provider bill:{' '}
      {money(receipt.actualCostMicros)}. Metering: {receipt.metering}.
    </p>
  );
}

type VoicePreviewProps = {
  controller: PresentationController;
  onTranscript: (transcript: string) => void;
  onRecordingChange?: (recording: boolean) => void;
  onPhaseChange?: (phase: string) => void;
  disabled?: boolean;
  publicReply?: string | null;
  session?: ReturnType<typeof useVoicePreview>;
};
export function VoicePreview(props: VoicePreviewProps) {
  const [expanded, setExpanded] = useState(false),
    [visited, setVisited] = useState(false);
  return (
    <details
      className={styles.panel}
      data-voice-preview
      onToggle={(event) => {
        setExpanded(event.currentTarget.open);
        if (event.currentTarget.open) setVisited(true);
      }}
    >
      <summary>Internal Voice Preview</summary>
      {visited && (props.session ? <VoicePreviewContent {...props} preview={props.session} /> : <OwnedVoicePreview {...props} enabled={expanded} />)}
    </details>
  );
}
function OwnedVoicePreview(props: VoicePreviewProps & { enabled: boolean }) {
  const preview = useVoicePreview(props.controller, props.onRecordingChange, props.enabled);
  return <VoicePreviewContent {...props} preview={preview} />;
}
function VoicePreviewContent({
  controller, onTranscript, onPhaseChange, disabled = false, publicReply, preview,
}: VoicePreviewProps & { preview: ReturnType<typeof useVoicePreview> }) {
  const id = useId();
  useEffect(() => { onPhaseChange?.(preview.phase); return () => onPhaseChange?.('idle'); }, [onPhaseChange, preview.phase]);
  const cancelPreview = preview.cancel;
  useEffect(() => {
    if (disabled) cancelPreview();
  }, [disabled, cancelPreview]);
  const presentation = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [routeId, setRouteId] = useState(''),
    [voiceName, setVoiceName] = useState(''),
    [sttId, setSttId] = useState('');
  const [text, setText] = useState(PUBLIC_TEXT),
    [publicText, setPublicText] = useState(false),
    [consent, setConsent] = useState(false);
  const status = preview.status,
    ready = status?.state === 'ready' && !preview.loadingStatus && !disabled;
  const route =
    status?.tts.find((candidate) => candidate.routeId === routeId) ??
    status?.tts[0];
  const voice = route?.voices.includes(voiceName)
    ? voiceName
    : (route?.voices[0] ?? '');
  const stt =
    status?.stt.find((candidate) => candidate.routeId === sttId) ??
    status?.stt[0];
  const maxText = Math.min(500, status?.limits.maxTextCharacters ?? 500),
    maxSeconds = Math.min(10, status?.limits.maxRecordingSeconds ?? 10);
  const busy = preview.phase !== 'idle',
    outputActive = Boolean(presentation.speech.preview);
  const labels = {
    idle: 'Ready for a preview action.',
    generating: 'Preparing voice preview…',
    permission_requested: 'Waiting for microphone permission…',
    recording: 'Recording · microphone capture is active.',
    encoding: 'Preparing your recording…',
    transcribing: 'Transcribing your recording…',
  };
  return (
    <div className={styles.content}>
      <p>
        AI generated voice auditions use public test text. Lesson dialogue
        remains simulated. Each generation or transcription can incur provider
        usage after server authorization.
      </p>
      <p className={styles.status} role="status" aria-live="polite">
        {preview.loadingStatus
          ? 'Checking authorized voice routes…'
          : status
            ? `${status.state === 'ready' ? 'Authorized isolated preview' : status.state === 'authorization_required' ? status.reasonCode === 'preview_disabled' ? 'Voice Preview disabled' : 'Paid audition approval required' : 'Voice preview unavailable'} · ${status.reason}`
            : preview.error || 'Voice status has not been checked. Text interaction is available.'}
      </p>
      {status?.ttsUnavailableReason && <p role="status">{status.ttsUnavailableReason}</p>}
      {disabled && (
        <p role="status">
          Voice actions are unavailable in assessment-safe preview.
        </p>
      )}
      <ActionButton
        variant="secondary"
        disabled={preview.loadingStatus || busy}
        onClick={() => void preview.refresh()}
      >
        Refresh route status
      </ActionButton>
      <details className={styles.inventory}>
        <summary>Previous route audit and current limits</summary>
        <p>
          Inspected 11 October 2026: OpenAI tts-1 used Onyx/WAV; Groq
          whisper-large-v3-turbo and whisper-large-v3 were STT candidates. This
          historical inventory does not establish current authorization or
          account availability. Cedar and Marin were not configured.
        </p>
        <p>
          Live selectable routes below come only from the authorized server
          response. Public text: at most {maxText} characters. Microphone
          preview: first {maxSeconds} seconds, canonical PCM WAV. The lesson’s offline narration is independent of these provider auditions. A silent QA signal is not a voice audition.
        </p>
        {status && (
          <>
            <p>
              Approval envelope: {money(status.maximumTotalCostMicros)} maximum;{' '}
              {money(status.reservedCostPerCallMicros)} conservatively reserved
              per call. Failed and interrupted calls may consume a reservation.
            </p>
            <p>{status.privacy.providerRetention}</p>
          </>
        )}
      </details>
      <fieldset disabled={!ready || busy}>
        <legend>Speech audition</legend>
        <label htmlFor={`${id}-route`}>Effective provider / model</label>
        <select
          id={`${id}-route`}
          value={route?.routeId ?? ''}
          onChange={(event) => {
            preview.cancel();
            setRouteId(event.target.value);
            setVoiceName('');
          }}
        >
          <option value="" disabled>
            {route ? 'Choose route' : 'No authorized speech route'}
          </option>
          {status?.tts.map((candidate) => (
            <option key={candidate.routeId} value={candidate.routeId}>
              {candidate.providerKey} / {candidate.modelKey}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-voice`}>Supported voice</label>
        <select
          id={`${id}-voice`}
          value={voice}
          onChange={(event) => { preview.cancel(); setVoiceName(event.target.value); }}
        >
          <option value="" disabled>
            {voice ? 'Choose voice' : 'No authorized voice'}
          </option>
          {route?.voices.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {route && (
          <p>
            Effective selection: {route.providerKey} / {route.modelKey} /{' '}
            {voice || 'unavailable'}. Format: {route.format ?? 'unavailable'}.
            Maximum sample estimate: {money(route.estimatedCostMicros)}.
          </p>
        )}
        <label htmlFor={`${id}-text`}>
          Public test text · reuse unchanged text to compare voices
        </label>
        <textarea
          id={`${id}-text`}
          rows={3}
          value={text}
          maxLength={maxText}
          onChange={(event) => {
            setText(event.target.value);
            setPublicText(false);
          }}
        />
        {publicReply?.trim() && (
          <ActionButton
            variant="secondary"
            onClick={() => {
              setText(publicReply.trim().slice(0, maxText));
              setPublicText(false);
            }}
          >
            Use current fixture reply as test text
          </ActionButton>
        )}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={publicText}
            onChange={(event) => setPublicText(event.target.checked)}
          />
          This is public test text, with no student data or assessment content.
        </label>
        <ActionButton
          disabled={!route || !voice || !publicText || !text.trim()}
          onClick={() => {
            if (route) void preview.generate(route.routeId, voice, text);
          }}
        >
          Generate and play new speech
        </ActionButton>
      </fieldset>
      <p className={styles.status} role="status" aria-live="polite">
        {outputActive
          ? presentation.speech.preview?.paused ? 'Speech preview is paused.' : presentation.speech.phase === 'speaking'
            ? 'Speech preview is playing.'
            : presentation.speech.phase === 'stalled'
              ? 'Audio is waiting for data.'
              : 'Loading speech preview…'
          : labels[preview.phase]}
      </p>
      {outputActive && (
        <p className={styles.sampleText}>
          {presentation.speech.preview?.caption}
        </p>
      )}
      {outputActive && presentation.speech.duration && (
        <progress
          aria-label="Speech preview playback"
          max={presentation.speech.duration}
          value={presentation.speech.currentTime}
        />
      )}
      <div className={styles.actions}>
        {outputActive && <ActionButton variant="secondary" disabled={busy || disabled || !presentation.speech.duration}
          onClick={() => presentation.speech.preview?.paused ? controller.resumeVoicePreview() : controller.pauseVoicePreview()}>
          {presentation.speech.preview?.paused ? 'Resume sample' : 'Pause sample'}
        </ActionButton>}
        <ActionButton
          variant="secondary"
          disabled={!busy && !outputActive}
          onClick={preview.cancel}
        >
          Stop / cancel
        </ActionButton>
        <ActionButton
          variant="secondary"
          disabled={!preview.samples.length && !preview.transcript}
          onClick={preview.clear}
        >
          Clear previews
        </ActionButton>
      </div>
      {presentation.speech.reason && (
        <p role="status">{presentation.speech.reason}</p>
      )}
      {preview.samples.length > 0 && (
        <section aria-label="Generated voice samples">
          <h4>Samples in this tab</h4>
          {preview.samples.map((sample, index) => (
            <article className={styles.sample} key={index}>
              <p className={styles.sampleText}>{sample.transcript}</p>
              <Receipt receipt={sample} />
              <ActionButton
                variant="secondary"
                disabled={busy || disabled}
                onClick={() => preview.replay(sample)}
              >
                Replay previously generated sample {index + 1} · {sample.effective.voice}
              </ActionButton>
            </article>
          ))}
        </section>
      )}
      <p>Cedar / Marin comparison: select each voice on a qualified route and generate a new sample using the same public sentence. Replaying a saved sample preserves its original voice.</p>
      <fieldset disabled={!ready || busy}>
        <legend>Microphone transcription</legend>
        <label htmlFor={`${id}-stt`}>
          Effective transcription provider / model
        </label>
        <select
          id={`${id}-stt`}
          value={stt?.routeId ?? ''}
          onChange={(event) => setSttId(event.target.value)}
        >
          <option value="" disabled>
            {stt ? 'Choose route' : 'No authorized transcription route'}
          </option>
          {status?.stt.map((candidate) => (
            <option key={candidate.routeId} value={candidate.routeId}>
              {candidate.providerKey} / {candidate.modelKey}
            </option>
          ))}
        </select>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          I consent to a public test recording being sent to the displayed
          transcription provider.
        </label>
        <p>
          Recording starts only when you press Start recording and grant browser
          permission. Stops after {maxSeconds} seconds. Cancel discards unsent
          recording. Review and correct the transcript before using it as a
          fixture question.
        </p>
        <ActionButton
          disabled={!stt || !consent}
          onClick={() => {
            if (stt) void preview.startRecording(stt.routeId);
          }}
        >
          Start recording
        </ActionButton>
      </fieldset>
      {preview.phase === 'recording' && (
        <ActionButton onClick={preview.stopRecording}>
          Stop and transcribe
        </ActionButton>
      )}
      {preview.transcription && (
        <div className={styles.transcript}>
          <label htmlFor={`${id}-transcript`}>
            Correct recognized transcript
          </label>
          <textarea
            id={`${id}-transcript`}
            rows={3}
            maxLength={2000}
            value={preview.transcript}
            onChange={(event) => preview.setTranscript(event.target.value)}
          />
          <Receipt receipt={preview.transcription} />
          <ActionButton
            disabled={!preview.transcript.trim() || disabled}
            onClick={() => {
              preview.cancel();
              onTranscript(preview.transcript.trim());
            }}
          >
            Use as fixture question
          </ActionButton>
          <p>
            The ordinary question field receives this text. Its response uses
            the existing simulated fixture dialogue.
          </p>
        </div>
      )}
      {preview.error && (
        <p className={styles.error} role="alert">
          {preview.error} Your lesson checkpoint is preserved.
        </p>
      )}
      <p className={styles.receipt}>
        Samples and corrected transcripts stay in this tab and are cleared on
        reload. Cancelling stops local playback immediately and aborts the
        browser request; provider billing may already have started. No word or
        mouth timing is inferred.
      </p>
    </div>
  );
}
