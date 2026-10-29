'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PetrosMediaObject, PetrosSpeechTranscription } from '@edrion/schemas';
import {
  formatApiError,
  newIdempotencyKey,
  useStudentApi,
} from '@/lib/api-client';
import type { PetrosSpeechOptions, PetrosSpeechReceipt } from './petros-speech-types';

type ProcessedVoice = {
  media: PetrosMediaObject;
  transcription: PetrosSpeechTranscription | null;
};

export type PetrosSpeechWord = {
  text: string;
  lineIndex: number;
  start: number;
  end: number;
};

export type PetrosSpeechLifecycle = {
  onStarted?: () => void;
  onEnded?: () => void;
  onError?: () => void;
};

const MAX_RECORDING_MS = 120_000;

export type PetrosVoicePhase =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'preparing'
  | 'speaking';

function preferredAudioMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  return [
    'audio/webm;codecs=opus',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/ogg;codecs=opus',
  ].find((mime) => MediaRecorder.isTypeSupported?.(mime)) ?? '';
}

function audioExtension(mime: string) {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

/**
 * Builds a duration-independent speech timeline. The live audio duration is applied as a
 * percentage, so highlighting follows the actual player even when voice speed changes.
 */
export function buildPetrosSpeechTimeline(text: string): PetrosSpeechWord[] {
  const chunks = text
    .trim()
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const weighted = chunks.flatMap((line, lineIndex) =>
    line.split(/\s+/).filter(Boolean).map((word) => ({
      text: word,
      lineIndex,
      weight: Math.max(1, word.replace(/[^\p{L}\p{N}]/gu, '').length * 0.32)
        + (/[.!?]$/.test(word) ? 1.5 : /[,;:]$/.test(word) ? 0.65 : 0),
    })),
  );
  const total = weighted.reduce((sum, word) => sum + word.weight, 0) || 1;
  let cursor = 0;
  return weighted.map((word) => {
    const start = cursor / total;
    cursor += word.weight;
    return { text: word.text, lineIndex: word.lineIndex, start, end: cursor / total };
  });
}

/**
 * Direct, turn-based voice for the embodied portal character. Recording is always initiated
 * by the student, stops when the page backgrounds, and interrupts any current Petros speech.
 */
export function usePetrosVoice(onTranscript: (text: string) => void | Promise<void>, options: {
  voice?: string;
  speed?: number;
  language?: string;
} = {}) {
  const api = useStudentApi();
  const callbackRef = useRef(onTranscript);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechAbortRef = useRef<AbortController | null>(null);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const [voiceOptions, setVoiceOptions] = useState<PetrosSpeechOptions | null>(null);
  const [localVoice, setLocalVoice] = useState('cedar');
  const selectedVoice = options.voice ?? localVoice;
  const canSpeak = voiceOptions?.state === 'ready' && voiceOptions.voices.includes(selectedVoice);
  const selectionReason = !voiceOptions ? 'Loading available speech voices…' : voiceOptions.state !== 'ready' ? voiceOptions.reason
    : !canSpeak ? `${selectedVoice} is unavailable on ${voiceOptions.modelKey}. Select a supported voice. Your saved preference is unchanged.` : '';
  const [receipt, setReceipt] = useState<PetrosSpeechReceipt | null>(null);
  const recordingGenerationRef = useRef(0);
  const startingRef = useRef(false);
  const [phase, setPhase] = useState<PetrosVoicePhase>('idle');
  const [error, setError] = useState('');
  const [heard, setHeard] = useState('');
  const [spokenText, setSpokenText] = useState('');
  const [speechProgress, setSpeechProgress] = useState(0);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);

  const updateSpeechProgress = useCallback((player: HTMLAudioElement, text: string) => {
    const duration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
    const progress = duration ? Math.min(1, Math.max(0, player.currentTime / duration)) : 0;
    const words = buildPetrosSpeechTimeline(text);
    const index = words.findIndex((word) => progress >= word.start && progress < word.end);
    const safeIndex = index >= 0 ? index : progress >= 1 ? words.length - 1 : 0;
    setSpeechProgress(progress);
    setActiveWordIndex(words.length ? safeIndex : -1);
    setActiveLineIndex(words[safeIndex]?.lineIndex ?? -1);
  }, []);

  useEffect(() => {
    callbackRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const controller = new AbortController();
    void api.get<PetrosSpeechOptions>('/student/petros/companion/speech/voices', controller.signal).then(result => {
      if (!controller.signal.aborted) setVoiceOptions(result);
    }).catch(() => { if (!controller.signal.aborted) setVoiceOptions({ state: 'unavailable', voices: [], reason: 'Available speech voices could not be loaded. You can keep using text.' }); });
    return () => controller.abort();
  }, [api]);

  const stopSpeaking = useCallback(() => {
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    if (audioRef.current) {
      audioRef.current.onplay = null;
      audioRef.current.onplaying = null;
      audioRef.current.onpause = null;
      audioRef.current.onwaiting = null;
      audioRef.current.onstalled = null;
      audioRef.current.ontimeupdate = null;
      audioRef.current.onloadedmetadata = null;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setSpeechProgress(0);
    setActiveWordIndex(-1);
    setActiveLineIndex(-1);
    setPhase((current) => (current === 'speaking' || current === 'preparing' ? 'idle' : current));
  }, []);

  useEffect(() => { stopSpeaking(); setReceipt(null); }, [selectedVoice, stopSpeaking]);

  const stopTracks = useCallback(() => {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const finishRecording = useCallback(
    async (mime: string, generation: number) => {
      stopTracks();
      const durationSeconds = Math.min(120, Math.max(0.25, (Date.now() - startedAtRef.current) / 1_000));
      const blob = new Blob(chunksRef.current, { type: mime.split(';')[0] });
      chunksRef.current = [];
      if (!blob.size) {
        setError('I could not hear anything. Check your microphone and try again.');
        setPhase('idle');
        return;
      }
      setPhase('transcribing');
      const controller = new AbortController();
      transcriptionAbortRef.current?.abort();
      transcriptionAbortRef.current = controller;
      const deadline = setTimeout(() => controller.abort(), 60_000);
      try {
        const intent = await api.post<{
          media: PetrosMediaObject;
          upload: { url: string };
        }>('/student/petros/media/intents', {
          kind: 'voice_turn',
          filename: `portal-voice.${audioExtension(blob.type)}`,
          declaredMimeType: blob.type,
          sizeBytes: blob.size,
          durationSeconds,
          width: null,
          height: null,
          pageIndex: 0,
          idempotencyKey: newIdempotencyKey(),
        }, undefined, controller.signal);
        if (controller.signal.aborted || generation !== recordingGenerationRef.current) return;
        const uploaded = (await api.uploadPetrosMedia(intent.upload.url, blob, {
          idempotencyKey: newIdempotencyKey(),
          signal: controller.signal,
        })) as PetrosMediaObject;
        if (controller.signal.aborted || generation !== recordingGenerationRef.current) return;
        const processed = await api.post<ProcessedVoice>(
          `/student/petros/media/${uploaded.id}/process`,
          { idempotencyKey: newIdempotencyKey(), language: options.language ?? 'en' },
          undefined, controller.signal,
        );
        if (controller.signal.aborted || generation !== recordingGenerationRef.current) return;
        const text = processed.transcription?.text.trim();
        if (!text) throw new Error('I could not turn that recording into words. Try once more.');
        setHeard(text);
        setPhase('idle');
        await callbackRef.current(text);
      } catch (caught) {
        if (generation !== recordingGenerationRef.current) return;
        setError(controller.signal.aborted ? 'Transcription timed out. Your typed question is still available.' : formatApiError(caught));
        setPhase('idle');
      } finally {
        clearTimeout(deadline);
        if (transcriptionAbortRef.current === controller) transcriptionAbortRef.current = null;
      }
    },
    [api, options.language, stopTracks],
  );

  const stopListening = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
    else {
      stopTracks();
      setPhase('idle');
    }
  }, [stopTracks]);

  const cancelListening = useCallback(() => {
    recordingGenerationRef.current += 1;
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      if (recorder.state === 'recording') recorder.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    stopTracks();
    setPhase('idle');
  }, [stopTracks]);

  const startListening = useCallback(async () => {
    if (phase === 'listening') {
      stopListening();
      return;
    }
    if (phase === 'transcribing' || startingRef.current) return;
    startingRef.current = true;
    const generation = ++recordingGenerationRef.current;
    stopSpeaking();
    setError('');
    setHeard('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Microphone conversation is not supported in this browser. Type to Petros instead.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (generation !== recordingGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mime = preferredAudioMime();
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void finishRecording(recorder.mimeType || mime || 'audio/webm', generation);
      };
      recorder.onerror = () => {
        if (generation !== recordingGenerationRef.current) return;
        cancelListening();
        setError('Recording failed. You can keep using your typed question.');
      };
      startedAtRef.current = Date.now();
      recorder.start(250);
      recordingTimerRef.current = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, MAX_RECORDING_MS);
      setPhase('listening');
    } catch (caught) {
      if (generation !== recordingGenerationRef.current) return;
      stopTracks();
      setError(caught instanceof Error ? caught.message : 'Microphone permission was denied.');
      setPhase('idle');
    } finally {
      startingRef.current = false;
    }
  }, [cancelListening, finishRecording, phase, stopListening, stopSpeaking, stopTracks]);

  const speak = useCallback(
    async (text: string, lifecycle: PetrosSpeechLifecycle = {}) => {
      const transcript = text.trim();
      if (!transcript) return;
      if (!canSpeak) { setError(selectionReason); lifecycle.onError?.(); return; }
      cancelListening();
      stopSpeaking();
      setError('');
      setSpokenText(transcript);
      setSpeechProgress(0);
      setActiveWordIndex(-1);
      setActiveLineIndex(-1);
      const controller = new AbortController();
      speechAbortRef.current = controller;
      const deadline = setTimeout(() => {
        controller.abort();
        if (speechAbortRef.current === controller) {
          setPhase('idle'); setError('Speech preparation timed out. The text remains available.');
        }
      }, 45_000);
      setPhase('preparing');
      try {
        const result = await api.post<PetrosSpeechReceipt & {
          audio: { dataBase64: string; mimeType: string };
          transcript: string;
        }>('/student/petros/companion/speech', { text: transcript.slice(0, 2_000), voice: selectedVoice, speed: options.speed ?? 1 }, undefined, controller.signal);
        if (controller.signal.aborted || typeof Audio === 'undefined') return;
        if (result.requestedVoice !== selectedVoice || result.effective?.voice !== selectedVoice || result.fallback?.voice !== false ||
          !result.effective.modelKey || !result.effective.providerKey || !result.effective.routeId) throw new Error('The speech receipt does not match the selected voice. Refresh available voices.');
        setReceipt(result);
        const player = new Audio(
          `data:${result.audio.mimeType};base64,${result.audio.dataBase64}`,
        );
        audioRef.current = player;
        player.onplaying = () => {
          if (audioRef.current !== player) return;
          setPhase('speaking');
          updateSpeechProgress(player, transcript);
          lifecycle.onStarted?.();
        };
        player.onpause = () => {
          if (audioRef.current === player) setPhase('idle');
        };
        player.onwaiting = player.onstalled = () => {
          if (audioRef.current === player) setPhase('preparing');
        };
        player.onloadedmetadata = () => {
          if (audioRef.current === player) updateSpeechProgress(player, transcript);
        };
        player.ontimeupdate = () => {
          if (audioRef.current === player) updateSpeechProgress(player, transcript);
        };
        player.onended = () => {
          if (audioRef.current !== player) return;
          setSpeechProgress(1);
          audioRef.current = null;
          setPhase('idle');
          lifecycle.onEnded?.();
        };
        player.onerror = () => {
          if (audioRef.current !== player) return;
          audioRef.current = null;
          setError('The reply is on screen, but audio playback is unavailable.');
          setPhase('idle');
          lifecycle.onError?.();
        };
        await player.play();
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error && caught.name === 'NotAllowedError'
          ? 'Your browser paused audio. Press Read aloud to play it.'
          : formatApiError(caught));
        setPhase('idle');
        lifecycle.onError?.();
      } finally {
        clearTimeout(deadline);
        if (speechAbortRef.current === controller) speechAbortRef.current = null;
      }
    },
    [api, canSpeak, cancelListening, options.speed, selectedVoice, selectionReason, stopSpeaking, updateSpeechProgress],
  );

  useEffect(() => {
    const stopInBackground = () => {
      if (document.hidden) { cancelListening(); stopSpeaking(); }
    };
    document.addEventListener('visibilitychange', stopInBackground);
    window.addEventListener('pagehide', cancelListening);
    return () => {
      document.removeEventListener('visibilitychange', stopInBackground);
      window.removeEventListener('pagehide', cancelListening);
      cancelListening();
      stopSpeaking();
    };
  }, [cancelListening, stopSpeaking]);

  return {
    phase,
    voiceOptions, selectedVoice, canSpeak, selectionReason, receipt,
    selectVoice: (voice: string) => { stopSpeaking(); setLocalVoice(voice); },
    error,
    heard,
    spokenText,
    speechProgress,
    activeWordIndex,
    activeLineIndex,
    listening: phase === 'listening',
    speaking: phase === 'speaking',
    transcribing: phase === 'transcribing',
    preparing: phase === 'preparing',
    clearError: () => setError(''),
    cancelListening,
    startListening,
    stopListening,
    stopSpeaking,
    speak,
  };
}
