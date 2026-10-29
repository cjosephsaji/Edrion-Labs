'use client';

import { useEffect, useRef, useState } from 'react';
import { ActionButton } from '@/components/design-system/action-button';
import type { PresentationController, PresentationState } from '../presentation-controller';
import assets from '../../../../public/petros/audio/spoken-fixtures.json';
import type { useVoicePreview } from './use-voice-preview';
import styles from './voice-preview.module.css';

export function TeachingVoiceControls({ controller, state, session, reply, replyKey, narrationEnabled, disabled, onTranscript }: {
  controller: PresentationController; state: PresentationState; session: ReturnType<typeof useVoicePreview>;
  reply: string | null; replyKey: number; narrationEnabled: boolean; disabled: boolean; onTranscript: (text: string) => void;
}) {
  const [consent, setConsent] = useState(false), [paidReply, setPaidReply] = useState(false);
  const [voice, setVoice] = useState('');
  const handledReply = useRef<{ text: string | null; key: number } | null>(null), handledTranscript = useRef<object | null>(null);
  const local = assets.responses.find(sample => sample.text === reply);
  const route = session.status?.tts[0], stt = session.status?.stt[0];
  const selectedVoice = route?.voices.includes(voice) ? voice : route?.voices[0] ?? '';
  const saved = [...session.samples].reverse().find(sample => sample.transcript === reply && sample.effective.routeId === route?.routeId && sample.effective.voice === selectedVoice);
  const ready = session.status?.state === 'ready' && !session.loadingStatus && !disabled;
  const busy = session.phase !== 'idle';
  const recording = session.phase === 'recording';
  useEffect(() => {
    if (handledReply.current?.text === reply && handledReply.current?.key === replyKey) return;
    handledReply.current = { text: reply, key: replyKey };
    setPaidReply(false);
    // Only shipped public audio autoplays. Enabling narration never authorizes paid synthesis.
    if (reply && local && narrationEnabled && !disabled)
      controller.playLocalResponse({ ...local, mimeType: 'audio/mpeg', provenance: 'approved-local-fixture' });
  }, [reply, replyKey, local, controller, narrationEnabled, disabled]);
  useEffect(() => {
    if (!session.transcription || handledTranscript.current === session.transcription) return;
    handledTranscript.current = session.transcription;
    onTranscript(session.transcript);
  }, [session.transcription, session.transcript, onTranscript]);
  const output = Boolean(state.speech.preview);
  return <div className={styles.content} data-teaching-voice>
    <label className={styles.check}><input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); if (!event.target.checked) session.cancel(); }} disabled={!ready || !stt || disabled} />
      Send a public test question for transcription. No private learner or assessment content.
    </label>
    <div className={styles.actions}>
      {recording ? <ActionButton onClick={session.stopRecording}>Stop and transcribe question</ActionButton>
        : <ActionButton variant="secondary" disabled={!consent || !ready || !stt || busy} onClick={() => { if (stt) void session.startRecording(stt.routeId); }}>Record question</ActionButton>}
      {busy && <ActionButton variant="secondary" onClick={session.cancel}>Cancel voice action</ActionButton>}
    </div>
    <p role="status" aria-live="polite">{recording ? 'Recording · microphone is active. Stops after ten seconds.'
      : session.phase === 'permission_requested' ? 'Waiting for microphone permission…'
      : session.phase === 'encoding' || session.phase === 'transcribing' ? 'Transcribing your question…'
      : session.transcription ? 'Transcript copied to Your question. Review and edit it, then press Send question.'
      : !stt ? session.loadingStatus ? 'Checking spoken-question availability…' : session.status?.reason || session.error || 'Spoken questions unavailable. Type your question.'
      : 'Record only when you choose. Review the transcript before sending.'}</p>
    {reply && <div aria-label="Response speech">
      <div className={styles.actions}>
        <ActionButton variant="secondary" disabled={disabled || busy || (!local && !saved)} onClick={() => {
          if (local) controller.playLocalResponse({ ...local, mimeType: 'audio/mpeg', provenance: 'approved-local-fixture' });
          else if (saved) session.replay(saved);
        }}>Replay response</ActionButton>
        {output && <>
          <ActionButton variant="secondary" disabled={busy} onClick={() => state.speech.preview?.paused ? controller.resumeVoicePreview() : controller.pauseVoicePreview()}>{state.speech.preview?.paused ? 'Resume response' : 'Pause response'}</ActionButton>
          <ActionButton variant="secondary" onClick={session.cancel}>Stop response</ActionButton>
        </>}
      </div>
      {!local && !saved && <p>No local audio for this fixture reply. Its full text remains available.</p>}
      {!local && ready && route && reply.length <= 500 && <details>
        <summary>Approved response speech</summary>
        <label>Response voice<select value={selectedVoice} onChange={event => { session.cancel(); setVoice(event.target.value); }}>{route.voices.map(name => <option key={name}>{name}</option>)}</select></label>
        <label className={styles.check}><input type="checkbox" checked={paidReply} onChange={event => setPaidReply(event.target.checked)} />Generate this public fixture reply once; estimated maximum ${(route.estimatedCostMicros / 1_000_000).toFixed(6)}. Server spending approval is required.</label>
        <ActionButton disabled={!paidReply || busy || !selectedVoice} onClick={() => void session.generate(route.routeId, selectedVoice, reply)}>Generate response speech</ActionButton>
      </details>}
    </div>}
    {session.error && session.status && <p role="alert">{session.error} Text questions remain available.</p>}
  </div>;
}
