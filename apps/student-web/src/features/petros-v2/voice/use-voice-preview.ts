'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatApiError, useStudentApi } from '@/lib/api-client';
import type { PresentationController } from '../presentation-controller';
import { voiceStatusFailure, voiceStatusSchema } from './voice-service-status';
import { prepareVoicePreviewRecording } from './voice-preview-audio';
import type {
  VoicePreviewSample,
  VoicePreviewStatus,
  VoicePreviewTranscription,
} from './voice-preview-types';

const ENDPOINT = '/student/petros/companion/voice-preview';
type PreviewPhase =
  | 'idle'
  | 'generating'
  | 'permission_requested'
  | 'recording'
  | 'encoding'
  | 'transcribing';

/** Captures/uploads only following explicit UI actions. The presentation owner
 * retains exclusive audio playback, cancellation epoch and teaching checkpoint. */
export function useVoicePreview(
  controller: PresentationController,
  onRecordingChange?: (recording: boolean) => void,
  enabled = false,
) {
  const api = useStudentApi();
  const [status, setStatus] = useState<VoicePreviewStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [phase, setPhase] = useState<PreviewPhase>('idle');
  const [error, setError] = useState('');
  const [samples, setSamples] = useState<VoicePreviewSample[]>([]);
  const [transcript, setTranscript] = useState('');
  const [transcription, setTranscription] =
    useState<VoicePreviewTranscription | null>(null);
  const recordingCallback = useRef(onRecordingChange);
  recordingCallback.current = onRecordingChange;
  const generation = useRef(0),
    statusAbort = useRef<AbortController | null>(null);
  const pending = useRef<{ abort: AbortController; epoch: number } | null>(
    null,
  );
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    chunks = useRef<Blob[]>([]);
  const limitTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRequestTimer = useCallback(() => {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    requestTimer.current = null;
  }, []);

  const stopTracks = useCallback(() => {
    if (limitTimer.current) clearTimeout(limitTimer.current);
    limitTimer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recordingCallback.current?.(false);
  }, []);
  const cancel = useCallback(() => {
    generation.current++;
    clearRequestTimer();
    pending.current?.abort.abort();
    pending.current = null;
    const activeRecorder = recorder.current;
    recorder.current = null;
    if (activeRecorder) {
      activeRecorder.ondataavailable = null;
      activeRecorder.onstop = null;
      activeRecorder.onerror = null;
      if (activeRecorder.state !== 'inactive') activeRecorder.stop();
    }
    chunks.current = [];
    stopTracks();
    controller.stopVoicePreview();
    setPhase('idle');
  }, [clearRequestTimer, controller, stopTracks]);

  const refresh = useCallback(async () => {
    statusAbort.current?.abort();
    const abort = new AbortController();
    statusAbort.current = abort;
    setStatus(null);
    cancel();
    setLoadingStatus(true);
    setError('');
    const timeout = setTimeout(() => {
      if (statusAbort.current !== abort || abort.signal.aborted) return;
      abort.abort(new DOMException('Voice status timeout', 'TimeoutError'));
      setStatus(null); setError(voiceStatusFailure(abort.signal.reason)); setLoadingStatus(false);
    }, 8000);
    try {
      const raw = await api.get<unknown>(
        `${ENDPOINT}/status`,
        abort.signal,
      );
      const parsed = voiceStatusSchema.safeParse(raw);
      if (!parsed.success) throw Object.assign(new Error('Invalid voice status'), { code: 'INVALID_VOICE_STATUS' });
      if (!abort.signal.aborted) setStatus(parsed.data);
    } catch (caught) {
      if (statusAbort.current === abort && (!abort.signal.aborted || abort.signal.reason?.name === 'TimeoutError')) {
        setStatus(null);
        setError(voiceStatusFailure(abort.signal.aborted ? abort.signal.reason : caught));
      }
    } finally {
      clearTimeout(timeout);
      if (statusAbort.current === abort) setLoadingStatus(false);
    }
  }, [api, cancel]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const unsubscribe = controller.subscribe(() => {
      if (
        pending.current &&
        pending.current.epoch !== controller.getSnapshot().epoch
      )
        cancel();
    });
    const hide = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', cancel);
    return () => {
      unsubscribe();
      statusAbort.current?.abort();
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', cancel);
      cancel();
    };
  }, [cancel, controller, enabled, refresh]);

  const generate = useCallback(
    async (routeId: string, voice: string, text: string) => {
      const route = status?.tts.find(
        (candidate) => candidate.routeId === routeId,
      );
      if (status?.state !== 'ready' || !route?.voices.includes(voice)) {
        setError(
          'This effective voice route is not authorized. Refresh route status or continue in text.',
        );
        return;
      }
      const approvedText = text.trim();
      if (
        !approvedText ||
        approvedText.length > Math.min(500, status.limits.maxTextCharacters)
      ) {
        setError(
          'Enter public test text within the displayed character limit.',
        );
        return;
      }
      cancel();
      setError('');
      setPhase('generating');
      const id = ++generation.current,
        abort = new AbortController();
      const epoch = controller.prepareVoicePreview(approvedText);
      pending.current = { abort, epoch };
      requestTimer.current = setTimeout(() => {
        if (pending.current?.abort === abort) {
          cancel();
          setError(
            'Voice generation timed out. Continue in text or refresh status before retrying.',
          );
        }
      }, 45000);
      try {
        const result = await api.post<VoicePreviewSample>(
          `${ENDPOINT}/speech`,
          { routeId, voice, text: approvedText, speed: 1 },
          undefined,
          abort.signal,
        );
        if (
          abort.signal.aborted ||
          generation.current !== id ||
          controller.getSnapshot().epoch !== epoch
        )
          return;
        if (
          result.effective.routeId !== routeId ||
          result.effective.voice !== voice ||
          result.effective.providerKey !== route.providerKey ||
          result.effective.modelKey !== route.modelKey
          || result.requestedVoice !== voice || result.fallback?.voice !== false
        )
          throw new Error(
            'The effective route differs from the selection. Audio was discarded; refresh routes before retrying.',
          );
        if (result.transcript !== approvedText)
          throw new Error(
            'The generated transcript differs from the approved test text. Audio was discarded.',
          );
        setSamples((current) => [...current, result].slice(-6));
        pending.current = null;
        clearRequestTimer();
        setPhase('idle');
        controller.playVoicePreview(
          { ...result.audio, caption: result.transcript },
          epoch,
        );
      } catch (caught) {
        if (abort.signal.aborted || generation.current !== id) return;
        pending.current = null;
        clearRequestTimer();
        controller.stopVoicePreview();
        setError(formatApiError(caught));
        setPhase('idle');
      }
    },
    [api, cancel, clearRequestTimer, controller, status],
  );

  const replay = useCallback(
    (sample: VoicePreviewSample) => {
      cancel();
      setError('');
      const epoch = controller.prepareVoicePreview(sample.transcript);
      try {
        controller.playVoicePreview(
          { ...sample.audio, caption: sample.transcript },
          epoch,
        );
      } catch (caught) {
        controller.stopVoicePreview();
        setError(formatApiError(caught));
      }
    },
    [cancel, controller],
  );

  const startRecording = useCallback(
    async (routeId: string) => {
      const route = status?.stt.find(candidate => candidate.routeId === routeId);
      if (status?.state !== 'ready' || !route) {
        setError(
          'Microphone transcription requires an authorized route. You can always type a question.',
        );
        return;
      }
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined'
      ) {
        setError(
          'Microphone capture is unavailable in this browser. Type your question instead.',
        );
        return;
      }
      cancel();
      controller.interrupt();
      setError('');
      setTranscript('');
      setTranscription(null);
      setPhase('permission_requested');
      const id = ++generation.current,
        abort = new AbortController(),
        epoch = controller.getSnapshot().epoch;
      pending.current = { abort, epoch };
      const active = () =>
        !abort.signal.aborted &&
        generation.current === id &&
        controller.getSnapshot().epoch === epoch;
      requestTimer.current = setTimeout(() => {
        if (pending.current?.abort === abort) { cancel(); setError('Microphone permission timed out. Try again or type your question.'); }
      }, 20000);
      try {
        const capture = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (!active()) {
          capture.getTracks().forEach((track) => track.stop());
          return;
        }
        clearRequestTimer();
        stream.current = capture;
        const mime = [
          'audio/webm;codecs=opus',
          'audio/mp4;codecs=mp4a.40.2',
          'audio/ogg;codecs=opus',
        ].find((candidate) => MediaRecorder.isTypeSupported?.(candidate));
        const recording = new MediaRecorder(
          capture,
          mime ? { mimeType: mime } : undefined,
        );
        recorder.current = recording;
        chunks.current = [];
        recording.ondataavailable = (event) => {
          if (active() && event.data.size) chunks.current.push(event.data);
        };
        recording.onerror = () => {
          if (active()) {
            cancel();
            setError('Recording failed. Type your question or try again.');
          }
        };
        recording.onstop = () => {
          stopTracks();
          recorder.current = null;
          if (!active()) return;
          const audio = new Blob(chunks.current, {
            type: recording.mimeType || mime || 'audio/webm',
          });
          chunks.current = [];
          setPhase('encoding');
          requestTimer.current = setTimeout(() => {
            if (pending.current?.abort === abort) {
              cancel();
              setError(
                'Transcription timed out. Your typed question remains available.',
              );
            }
          }, 45000);
          void (async () => {
            try {
              const prepared = await prepareVoicePreviewRecording(
                audio,
                Math.min(330000, status.limits.maxAudioBytes),
                Math.min(10, status.limits.maxRecordingSeconds),
              );
              if (!active()) return;
              setPhase('transcribing');
              const result = await api.post<VoicePreviewTranscription>(
                `${ENDPOINT}/transcription`,
                { routeId, audio: prepared, consent: true },
                undefined,
                abort.signal,
              );
              if (!active()) return;
              if (result.effective.routeId !== routeId || result.effective.providerKey !== route.providerKey || result.effective.modelKey !== route.modelKey)
                throw new Error(
                  'The transcription route changed. Refresh status before retrying.',
                );
              if (typeof result.transcript !== 'string' || result.transcript.length > 2000 || !result.transcript.trim())
                throw new Error(
                  'No words were recognized. Try again or type your question.',
                );
              setTranscript(result.transcript.trim());
              setTranscription(result);
              pending.current = null;
              clearRequestTimer();
              setPhase('idle');
            } catch (caught) {
              if (!active()) return;
              pending.current = null;
              clearRequestTimer();
              setError(formatApiError(caught));
              setPhase('idle');
            }
          })();
        };
        recording.start(250);
        setPhase('recording');
        recordingCallback.current?.(true);
        limitTimer.current = setTimeout(
          () => {
            if (active() && recording.state === 'recording') recording.stop();
          },
          Math.min(10, status.limits.maxRecordingSeconds) * 1000,
        );
      } catch (caught) {
        if (!active()) return;
        pending.current = null;
        clearRequestTimer();
        stopTracks();
        setPhase('idle');
        setError(
          caught &&
            typeof caught === 'object' &&
            'name' in caught &&
            caught.name === 'NotAllowedError'
            ? 'Microphone permission was denied. You can type your question instead.'
            : formatApiError(caught),
        );
      }
    },
    [api, cancel, clearRequestTimer, controller, status, stopTracks],
  );

  const stopRecording = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);
  const clear = () => {
    cancel();
    setSamples([]);
    setTranscript('');
    setTranscription(null);
    setError('');
  };
  return {
    status,
    loadingStatus,
    phase,
    error,
    samples,
    transcript,
    transcription,
    setTranscript,
    refresh,
    generate,
    replay,
    startRecording,
    stopRecording,
    cancel,
    clear,
  };
}
