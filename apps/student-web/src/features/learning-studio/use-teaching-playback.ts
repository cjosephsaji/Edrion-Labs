'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  PetrosPlaybackCheckpoint,
  PetrosTeachingPresentation,
} from '@edrion/schemas';

export function useTeachingPlayback(
  presentation: PetrosTeachingPresentation,
  options: {
    initialCheckpoint?: PetrosPlaybackCheckpoint | null;
    onCheckpoint?: (checkpoint: PetrosPlaybackCheckpoint) => void;
  } = {},
) {
  const onCheckpoint = options.onCheckpoint;
  const restoredIndex = Math.max(
    0,
    presentation.beats.findIndex((beat) => beat.id === options.initialCheckpoint?.beatId),
  );
  const [index, setIndex] = useState(restoredIndex);
  const [mode, setMode] = useState<'voice' | 'quiet'>(options.initialCheckpoint?.mode ?? 'voice');
  const [status, setStatus] = useState<'idle' | 'playing' | 'paused' | 'interrupted'>('idle');
  const [caption, setCaption] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const interruptedStatus = useRef<'idle' | 'playing' | 'paused'>('paused');
  const beat = presentation.beats[index]!;

  const stopDeviceNarration = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const stopAudio = useCallback(() => {
    audio.current?.pause();
    stopDeviceNarration();
  }, [stopDeviceNarration]);

  const play = useCallback(() => {
    setCaption(beat.narration);
    if (mode === 'quiet') {
      setStatus('paused');
      return;
    }
    setStatus('playing');
    if (beat.audioSrc) {
      const current = audio.current?.src === new URL(beat.audioSrc, window.location.href).href
        ? audio.current
        : new Audio(beat.audioSrc);
      audio.current = current;
      current.onended = () => setStatus('paused');
      current.onpause = () => setStatus((value) => (value === 'interrupted' ? value : 'paused'));
      void current.play().catch(() => setStatus('paused'));
      return;
    }
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(beat.narration);
      utterance.rate = 0.96;
      utterance.onend = () => setStatus('paused');
      utterance.onerror = () => setStatus('paused');
      window.speechSynthesis.speak(utterance);
    } else {
      setStatus('paused');
    }
  }, [beat.audioSrc, beat.narration, mode]);

  const pause = useCallback(() => {
    audio.current?.pause();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.pause();
    setStatus('paused');
  }, []);

  const replay = useCallback(() => {
    stopAudio();
    if (audio.current) audio.current.currentTime = 0;
    play();
  }, [play, stopAudio]);

  const move = useCallback(
    (next: number) => {
      stopAudio();
      setIndex(Math.min(Math.max(next, 0), presentation.beats.length - 1));
      setStatus('idle');
    },
    [presentation.beats.length, stopAudio],
  );

  const interrupt = useCallback(() => {
    interruptedStatus.current = status === 'playing' ? 'playing' : status === 'idle' ? 'idle' : 'paused';
    stopAudio();
    setStatus('interrupted');
  }, [status, stopAudio]);

  const resume = useCallback(() => {
    setStatus('paused');
    if (interruptedStatus.current === 'playing') play();
  }, [play]);

  useEffect(() => {
    onCheckpoint?.({
      presentationVersion: presentation.schemaVersion,
      unitId: presentation.unitId,
      beatId: beat.id,
      mode,
    });
  }, [beat.id, mode, onCheckpoint, presentation.schemaVersion, presentation.unitId]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && status === 'playing') pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pause, status]);

  useEffect(() => () => stopAudio(), [stopAudio]);

  return useMemo(
    () => ({
      beat,
      index,
      mode,
      status,
      caption,
      isFirst: index === 0,
      isLast: index === presentation.beats.length - 1,
      play,
      pause,
      replay,
      previous: () => move(index - 1),
      next: () => move(index + 1),
      setMode: (next: 'voice' | 'quiet') => {
        stopAudio();
        setMode(next);
        setStatus('idle');
      },
      interrupt,
      resume,
    }),
    [beat, caption, index, interrupt, mode, move, pause, play, presentation.beats.length, replay, resume, status, stopAudio],
  );
}
